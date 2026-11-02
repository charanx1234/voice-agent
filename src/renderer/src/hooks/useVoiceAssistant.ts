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

  /** Releases the microphone stream and any recognition session. */
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
   * Starts listening to user's microphone
   */
  const startListening = useCallback(
    async (
      languageCode = 'te-IN',
      onSpeechRecognized?: (text: string, isFinal: boolean) => void
    ) => {
      // Ignore double taps while a capture session is still being set up.
      if (isStartingRef.current) return;
      isStartingRef.current = true;

      try {
        // Intercept any active audio playback first
        if (voiceManagerRef.current?.getIsSpeaking()) {
          interrupt();
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch (err: any) {
          console.error('[useVoiceAssistant] Microphone unavailable:', err);
          throw new Error(describeMicError(err));
        }

        activeStreamRef.current = stream;
        audioChunksRef.current = [];
        liveTranscriptRef.current = '';
        listeningStartedAtRef.current = Date.now();

        // Connect stream to analyser for visual wave reaction
        try {
          analyserRef.current.connectMediaStream(stream);
        } catch (err) {
          console.warn('[useVoiceAssistant] Visualiser unavailable:', err);
        }

        // Record audio for Gemini multimodal input
        try {
          const mimeType = MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/mp4';

          const recorder = new MediaRecorder(stream, { mimeType });
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

        // Optional Web Speech API recognition for live transcript feedback.
        // Electron often lacks this API, so its absence is not an error.
        const SpeechRec =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
        engine?: 'auto' | 'edge' | 'gemini' | 'system';
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
    interrupt,
  };
}
