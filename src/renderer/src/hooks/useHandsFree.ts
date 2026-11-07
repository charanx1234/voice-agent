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
import { getEnvironmentPreset } from '@/services/voice/listeningEnvironment';
import { voiceSessionManager } from '@/services/voice/voiceSession';
import { EnrolledSpeakerProfile, VoiceDiagnosticsData, VoiceProsodySummary, VoiceSessionState } from '@/shared/types';
import type { ListeningEnvironment } from '@/services/voice/listeningEnvironment';
import { encodeWav, resampleAudio, uint8ArrayToBase64, measurePcmLevels } from '@/services/voice/wavEncoder';

export type HandsFreeMode = 'off' | 'standby' | 'active';

export interface HandsFreeUtterance {
  audioBase64: string;
  mimeType: string;
  peakLevel: number;
  durationMs: number;
  recognizedText: string;
  prosody: VoiceProsodySummary;
  isVerifiedSpeaker?: boolean;
  turnId?: string;
  sessionId?: string;
}

export interface HandsFreeOptions {
  enabled: boolean;
  isMicMuted?: boolean;
  isTextModeActive?: boolean;
  language?: string;
  silenceTimeoutMs?: number;
  noiseSuppression?: 'off' | 'standard' | 'strong';
  echoCancellation?: boolean;
  autoGainControl?: boolean;
  vadSensitivity?: 'low' | 'medium' | 'high';
  listeningEnvironment?: ListeningEnvironment;
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
  onDiagnostics?: (diag: Partial<VoiceDiagnosticsData>) => void;
}

const TICK_MS = 50;
const MIN_UTTERANCE_MS = 250;
const MIN_PEAK_LEVEL = 0.012;
const MAX_UTTERANCE_MS = 30000;
const ECHO_COOLDOWN_MS = 650;
export const ACTIVE_SILENCE_TIMEOUT_MS = 8000;

function getVadOptions(
  sensitivity?: 'low' | 'medium' | 'high',
  listeningEnvironment?: ListeningEnvironment
): VadOptions {
  if (listeningEnvironment) {
    const preset = getEnvironmentPreset(listeningEnvironment);
    return getVadOptions(preset.vadSensitivity);
  }
  switch (sensitivity) {
    case 'high':
      return {
        startThreshold: 0.065,
        endThreshold: 0.035,
        speechStartMs: 80,
        speechEndMs: 1200,
        noiseGateMultiplier: 1.0,
        maxUtteranceMs: 30000,
      };
    case 'low':
      return {
        startThreshold: 0.22,
        endThreshold: 0.10,
        speechStartMs: 140,
        speechEndMs: 1600,
        noiseGateMultiplier: 1.0,
        maxUtteranceMs: 30000,
      };
    case 'medium':
    default:
      return {
        ...DEFAULT_VAD_OPTIONS,
        speechStartMs: 90,
        speechEndMs: 1400,
        maxUtteranceMs: 30000,
      };
  }
}

/**
 * Universal PCM Audio Pipeline & Hands-Free Voice Listener
 * Captures pure linear PCM samples from physical microphone, filters frequencies,
 * monitors voice activity, detects offline wake-word, and encodes utterances into
 * standard 16kHz Mono WAV payloads.
 */
