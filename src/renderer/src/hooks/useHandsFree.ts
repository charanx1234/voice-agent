import { useCallback, useEffect, useRef, useState } from 'react';
import {
  VoiceActivityDetector,
  VadOptions,
  DEFAULT_VAD_OPTIONS,
  BARGE_IN_VAD_OPTIONS,
} from '@/services/voice/voiceActivity';
import { detectLocalWakePhrase } from '@/services/voice/wakeWord';
import { localWakeWordDetector } from '@/services/voice/localWakeWord';
import { speakerVerificationService } from '@/services/voice/speakerVerification';
import { describeMicError } from '@/services/voice/micErrors';
import { EnrolledSpeakerProfile, VoiceProsodySummary } from '@/shared/types';

export type HandsFreeMode = 'off' | 'standby' | 'active';

export interface HandsFreeUtterance {
  audioBase64: string;
  mimeType: string;
  peakLevel: number;
  recognizedText: string;
  prosody: VoiceProsodySummary;
  isVerifiedSpeaker?: boolean;
}

export interface HandsFreeOptions {
  enabled: boolean;
  language?: string;
  silenceTimeoutMs?: number;
  noiseSuppression?: 'off' | 'standard' | 'strong';
  echoCancellation?: boolean;
  autoGainControl?: boolean;
  vadSensitivity?: 'low' | 'medium' | 'high';
  speakerVerificationEnabled?: boolean;
  enrolledVoiceProfile?: EnrolledSpeakerProfile;
  deviceId?: string;
  isSpeaking: () => boolean;
  isBusy: () => boolean;
  onBargeIn: () => void;
  onSpeechActivity: (speaking: boolean) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onLevel?: (level: number) => void;
  onUtterance: (utterance: HandsFreeUtterance) => void;
  onWake: (command: string) => void;
  onError: (message: string) => void;
}

