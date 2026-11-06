import { useState, useRef, useEffect, useCallback } from 'react';
import { RobotState, VoiceProsodySummary } from '@/shared/types';
import { AudioAnalyser } from '@/services/voice/audioAnalyser';
import { VoiceManager, VoiceOption } from '@/services/voice/voiceManager';
import { describeMicError } from '@/services/voice/micErrors';

export interface StopListeningResult {
  audioBase64?: string;
  mimeType?: string;
  recognizedText: string;
  /** Highest absolute sample value in the recording (0-1). Near zero means silence. */
  peakLevel: number;
  durationMs: number;
  prosody: VoiceProsodySummary;
}

/** Decodes the recording and reports its peak level, so silent captures can be caught. */
async function measurePeakLevel(blob: Blob): Promise<number> {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const context = new AudioCtx();
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());

    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const samples = buffer.getChannelData(channel);
      for (let i = 0; i < samples.length; i += 4) {
        const value = Math.abs(samples[i]);
        if (value > peak) peak = value;
      }
    }

    await context.close().catch(() => undefined);
    return peak;
  } catch {
    // If decoding fails, assume there is audio rather than dropping the user's speech.
    return 1;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result?.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Audio processing options forwarded from app settings. */
export interface VoiceAssistantAudioOptions {
  /** Selected microphone device ID. Empty string means OS default. */
  deviceId?: string;
  noiseSuppression?: 'off' | 'standard' | 'strong';
  echoCancellation?: boolean;
  autoGainControl?: boolean;
}

export function useVoiceAssistant() {
  const [robotState, setRobotState] = useState<RobotState>('idle');
  const [amplitude, setAmplitude] = useState<number>(0);
  const [frequencies, setFrequencies] = useState<number[]>([0, 0, 0, 0, 0]);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [voices, setVoices] = useState<VoiceOption[]>([]);

  const analyserRef = useRef<AudioAnalyser>(new AudioAnalyser());
  const voiceManagerRef = useRef<VoiceManager | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const activeAudioCtxRef = useRef<AudioContext | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef<string>('');
  const listeningStartedAtRef = useRef<number>(0);
  const isStartingRef = useRef<boolean>(false);

  // Initialize analyser & voice manager
  useEffect(() => {
    const analyser = analyserRef.current;
    analyser.init((amp, freqs) => {
      setAmplitude(amp);
      setFrequencies(freqs);
      if (typeof window !== 'undefined' && window.fridayAPI?.updateVoiceMouth) {
        window.fridayAPI.updateVoiceMouth({
          mouthOpenness: Math.min(1, amp * 1.2),
          amplitude: amp,
          frequencies: freqs,
        });
      }
    });

    const vm = new VoiceManager(analyser);
    vm.setOnStateChange((speaking) => {
      if (speaking) {
        setRobotState('speaking');
      } else {
        setRobotState((prev) => (prev === 'speaking' ? 'idle' : prev));
      }
    });
    voiceManagerRef.current = vm;

    // Load available voices
    const timer = setTimeout(() => {
      setVoices(vm.getVoices());
    }, 400);

    return () => {
      clearTimeout(timer);
      analyser.disconnect();
      vm.stop();
    };
  }, []);

  /** Releases the microphone stream, audio context, and any recognition session. */
  const releaseCapture = useCallback(() => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      activeStreamRef.current = null;
    }
    if (activeAudioCtxRef.current && activeAudioCtxRef.current.state !== 'closed') {
      activeAudioCtxRef.current.close().catch(() => undefined);
      activeAudioCtxRef.current = null;
    }
  }, []);

  /**
   * Immediately stops any speech output or recording
   */
  const interrupt = useCallback(() => {
    if (voiceManagerRef.current) {
      voiceManagerRef.current.stop();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
    releaseCapture();
    analyserRef.current.disconnect();
    setIsListening(false);
    setRobotState('interrupted');
    setTimeout(() => {
      setRobotState('idle');
    }, 400);
  }, [releaseCapture]);

  /**
   * Starts listening to user's microphone.
   *
   * FIX (was: Problem 1 & 7):
   * The original implementation recorded directly from the raw getUserMedia stream,
   * bypassing the Web Audio processing graph entirely. This meant zero noise suppression,
   * no vocal bandpass filtering, and no compressor/AGC were applied to the audio sent
   * to Gemini. It also ignored the user's selected microphone device.
   *
   * Fixed implementation:
   * - Opens the stream with the user's configured device ID and AEC/AGC/NS constraints.
   * - Creates a Web Audio processing graph (highpass → lowpass → vocal-presence peak →
   *   compressor → destination).
   * - MediaRecorder records from the processed destination stream, not the raw stream.
   * - AudioAnalyser still receives the raw stream for lightweight visualisation.
   */
  const startListening = useCallback(
    async (
      languageCode = 'te-IN',
      onSpeechRecognized?: (text: string, isFinal: boolean) => void,
      audioOptions?: VoiceAssistantAudioOptions
    ) => {
      // Ignore double taps while a capture session is still being set up.
      if (isStartingRef.current) return;
      isStartingRef.current = true;

      try {
        // Intercept any active audio playback first
        if (voiceManagerRef.current?.getIsSpeaking()) {
          interrupt();
        }

        // Resolve audio settings — apply any provided options or use sensible defaults
        const nsEnabled = audioOptions?.noiseSuppression !== 'off';
        const aecEnabled = audioOptions?.echoCancellation !== false;
        const agcEnabled = audioOptions?.autoGainControl !== false;
        const deviceId = audioOptions?.deviceId || undefined;

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: deviceId ? { exact: deviceId } : undefined,
              echoCancellation: aecEnabled,
              noiseSuppression: nsEnabled,
              autoGainControl: agcEnabled,
              // Request mono 16kHz for lower latency and speech-model compatibility
              sampleRate: { ideal: 16000 },
              channelCount: { ideal: 1 },
            },
          });
        } catch (err: any) {
          // If the exact deviceId constraint failed (device unplugged), retry with default
          if (deviceId) {
            console.warn('[useVoiceAssistant] Exact device unavailable, falling back to default mic:', err);
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  echoCancellation: aecEnabled,
                  noiseSuppression: nsEnabled,
                  autoGainControl: agcEnabled,
                },
              });
            } catch (fallbackErr: any) {
              console.error('[useVoiceAssistant] Microphone unavailable:', fallbackErr);
              throw new Error(describeMicError(fallbackErr));
            }
          } else {
            console.error('[useVoiceAssistant] Microphone unavailable:', err);
            throw new Error(describeMicError(err));
          }
        }

        activeStreamRef.current = stream;
        audioChunksRef.current = [];
        liveTranscriptRef.current = '';
        listeningStartedAtRef.current = Date.now();

        // Connect raw stream to analyser for lightweight visual reaction (mouth lip-sync).
        // The visualiser uses only the analyser — it does NOT need the processed stream.
        try {
          analyserRef.current.connectMediaStream(stream);
        } catch (err) {
          console.warn('[useVoiceAssistant] Visualiser unavailable:', err);
        }

        // ── Build the Web Audio processing graph ──────────────────────────────
        // Microphone → highpass → lowpass → vocal-presence boost → compressor → destination
        // MediaRecorder captures from destination.stream (processed), not from raw stream.
        let processedStream = stream; // fallback: if Web Audio fails, use raw
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioCtx();
          activeAudioCtxRef.current = ctx;

          const source = ctx.createMediaStreamSource(stream);

          // High-pass filter: cut low-frequency rumble, fan drone, desk thumps (<85-110Hz)
          const highpass = ctx.createBiquadFilter();
          highpass.type = 'highpass';
          const isStrong = audioOptions?.noiseSuppression === 'strong';
          highpass.frequency.value = isStrong ? 110 : 85;
          highpass.Q.value = isStrong ? 1.0 : 0.7;

          // Low-pass filter: cut hiss, keyboard/mouse clicks (>3400-3800Hz)
          const lowpass = ctx.createBiquadFilter();
          lowpass.type = 'lowpass';
          lowpass.frequency.value = isStrong ? 3400 : 3800;
          lowpass.Q.value = isStrong ? 1.0 : 0.7;

          // Peaking vocal presence filter: boost 1.6kHz (human speech intelligibility)
          const vocalBoost = ctx.createBiquadFilter();
          vocalBoost.type = 'peaking';
          vocalBoost.frequency.value = 1600;
          vocalBoost.Q.value = 1.2;
          vocalBoost.gain.value = 3.5;

          // Dynamics compressor / AGC limiter
          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.value = isStrong ? -28 : -24;
          compressor.knee.value = 20;
          compressor.ratio.value = isStrong ? 10 : 6;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.25;

          // Destination node: MediaRecorder records this processed stream
          const destination = ctx.createMediaStreamDestination();

          source.connect(highpass);
          highpass.connect(lowpass);
          lowpass.connect(vocalBoost);
          vocalBoost.connect(compressor);
          compressor.connect(destination);

          if (ctx.state === 'suspended') void ctx.resume();

          processedStream = destination.stream;
        } catch (graphErr) {
          console.warn(
            '[useVoiceAssistant] Web Audio processing graph unavailable, recording raw stream:',
            graphErr
          );
          // Keep processedStream = stream (raw fallback)
        }
        // ── End Web Audio graph ───────────────────────────────────────────────

        // Record from the PROCESSED destination stream (not the raw getUserMedia stream)
        try {
          const mimeType = MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/mp4';

          const recorder = new MediaRecorder(processedStream, { mimeType });
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              audioChunksRef.current.push(e.data);
            }
          };

          mediaRecorderRef.current = recorder;
          recorder.start(100);
        } catch (err: any) {
          releaseCapture();
          throw new Error(
            `Could not start audio recording${err?.message ? `: ${err.message}` : '.'}`
          );
        }

        // Optional Web Speech API recognition for live transcript feedback in standard browsers.
        // In Electron, Chromium lacks Google Speech API keys and fails with Error: -2 in the chunked upload stream;
        // audio recording is reliably handled by MediaRecorder and transcribed natively by Gemini.
        const isElectron = typeof window !== 'undefined' && Boolean((window as any).fridayAPI);
        const SpeechRec =
          !isElectron && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
        if (SpeechRec) {
          try {
            const recognition = new SpeechRec();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = languageCode;

            recognition.onresult = (event: any) => {
              let interim = '';
              for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                  liveTranscriptRef.current += transcript + ' ';
                  if (onSpeechRecognized) onSpeechRecognized(liveTranscriptRef.current, true);
                } else {
                  interim += transcript;
                  if (onSpeechRecognized) {
                    onSpeechRecognized(liveTranscriptRef.current + interim, false);
                  }
                }
              }
            };

            recognition.onerror = () => {
              // Ignore recognition errors; recorded audio is sent to Gemini regardless.
            };

            speechRecognitionRef.current = recognition;
            recognition.start();
          } catch {
            speechRecognitionRef.current = null;
          }
        }

        setIsListening(true);
        setRobotState('listening');
      } catch (err: any) {
        releaseCapture();
        setIsListening(false);
        setRobotState('error');
        throw err;
      } finally {
        isStartingRef.current = false;
      }
    },
    [interrupt, releaseCapture]
  );

  /**
   * Stops listening and returns the recording, transcript and level information.
   * Always resolves: a watchdog prevents the UI from hanging on "Thinking...".
   */
  const stopListening = useCallback((): Promise<StopListeningResult> => {
    return new Promise((resolve) => {
      const durationMs = Math.max(0, Date.now() - listeningStartedAtRef.current);
      setIsListening(false);
      setRobotState('thinking');
      analyserRef.current.disconnect();

      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
      }

      const recorder = mediaRecorderRef.current;
      let settled = false;

      const finish = (audioBase64?: string, mimeType?: string, peakLevel = 0) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        mediaRecorderRef.current = null;
        releaseCapture();
        resolve({
          audioBase64,
          mimeType,
          recognizedText: liveTranscriptRef.current.trim(),
          peakLevel,
          durationMs,
          prosody: {
            peakLevel,
            durationMs,
            speechRate: liveTranscriptRef.current.trim()
              ? (liveTranscriptRef.current.trim().split(/\s+/).length / durationMs) * 60_000
              : undefined,
          },
        });
      };

      // If onstop never fires, the user would be stuck on "Thinking..." forever.
      const watchdog = setTimeout(() => {
        console.warn('[useVoiceAssistant] Recorder stop timed out; resolving with captured audio.');
        finish(undefined, undefined, 0);
      }, 6000);

      if (!recorder || recorder.state === 'inactive') {
        finish();
        return;
      }

      recorder.onstop = async () => {
        try {
          const mimeType = recorder.mimeType || 'audio/webm';
          const blob = new Blob(audioChunksRef.current, { type: mimeType });

          if (blob.size === 0) {
            finish(undefined, mimeType, 0);
            return;
          }

          const [base64, peakLevel] = await Promise.all([
            blobToBase64(blob),
            measurePeakLevel(blob),
          ]);

          finish(base64, mimeType, peakLevel);
        } catch (err: any) {
          console.error('[useVoiceAssistant] Failed to read recording:', err);
          finish();
        }
      };

      try {
        recorder.stop();
      } catch (err: any) {
        console.warn('[useVoiceAssistant] Recorder stop failed:', err);
        finish();
      }
    });
  }, [releaseCapture]);

  /**
   * Speaks response aloud with mouth animation
   */
  const speakResponse = useCallback(
    async (
      text: string,
      options: {
        languageCode?: string;
        rate?: number;
        volume?: number;
        pitch?: number;
        voiceId?: string;
        voice?: string;
        accent?: string;
        engine?: 'auto' | 'elevenlabs' | 'edge' | 'gemini' | 'system';
        elevenLabsVoiceId?: string;
        elevenLabsModel?: 'eleven_flash_v2_5' | 'eleven_multilingual_v2';
        elevenLabsStability?: number;
        elevenLabsSimilarityBoost?: number;
        elevenLabsStyle?: number;
        elevenLabsSpeakerBoost?: boolean;
        audioBase64?: string;
      } = {}
    ) => {
      if (isMuted) {
        setRobotState('idle');
        return;
      }

      if (!voiceManagerRef.current) return;

      try {
        if (options.audioBase64) {
          await voiceManagerRef.current.playAudioBuffer(options.audioBase64);
        } else {
          await voiceManagerRef.current.speak(text, {
            languageCode: options.languageCode,
            rate: options.rate,
            volume: options.volume,
            pitch: options.pitch,
            voiceId: options.voiceId,
            voice: options.voice,
            accent: options.accent,
            engine: options.engine,
            elevenLabsVoiceId: options.elevenLabsVoiceId,
            elevenLabsModel: options.elevenLabsModel,
            elevenLabsStability: options.elevenLabsStability,
            elevenLabsSimilarityBoost: options.elevenLabsSimilarityBoost,
            elevenLabsStyle: options.elevenLabsStyle,
            elevenLabsSpeakerBoost: options.elevenLabsSpeakerBoost,
            onError: () => setRobotState('error'),
          });
        }
      } catch {
        setRobotState('error');
      } finally {
        setRobotState('idle');
      }
    },
    [isMuted]
  );

  const enqueueSpeech = useCallback(
    (
      text: string,
      options: {
        languageCode?: string;
        rate?: number;
        volume?: number;
        pitch?: number;
        voiceId?: string;
        voice?: string;
        accent?: string;
        engine?: 'auto' | 'elevenlabs' | 'edge' | 'gemini' | 'system';
        elevenLabsVoiceId?: string;
        elevenLabsModel?: 'eleven_flash_v2_5' | 'eleven_multilingual_v2';
        elevenLabsStability?: number;
        elevenLabsSimilarityBoost?: number;
        elevenLabsStyle?: number;
        elevenLabsSpeakerBoost?: boolean;
      } = {}
    ) => {
      if (isMuted) return;
      voiceManagerRef.current?.enqueueSpeech(text, {
        ...options,
        onError: () => setRobotState('error'),
      });
    },
    [isMuted]
  );

  return {
    robotState,
    setRobotState,
    amplitude,
    frequencies,
    isListening,
    isMuted,
    setIsMuted,
    voices,
    startListening,
    stopListening,
    speakResponse,
    enqueueSpeech,
    interrupt,
  };
}
