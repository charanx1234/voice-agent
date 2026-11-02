import { useCallback, useEffect, useRef, useState } from 'react';
import {
  VoiceActivityDetector,
  DEFAULT_VAD_OPTIONS,
  BARGE_IN_VAD_OPTIONS,
} from '@/services/voice/voiceActivity';
import { detectLocalWakePhrase } from '@/services/voice/wakeWord';
import { describeMicError } from '@/services/voice/micErrors';
import { VoiceProsodySummary } from '@/shared/types';

export type HandsFreeMode = 'off' | 'standby' | 'active';

export interface HandsFreeUtterance {
  audioBase64: string;
  mimeType: string;
  peakLevel: number;
  recognizedText: string;
  prosody: VoiceProsodySummary;
}

export interface HandsFreeOptions {
  enabled: boolean;
  language?: string;
  silenceTimeoutMs?: number;
  isSpeaking: () => boolean;
  isBusy: () => boolean;
  onBargeIn: () => void;
  onSpeechActivity: (speaking: boolean) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
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

interface Segment {
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
}

function getSpeechRecognition(): any {
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
}

/**
 * Keeps one microphone stream alive while hands-free mode is enabled. Standby
 * uses the browser's local transcript gate when available and does not send
 * standby audio to Gemini. Active turns are recorded only after wake-up.
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
    let analyser: AnalyserNode | null = null;
    let samples = new Float32Array(1024);
    let timer: ReturnType<typeof setInterval> | null = null;
    let segment: Segment | null = null;
    let recognition: any = null;
    let normalVad = new VoiceActivityDetector(DEFAULT_VAD_OPTIONS);
    let bargeVad = new VoiceActivityDetector(BARGE_IN_VAD_OPTIONS);
    let usingBarge = false;
    let activeSpeechReported = false;
    let recognitionText = '';
    let wakeAnnounced = false;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

    const startSegment = () => {
      if (!stream || disposed || segment || modeRef.current !== 'active') return;
      try {
        const recorder = new MediaRecorder(stream, { mimeType });
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
        // The stream may already have been disconnected.
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

    const handleWakeTranscript = (transcript: string) => {
      if (modeRef.current !== 'standby' || wakeAnnounced) return;
      const wakeResult = detectLocalWakePhrase(transcript);
      if (!wakeResult.wake) return;

      wakeAnnounced = true;
      setMode('active');
      startSegment();
      recognitionText = '';
      optionsRef.current.onWake(wakeResult.command);
    };

    const startRecognition = () => {
      const SpeechRecognition = getSpeechRecognition();
      if (!SpeechRecognition) {
        optionsRef.current.onError(
          'Hands-free wake detection is unavailable in this Electron runtime. Use the microphone button or disable hands-free mode.'
        );
        return;
      }

      try {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = optionsRef.current.language || 'en-IN';
        // Chromium's local recognition mode is used when the runtime exposes it.
        // Older Electron builds may not provide processLocally, so the UI reports
        // the limitation instead of silently sending audio to FRIDAY's backend.
        if ('processLocally' in recognition) recognition.processLocally = true;
        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = String(event.results[i][0]?.transcript || '').trim();
            if (!transcript) continue;
            if (event.results[i].isFinal) {
              if (modeRef.current === 'standby') {
                handleWakeTranscript(transcript);
              } else {
                recognitionText = `${recognitionText} ${transcript}`.trim();
                optionsRef.current.onTranscript?.(recognitionText, true);
              }
            } else {
              interim = `${interim} ${transcript}`.trim();
              if (modeRef.current === 'standby') handleWakeTranscript(interim);
              else optionsRef.current.onTranscript?.(`${recognitionText} ${interim}`.trim(), false);
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
            } catch {
              // Browser may reject a restart while a previous stop is pending.
            }
          }
        };
        recognition.start();
      } catch (err: any) {
        recognition = null;
        optionsRef.current.onError(`Could not start wake detection: ${err?.message || err}`);
      }
    };

    const tick = () => {
      if (disposed || !analyser) return;
      const now = Date.now();
      analyser.getFloatTimeDomainData(samples as any);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 5);

      const speaking = optionsRef.current.isSpeaking();
      const busy = optionsRef.current.isBusy();
      const currentMode = modeRef.current;

      if (speaking !== usingBarge) {
        usingBarge = speaking;
        normalVad = new VoiceActivityDetector(DEFAULT_VAD_OPTIONS);
        bargeVad = new VoiceActivityDetector(BARGE_IN_VAD_OPTIONS);
      }

      const vad = usingBarge ? bargeVad : normalVad;
      let event = vad.update(level, now);
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
            speechRate: wordCount > 0 ? (wordCount / durationMs) * 60_000 : undefined,
          };
          lastActivityRef.current = Date.now();
          optionsRef.current.onUtterance({
            audioBase64,
            mimeType,
            peakLevel,
            recognizedText,
            prosody,
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
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
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
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        samples = new Float32Array(analyser.fftSize);
        audioCtx.createMediaStreamSource(stream).connect(analyser);
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
    // The refs above intentionally keep the persistent session stable while UI callbacks change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.enabled]);

  return { mode, goStandby, wake };
}