const TICK_MS = 50;
const MIN_UTTERANCE_MS = 400;
const MAX_IDLE_SEGMENT_MS = 8000;
const MAX_UTTERANCE_MS = 30000;
export const ACTIVE_SILENCE_TIMEOUT_MS = 25000;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(((reader.result as string) || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function getVadOptions(sensitivity?: 'low' | 'medium' | 'high'): VadOptions {
  switch (sensitivity) {
    case 'high':
      return {
        startThreshold: 0.065,
        endThreshold: 0.035,
        speechStartMs: 90,
        speechEndMs: 500,
      };
    case 'low':
      return {
        startThreshold: 0.22,
        endThreshold: 0.10,
        speechStartMs: 140,
        speechEndMs: 650,
      };
    case 'medium':
    default:
      return DEFAULT_VAD_OPTIONS;
  }
}

interface Segment {
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
}

function getSpeechRecognition(): any {
  if (typeof window !== 'undefined' && (window as any).fridayAPI) {
    return null;
  }
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
}

/**
 * Single-stream persistent audio pipeline and hands-free listener.
 * Integrates WebRTC AEC/AGC/NoiseSuppression, Biquad human voice bandpass filtering,
 * local offline wake-word pattern matching, and optional local speaker verification.
 */
export function useHandsFree(options: HandsFreeOptions) {
  const [mode, setModeState] = useState<HandsFreeMode>(options.enabled ? 'standby' : 'off');
  const modeRef = useRef<HandsFreeMode>(mode);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const lastActivityRef = useRef(Date.now());
  const startActiveCaptureRef = useRef<() => void>(() => undefined);
  const stopActiveCaptureRef = useRef<() => void>(() => undefined);

  const setMode = useCallback((next: HandsFreeMode) => {
    modeRef.current = next;
    lastActivityRef.current = Date.now();
    setModeState(next);
  }, []);

  const goStandby = useCallback(() => {
    if (modeRef.current !== 'off') {
      stopActiveCaptureRef.current();
      setMode('standby');
    }
  }, [setMode]);

  const wake = useCallback(() => {
    if (modeRef.current !== 'off') {
      setMode('active');
      startActiveCaptureRef.current();
    }
  }, [setMode]);

  useEffect(() => {
    if (!options.enabled) {
      setMode('off');
      return undefined;
    }

    let disposed = false;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let duckingGain: GainNode | null = null;
    let highpass: BiquadFilterNode | null = null;
    let lowpass: BiquadFilterNode | null = null;
    let compressor: DynamicsCompressorNode | null = null;
    let analyser: AnalyserNode | null = null;
    let destination: MediaStreamAudioDestinationNode | null = null;
    let samples = new Float32Array(1024);
    let freqData = new Uint8Array(512);
    let timer: ReturnType<typeof setInterval> | null = null;
    let segment: Segment | null = null;
    let recognition: any = null;
    let normalVad = new VoiceActivityDetector(getVadOptions(options.vadSensitivity));
    let bargeVad = new VoiceActivityDetector(BARGE_IN_VAD_OPTIONS);
    let usingBarge = false;
    let activeSpeechReported = false;
    let recognitionText = '';
    let wakeAnnounced = false;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

    const startSegment = () => {
      const activeStream = destination?.stream || stream;
      if (!activeStream || disposed || segment || modeRef.current !== 'active') return;
      try {
        const recorder = new MediaRecorder(activeStream, { mimeType });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.start(100);
        segment = { recorder, chunks, startedAt: Date.now() };
      } catch (err: any) {
        segment = null;
        optionsRef.current.onError(`Could not start audio recording: ${err?.message || err}`);
      }
    };

    const stopSegment = () => {
      const current = segment;
      segment = null;
      if (!current || current.recorder.state === 'inactive') return;
      try {
        current.recorder.stop();
      } catch {
        // Stream may already be disconnected.
      }
    };

    const cutSegment = (): Promise<Blob | null> => {
      const finished = segment;
      segment = null;
      if (modeRef.current === 'active') startSegment();
      if (!finished) return Promise.resolve(null);

      return new Promise((resolve) => {
        const { recorder, chunks } = finished;
        const done = () => resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
        if (recorder.state === 'inactive') {
          done();
          return;
        }
        recorder.onstop = done;
        try {
          recorder.stop();
        } catch {
          resolve(null);
        }
      });
    };

    startActiveCaptureRef.current = startSegment;
    stopActiveCaptureRef.current = stopSegment;

    const handleWakeTrigger = (command: string) => {
      if (modeRef.current !== 'standby' || wakeAnnounced) return;
      wakeAnnounced = true;
      setMode('active');
      startSegment();
      recognitionText = '';
      optionsRef.current.onWake(command);
    };

    const startRecognition = () => {
      const isElectron = typeof window !== 'undefined' && Boolean((window as any).fridayAPI);
      if (isElectron) return; // In Electron, local acoustic wake detector runs inside tick()
      const SpeechRecognition = getSpeechRecognition();
      if (!SpeechRecognition) return;

      try {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = optionsRef.current.language || 'en-IN';
        if ('processLocally' in recognition) recognition.processLocally = true;
        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = String(event.results[i][0]?.transcript || '').trim();
            if (!transcript) continue;
            if (event.results[i].isFinal) {
              if (modeRef.current === 'standby') {
                const wakeResult = detectLocalWakePhrase(transcript);
                if (wakeResult.wake) handleWakeTrigger(wakeResult.command);
              } else {
                recognitionText = `${recognitionText} ${transcript}`.trim();
                optionsRef.current.onTranscript?.(recognitionText, true);
              }
            } else {
              interim = `${interim} ${transcript}`.trim();
              if (modeRef.current === 'standby') {
                const wakeResult = detectLocalWakePhrase(interim);
                if (wakeResult.wake) handleWakeTrigger(wakeResult.command);
              } else {
                optionsRef.current.onTranscript?.(`${recognitionText} ${interim}`.trim(), false);
              }
            }
          }
        };
        recognition.onerror = (event: any) => {
          if (!disposed && event?.error === 'not-allowed') {
            optionsRef.current.onError('Microphone speech recognition permission was denied.');
          }
        };
        recognition.onend = () => {
          if (!disposed && optionsRef.current.enabled) {
            try {
              recognition.start();
            } catch {}
          }
        };
        recognition.start();
      } catch {
        recognition = null;
      }
    };

    const tick = () => {
      if (disposed || !analyser) return;
      const now = Date.now();
      analyser.getFloatTimeDomainData(samples as any);
      analyser.getByteFrequencyData(freqData);

      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      let level = Math.min(1, Math.sqrt(sum / samples.length) * 5);

      // Report live input level for UI meters & aura
      optionsRef.current.onLevel?.(level);

      const speaking = optionsRef.current.isSpeaking();
      const busy = optionsRef.current.isBusy();
      const currentMode = modeRef.current;

      // Software ducking during assistant speech
      if (duckingGain && audioCtx) {
        const targetGain = speaking && optionsRef.current.echoCancellation !== false ? 0.08 : 1.0;
        duckingGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.05);
      }

      // Standby Local Wake-Word Evaluation (100% offline acoustic pattern matcher)
      if (currentMode === 'standby' && !speaking && !busy) {
        const wakeDetected = localWakeWordDetector.processFrequencyData(
          freqData,
          audioCtx?.sampleRate || 44100
        );
        if (wakeDetected) {
          handleWakeTrigger('');
        }
      }

      if (speaking !== usingBarge) {
        usingBarge = speaking;
        normalVad = new VoiceActivityDetector(getVadOptions(optionsRef.current.vadSensitivity));
        bargeVad = new VoiceActivityDetector(BARGE_IN_VAD_OPTIONS);
      }

      const effectiveLevel = speaking ? level * 0.4 : level;
      const vad = usingBarge ? bargeVad : normalVad;
      let event = vad.update(effectiveLevel, now);
      if (!event && vad.isSpeaking && segment && now - segment.startedAt > MAX_UTTERANCE_MS) {
        event = vad.finish(now);
      }

      if (speaking || busy || vad.isSpeaking) lastActivityRef.current = now;

      if (event?.type === 'start') {
        if (currentMode === 'active') {
          if (speaking || busy) optionsRef.current.onBargeIn();
          if (!activeSpeechReported) {
            activeSpeechReported = true;
            optionsRef.current.onSpeechActivity(true);
          }
        }
      } else if (event?.type === 'end') {
        if (activeSpeechReported) {
          activeSpeechReported = false;
          optionsRef.current.onSpeechActivity(false);
        }

        const { durationMs, peakLevel } = event;
        void cutSegment().then(async (blob) => {
          if (!blob || disposed || durationMs < MIN_UTTERANCE_MS) return;
          if (currentMode !== 'active') return;

          const audioBase64 = await blobToBase64(blob);
          if (!audioBase64 || disposed) return;
          const recognizedText = recognitionText.trim();
          recognitionText = '';
          const wordCount = recognizedText ? recognizedText.split(/\s+/).length : 0;
          const prosody: VoiceProsodySummary = {
            peakLevel,
            durationMs,
            speechRate: durationMs > 0 && wordCount > 0 ? (wordCount / durationMs) * 60_000 : undefined,
          };

          // Speaker verification check
          let isVerified = true;
          if (
            optionsRef.current.speakerVerificationEnabled &&
            optionsRef.current.enrolledVoiceProfile &&
            audioCtx
          ) {
            try {
              const arrayBuffer = await blob.arrayBuffer();
              const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
              const pcmData = decoded.getChannelData(0);
              const verification = speakerVerificationService.verifySpeaker(
                pcmData,
                decoded.sampleRate,
                optionsRef.current.enrolledVoiceProfile
              );
              isVerified = verification.verified;
            } catch {
              isVerified = true;
            }
          }

          optionsRef.current.onUtterance({
            audioBase64,
            mimeType,
            peakLevel,
            recognizedText,
            prosody,
            isVerifiedSpeaker: isVerified,
          });
        });
      } else if (!vad.isSpeaking && segment && now - segment.startedAt > MAX_IDLE_SEGMENT_MS) {
        void cutSegment();
      }

      const timeout = optionsRef.current.silenceTimeoutMs || ACTIVE_SILENCE_TIMEOUT_MS;
      if (
        currentMode === 'active' &&
        !speaking &&
        !busy &&
        !vad.isSpeaking &&
        now - lastActivityRef.current > timeout
      ) {
        wakeAnnounced = false;
        stopSegment();
        setMode('standby');
      }
    };

    (async () => {
      try {
        const constraints: MediaStreamConstraints = {
          audio: {
            deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
            echoCancellation: options.echoCancellation !== false,
            noiseSuppression: options.noiseSuppression !== 'off',
            autoGainControl: options.autoGainControl !== false,
          },
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
        if (!disposed) {
          optionsRef.current.onError(describeMicError(err));
          setMode('off');
        }
        return;
      }

      if (disposed || !stream) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }

      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (!disposed) optionsRef.current.onError('The microphone was disconnected.');
        };
      });

      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioCtx();

        const source = audioCtx.createMediaStreamSource(stream);

        // Web Audio Filtering Graph for Voice Isolation
        highpass = audioCtx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = options.noiseSuppression === 'strong' ? 110 : 85;

        lowpass = audioCtx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = options.noiseSuppression === 'strong' ? 3400 : 3800;

        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 20;
        compressor.ratio.value = options.noiseSuppression === 'strong' ? 10 : 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        duckingGain = audioCtx.createGain();
        duckingGain.gain.value = 1.0;

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        samples = new Float32Array(analyser.fftSize);
        freqData = new Uint8Array(analyser.frequencyBinCount);

        destination = audioCtx.createMediaStreamDestination();

        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(compressor);
        compressor.connect(duckingGain);

        duckingGain.connect(analyser);
        duckingGain.connect(destination);

        if (audioCtx.state === 'suspended') void audioCtx.resume();
      } catch (err: any) {
        optionsRef.current.onError(`Audio monitoring is unavailable: ${err?.message || err}`);
        return;
      }

      startRecognition();
      timer = setInterval(tick, TICK_MS);
    })();

    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
      startActiveCaptureRef.current = () => undefined;
      stopActiveCaptureRef.current = () => undefined;
      try {
        recognition?.stop();
      } catch {}
      stopSegment();
      stream?.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      void audioCtx?.close().catch(() => undefined);
    };
  }, [
    options.enabled,
    options.deviceId,
    options.noiseSuppression,
    options.echoCancellation,
    options.autoGainControl,
    options.vadSensitivity,
  ]);

  return { mode, goStandby, wake };
}