export function useHandsFree(options: HandsFreeOptions) {
  const [mode, setModeState] = useState<HandsFreeMode>(options.enabled ? 'standby' : 'off');
  const modeRef = useRef<HandsFreeMode>(mode);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const lastActivityRef = useRef(Date.now());
  const startActiveCaptureRef = useRef<() => void>(() => undefined);
  const stopActiveCaptureRef = useRef<() => void>(() => undefined);
  const finalizeUtteranceRef = useRef<() => void>(() => undefined);

  const setMode = useCallback((next: HandsFreeMode) => {
    console.log(`[AudioPipeline] Hands-free mode transition: ${modeRef.current} -> ${next}`);
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

  const finalizeCurrentUtterance = useCallback(() => {
    finalizeUtteranceRef.current();
  }, []);

  const cancelActiveUtterance = useCallback(() => {
    stopActiveCaptureRef.current();
    if (modeRef.current === 'active') {
      setMode('standby');
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
    let processorNode: ScriptProcessorNode | null = null;
    let samples = new Float32Array(1024);
    let freqData = new Uint8Array(512);
    let timer: ReturnType<typeof setInterval> | null = null;

    let normalVad = new VoiceActivityDetector(getVadOptions(options.vadSensitivity, options.listeningEnvironment));
    let bargeVad = new VoiceActivityDetector(BARGE_IN_VAD_OPTIONS);
    let usingBarge = false;
    let activeSpeechReported = false;
    let recognitionText = '';
    let wakeAnnounced = false;

    // Rolling circular buffer of raw PCM frames (keeps ~350ms of audio before speech onset)
    const MAX_PRE_ROLL_BLOCKS = 8; // 8 * 2048 / 48000 ≈ 341ms
    let preRollPcmBuffers: Float32Array[] = [];
    let activeUtterancePcmBuffers: Float32Array[] = [];
    let isCapturingUtterance = false;
    let turnInProgress = false;
    let utteranceStartedAt = 0;
    let turnCounter = 0;

    let micDeviceLabel = '';
    let ambientNoiseFloor = 0.02;
    let wasSpeaking = false;
    let ttsFinishedAt = 0;

    const emitDiagnosticsSnapshot = (extra: Partial<VoiceDiagnosticsData> = {}) => {
      const audioTrack = stream?.getAudioTracks()[0];
      const bufferSamples = activeUtterancePcmBuffers.reduce((acc, b) => acc + b.length, 0);
      const bufferKb = Math.round((bufferSamples * 2) / 1024);
      optionsRef.current.onDiagnostics?.({
        selectedMicDevice: micDeviceLabel || 'Default Microphone',
        micPermissionStatus: 'granted',
        streamStatus: stream && stream.active ? 'active' : 'inactive',
        trackStatus: {
          label: audioTrack?.label || 'Microphone',
          readyState: audioTrack?.readyState || 'none',
          enabled: audioTrack?.enabled ?? false,
          muted: audioTrack?.muted ?? false,
        },
        audioFormat: `16-bit Mono WAV (16,000 Hz, from ${audioCtx?.sampleRate || 48000} Hz)`,
        sampleRate: audioCtx?.sampleRate || 48000,
        liveLevel: extra.liveLevel ?? 0,
        peakLevel: extra.peakLevel ?? 0,
        ambientNoiseFloor,
        isSpeechDetected: (usingBarge ? bargeVad : normalVad).isSpeaking,
        capturedDurationMs: isCapturingUtterance ? Math.max(0, Date.now() - utteranceStartedAt) : 0,
        audioBufferSizeKb: bufferKb,
        ...extra,
      });
    };

    const startRecordingSession = () => {
      if (disposed || modeRef.current !== 'active') return;
      console.log('[AudioPipeline] Active voice capture session armed. Waiting for user speech...');
      activeUtterancePcmBuffers = [];
      isCapturingUtterance = false;
      turnInProgress = false;
      utteranceStartedAt = Date.now();
    };

    const stopRecordingSession = () => {
      isCapturingUtterance = false;
      activeUtterancePcmBuffers = [];
      preRollPcmBuffers = [];
      turnInProgress = false;
    };

    const finalizeAndSubmitUtterance = () => {
      if (!isCapturingUtterance && activeUtterancePcmBuffers.length === 0) {
        stopRecordingSession();
        setMode('standby');
        return;
      }

      const now = Date.now();
      const durationMs = Math.max(0, now - utteranceStartedAt);

      // Concatenate all captured PCM chunks
      let totalSamples = 0;
      for (const b of activeUtterancePcmBuffers) totalSamples += b.length;

      if (totalSamples === 0) {
        stopRecordingSession();
        setMode('standby');
        return;
      }

      const mergedPcm = new Float32Array(totalSamples);
      let offset = 0;
      for (const b of activeUtterancePcmBuffers) {
        mergedPcm.set(b, offset);
        offset += b.length;
      }

      // Compute peak and rms from actual samples
      const { peak: peakLevel, rms } = measurePcmLevels(mergedPcm);
      console.log(`[AudioPipeline] Finalizing utterance: duration=${durationMs}ms, peak=${peakLevel.toFixed(3)}, rms=${rms.toFixed(3)}, samples=${totalSamples}`);

      // Stop capture & return to standby immediately
      stopRecordingSession();
      setMode('standby');
      wakeAnnounced = false;

      // Audio Quality Gate: Reject noise bursts, clicks, or quiet background drift
      if (durationMs < MIN_UTTERANCE_MS || peakLevel < MIN_PEAK_LEVEL) {
        console.warn(`[AudioPipeline] Utterance rejected by quality gate (duration=${durationMs}ms, peak=${peakLevel.toFixed(3)})`);
        voiceSessionManager.log({
          source: 'VOICE',
          vadDecision: 'SPEECH_END',
          audioDurationMs: durationMs,
          peakLevel,
          qualityDecision: {
            acceptable: false,
            reason: durationMs < MIN_UTTERANCE_MS ? 'too_short' : 'low_peak_energy',
          },
          acceptanceDecision: {
            accepted: false,
            reason: 'Rejected before STT: noise burst, click, or silence',
          },
        });
        return;
      }

      // Valid single utterance: resample to 16,000 Hz & encode to standard 16-bit PCM WAV
      const inSampleRate = audioCtx?.sampleRate || 48000;
      const resampledPcm = resampleAudio(mergedPcm, inSampleRate, 16000);
      const wavBytes = encodeWav(resampledPcm, 16000);
      const audioBase64 = uint8ArrayToBase64(wavBytes);
      const turnId = `turn_${Date.now()}_${++turnCounter}`;

      console.info(`[AudioPipeline] Encoded 16kHz WAV payload: ${wavBytes.length} bytes (${Math.round(wavBytes.length / 1024)} KB), turnId=${turnId}`);

      // Speaker verification check
      let isVerified = true;
      if (optionsRef.current.speakerVerificationEnabled && optionsRef.current.enrolledVoiceProfile) {
        try {
          const verification = speakerVerificationService.verifySpeaker(
            resampledPcm,
            16000,
            optionsRef.current.enrolledVoiceProfile
          );
          isVerified = verification.verified;
        } catch {
          isVerified = true;
        }
      }

      voiceSessionManager.log({
        source: 'VOICE',
        vadDecision: 'SPEECH_END',
        turnId,
        audioDurationMs: durationMs,
        peakLevel,
        qualityDecision: { acceptable: true, reason: 'ok' },
        acceptanceDecision: { accepted: true, reason: 'Submitted single utterance for transcription' },
      });

      optionsRef.current.onUtterance({
        audioBase64,
        mimeType: 'audio/wav',
        peakLevel,
        durationMs,
        recognizedText: '',
        prosody: {
          peakLevel,
          durationMs,
        },
        isVerifiedSpeaker: isVerified,
        turnId,
      });
    };

    startActiveCaptureRef.current = startRecordingSession;
    stopActiveCaptureRef.current = stopRecordingSession;
    finalizeUtteranceRef.current = finalizeAndSubmitUtterance;

    const handleWakeTrigger = (command: string) => {
      if (modeRef.current !== 'standby' || wakeAnnounced) return;
      console.log('[AudioPipeline] Wake-word detected! Activating microphone listener...');
      wakeAnnounced = true;
      setMode('active');
      startRecordingSession();
      optionsRef.current.onWake(command);
    };

    const tick = () => {
      if (disposed || !analyser) return;
      const now = Date.now();

      // 1. Microphone Mute Check
      if (optionsRef.current.isMicMuted) {
        if (stream) {
          stream.getAudioTracks().forEach((t) => {
            if (t.enabled) t.enabled = false;
          });
        }
        optionsRef.current.onLevel?.(0);
        emitDiagnosticsSnapshot({ liveLevel: 0 });
        if (modeRef.current !== 'off') {
          stopRecordingSession();
          setMode('off');
        }
        return;
      } else if (stream) {
        stream.getAudioTracks().forEach((t) => {
          if (!t.enabled) t.enabled = true;
        });
      }

      // 2. Text Mode Active Check
      if (optionsRef.current.isTextModeActive) {
        if (isCapturingUtterance) {
          stopRecordingSession();
          if (modeRef.current === 'active') setMode('standby');
        }
      }

      analyser.getFloatTimeDomainData(samples as any);
      analyser.getByteFrequencyData(freqData);

      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / samples.length);
      const level = Math.min(1, rms * 5);

      // Track running ambient noise floor using slow exponential smoothing
      if (rms > 0.003 && rms < 0.08) {
        ambientNoiseFloor = ambientNoiseFloor * 0.97 + rms * 0.03;
      }

      // Report live input level for UI meters & diagnostics
      optionsRef.current.onLevel?.(level);
      emitDiagnosticsSnapshot({ liveLevel: level });

      const speaking = optionsRef.current.isSpeaking();
      const busy = optionsRef.current.isBusy();
      const currentMode = modeRef.current;

      // Track assistant speech end to enforce acoustic echo suppression cooldown
      if (speaking !== wasSpeaking) {
        if (!speaking && wasSpeaking) {
          ttsFinishedAt = now;
          localWakeWordDetector.suppress(1200);
          preRollPcmBuffers = [];
          activeUtterancePcmBuffers = [];
        }
        wasSpeaking = speaking;
      }

      const inEchoCooldown = now - ttsFinishedAt < ECHO_COOLDOWN_MS;

      // Software ducking during assistant speech
      if (duckingGain && audioCtx) {
        const targetGain = speaking ? 0.0 : 1.0;
        duckingGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.03);
      }
      if (speaking || inEchoCooldown) {
        localWakeWordDetector.suppress(800);
      }

      // Standby Local Wake-Word Evaluation
      if (currentMode === 'standby' && !speaking && !busy && !inEchoCooldown && !optionsRef.current.isTextModeActive) {
        const wakeDetected = localWakeWordDetector.processFrequencyData(
          freqData,
          audioCtx?.sampleRate || 44100
        );
        if (wakeDetected) {
          handleWakeTrigger('');
        }
      }

      // Unlock turn in progress when done speaking
      if (!speaking && !busy && turnInProgress && !isCapturingUtterance) {
        turnInProgress = false;
      }

      if (speaking !== usingBarge) {
        usingBarge = speaking;
        normalVad = new VoiceActivityDetector(getVadOptions(optionsRef.current.vadSensitivity, optionsRef.current.listeningEnvironment));
        bargeVad = new VoiceActivityDetector(BARGE_IN_VAD_OPTIONS);
      }

      normalVad.setAmbientFloor(ambientNoiseFloor);
      bargeVad.setAmbientFloor(ambientNoiseFloor * 0.5);

      if (inEchoCooldown) {
        normalVad.reset();
        bargeVad.reset();
        return;
      }

      const effectiveLevel = level;
      const vad = usingBarge ? bargeVad : normalVad;
      let event = vad.update(effectiveLevel, now);

      if (!event && vad.isSpeaking && isCapturingUtterance && now - utteranceStartedAt > MAX_UTTERANCE_MS) {
        event = vad.finish(now);
      }

      if (speaking || busy || vad.isSpeaking) lastActivityRef.current = now;

      if (event?.type === 'start') {
        if (currentMode === 'active' || speaking) {
          if (speaking) {
            // Intentional Barge-in during speech playback
            console.log('[AudioPipeline] Barge-in speech detected during assistant playback! Interrupting...');
            turnInProgress = false;
            isCapturingUtterance = true;
            utteranceStartedAt = now;
            activeUtterancePcmBuffers = [];
            preRollPcmBuffers = [];
            optionsRef.current.onBargeIn();
            activeSpeechReported = true;
            optionsRef.current.onSpeechActivity(true);
            voiceSessionManager.log({
              source: 'VOICE',
              vadDecision: 'BARGE_IN',
              peakLevel: level,
              acceptanceDecision: { accepted: true, reason: 'Barge-in speech detected during TTS' },
            });
          } else if (!isCapturingUtterance && !turnInProgress && !optionsRef.current.isTextModeActive) {
            console.log('[AudioPipeline] VAD SPEECH_START detected! Capturing speech utterance...');
            isCapturingUtterance = true;
            utteranceStartedAt = now;
            // Prepend pre-roll buffer to retain leading phonemes
            activeUtterancePcmBuffers = [...preRollPcmBuffers];
            if (!activeSpeechReported) {
              activeSpeechReported = true;
              optionsRef.current.onSpeechActivity(true);
            }
          }
        }
      } else if (event?.type === 'end') {
        if (activeSpeechReported) {
          activeSpeechReported = false;
          optionsRef.current.onSpeechActivity(false);
        }

        if (isCapturingUtterance && (currentMode === 'active' || speaking)) {
          console.log('[AudioPipeline] VAD SPEECH_END detected! Submitting complete utterance...');
          finalizeAndSubmitUtterance();
        }
      }

      const timeout = optionsRef.current.silenceTimeoutMs || ACTIVE_SILENCE_TIMEOUT_MS;
      if (
        currentMode === 'active' &&
        !speaking &&
        !busy &&
        !vad.isSpeaking &&
        !isCapturingUtterance &&
        now - lastActivityRef.current > timeout
      ) {
        console.log('[AudioPipeline] Active silence timeout elapsed. Returning to standby.');
        wakeAnnounced = false;
        stopRecordingSession();
        setMode('standby');
      }
    };

    (async () => {
      try {
        console.log('[AudioPipeline] Initializing microphone stream...');
        const constraintsWithDevice: MediaStreamConstraints = {
          audio: {
            deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
            echoCancellation: options.echoCancellation !== false,
            noiseSuppression: options.noiseSuppression !== 'off',
            autoGainControl: options.autoGainControl !== false,
            channelCount: { ideal: 1 },
          },
        };

        try {
          stream = await navigator.mediaDevices.getUserMedia(constraintsWithDevice);
        } catch (err: any) {
          // Fallback to default microphone if specified device is disconnected or changed
          console.warn('[AudioPipeline] Specified microphone unavailable, falling back to default device:', err?.message);
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: options.echoCancellation !== false,
              noiseSuppression: options.noiseSuppression !== 'off',
              autoGainControl: options.autoGainControl !== false,
            },
          });
        }
      } catch (err: any) {
        if (!disposed) {
          const msg = describeMicError(err);
          console.error('[AudioPipeline] Microphone access denied or unavailable:', msg);
          optionsRef.current.onError(msg);
          setMode('off');
        }
        return;
      }

      if (disposed || !stream) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }

      const activeTrack = stream.getAudioTracks()[0];
      if (!activeTrack) {
        optionsRef.current.onError('No audio track available on selected input device.');
        setMode('off');
        return;
      }

      micDeviceLabel = activeTrack.label || 'Microphone';
      console.info(`[AudioPipeline] Microphone opened successfully: "${micDeviceLabel}" (readyState=${activeTrack.readyState})`);

      activeTrack.onended = () => {
        if (!disposed) {
          console.warn('[AudioPipeline] Microphone track ended unexpectedly.');
          optionsRef.current.onError('The microphone was disconnected.');
        }
      };

      activeTrack.onmute = () => {
        console.warn('[AudioPipeline] Microphone was hardware-muted or system-muted by Windows.');
      };

      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioCtx();

        const source = audioCtx.createMediaStreamSource(stream);

        // 1. Highpass filter (<85-110Hz) to cut desk thumps and fan drone
        highpass = audioCtx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = options.noiseSuppression === 'strong' ? 110 : 85;

        // 2. Lowpass filter (>3400-3800Hz) to cut typing clicks and hiss
        lowpass = audioCtx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = options.noiseSuppression === 'strong' ? 3400 : 3800;

        // 3. Compressor for speech level stabilization
        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 20;
        compressor.ratio.value = options.noiseSuppression === 'strong' ? 10 : 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        // 4. Ducking gain for assistant speech echo suppression
        duckingGain = audioCtx.createGain();
        duckingGain.gain.value = 1.0;

        // 5. Analyser for FFT & level calculations
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        samples = new Float32Array(analyser.fftSize);
        freqData = new Uint8Array(analyser.frequencyBinCount);

        // 6. Direct PCM Audio Processing Node
        processorNode = audioCtx.createScriptProcessor(2048, 1, 1);
        processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
          if (disposed) return;
          const inputChannel = event.inputBuffer.getChannelData(0);
          const copy = new Float32Array(inputChannel.length);
          copy.set(inputChannel);

          // Rolling pre-roll buffer to retain opening phonemes before VAD threshold
          preRollPcmBuffers.push(copy);
          if (preRollPcmBuffers.length > MAX_PRE_ROLL_BLOCKS) {
            preRollPcmBuffers.shift();
          }

          // Accumulate raw PCM samples if currently capturing speech
          if (isCapturingUtterance) {
            activeUtterancePcmBuffers.push(copy);
          }

          // Silence the output so the processor never feeds back into speakers
          const outputChannel = event.outputBuffer.getChannelData(0);
          outputChannel.fill(0);
        };

        // Connect graph:
        // Source -> Highpass -> Lowpass -> Compressor -> DuckingGain -> Analyser -> Processor -> Destination
        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(compressor);
        compressor.connect(duckingGain);

        duckingGain.connect(analyser);
        duckingGain.connect(processorNode);
        processorNode.connect(audioCtx.destination);

        if (audioCtx.state === 'suspended') {
          void audioCtx.resume();
        }
      } catch (err: any) {
        console.error('[AudioPipeline] AudioContext initialization failed:', err);
        optionsRef.current.onError(`Audio monitoring is unavailable: ${err?.message || err}`);
        return;
      }

      timer = setInterval(tick, TICK_MS);
      emitDiagnosticsSnapshot();
    })();

    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
      startActiveCaptureRef.current = () => undefined;
      stopActiveCaptureRef.current = () => undefined;
      finalizeUtteranceRef.current = () => undefined;
      stopRecordingSession();
      if (processorNode) {
        try {
          processorNode.disconnect();
        } catch {}
      }
      stream?.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      void audioCtx?.close().catch(() => undefined);
    };
  }, [
    options.enabled,
    options.isMicMuted,
    options.isTextModeActive,
    options.deviceId,
    options.noiseSuppression,
    options.echoCancellation,
    options.autoGainControl,
    options.vadSensitivity,
    options.listeningEnvironment,
  ]);

  return { mode, goStandby, wake, cancelActiveUtterance, finalizeCurrentUtterance };
}
