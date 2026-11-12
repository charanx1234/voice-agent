/**
 * FRIDAY VoiceFlow Microphone Capture & VAD Session Manager
 * Captures clean 16kHz mono PCM audio via Web Audio API, tracks speech levels in real-time,
 * detects the end of the user's utterance via adaptive VAD silence detection,
 * and encodes the recorded utterance to standard RIFF WAVE for the local Whisper engine.
 */

import { VoiceActivityDetector, VadOptions } from '../voice/voiceActivity';
import { encodeWav, resampleAudio, uint8ArrayToBase64 } from '../voice/wavEncoder';

export interface VoiceFlowCaptureCallbacks {
  onLevel?: (level: number) => void;
  onSpeechStart?: () => void;
  onUtteranceComplete?: (audioBase64: string, durationMs: number) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

export class VoiceFlowCapture {
  private audioCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;

  private vad: VoiceActivityDetector | null = null;
  private recordedSamples: Float32Array[] = [];
  private totalSampleCount = 0;
  private isCapturing = false;
  private speechHasStarted = false;
  private silenceTimer: NodeJS.Timeout | null = null;
  private callbacks: VoiceFlowCaptureCallbacks = {};
  private silenceTimeoutMs = 700;

  constructor(callbacks: VoiceFlowCaptureCallbacks = {}, silenceTimeoutMs = 700) {
    this.callbacks = callbacks;
    this.silenceTimeoutMs = silenceTimeoutMs;
  }

  public get active(): boolean {
    return this.isCapturing;
  }

  /**
   * Starts capture on the default or specified audio input device.
   */
  public async start(deviceId?: string): Promise<void> {
    if (this.isCapturing) {
      this.stop();
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      this.audioCtx = new AudioContext();
      this.source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.2;

      // 4096 buffer size at 48kHz or 44.1kHz is ~90ms per block
      this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);

      this.vad = new VoiceActivityDetector({
        startThreshold: 0.08,
        endThreshold: 0.04,
        speechStartMs: 120,
        speechEndMs: this.silenceTimeoutMs,
        noiseGateMultiplier: 1.1,
      });

      this.recordedSamples = [];
      this.totalSampleCount = 0;
      this.isCapturing = true;
      this.speechHasStarted = false;

      this.processor.onaudioprocess = (e) => {
        if (!this.isCapturing) return;

        const input = e.inputBuffer.getChannelData(0);
        // Clone samples into memory buffer
        const block = new Float32Array(input.length);
        block.set(input);
        this.recordedSamples.push(block);
        this.totalSampleCount += block.length;

        // Compute RMS level
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) {
          sumSq += input[i] * input[i];
        }
        const rms = Math.sqrt(sumSq / input.length);
        const normalizedLevel = Math.min(1, rms * 5.0); // Boosted level for VU meter
        this.callbacks.onLevel?.(normalizedLevel);

        // VAD evaluation
        const vadEvent = this.vad?.update(normalizedLevel, Date.now());
        if (vadEvent) {
          if (vadEvent.type === 'start') {
            this.speechHasStarted = true;
            this.callbacks.onSpeechStart?.();
          } else if (vadEvent.type === 'end' && this.speechHasStarted) {
            // Speech finished! Trigger completion
            this.finishRecording();
          }
        }
      };

      this.source.connect(this.analyser);
      this.analyser.connect(this.processor);
      this.processor.connect(this.audioCtx.destination);
    } catch (err: any) {
      this.isCapturing = false;
      this.callbacks.onError?.(err?.message || 'Failed to initialize microphone capture.');
    }
  }

  /**
   * Compiles the captured audio into a 16kHz mono WAV base64 string and delivers to callback.
   */
  public finishRecording(): void {
    if (!this.isCapturing) return;
    this.isCapturing = false;

    try {
      const sampleRate = this.audioCtx?.sampleRate || 48000;
      // Merge recorded blocks
      const merged = new Float32Array(this.totalSampleCount);
      let offset = 0;
      for (const block of this.recordedSamples) {
        merged.set(block, offset);
        offset += block.length;
      }

      // Teardown audio nodes immediately to release microphone
      this.cleanupNodes();

      if (merged.length < sampleRate * 0.2) {
        // Audio shorter than 200ms is ignored as noise
        this.callbacks.onCancel?.();
        return;
      }

      // Resample to 16,000 Hz for Whisper
      const resampled = resampleAudio(merged, sampleRate, 16000);
      const wavBytes = encodeWav(resampled, 16000);
      const audioBase64 = uint8ArrayToBase64(wavBytes);
      const durationMs = Math.round((resampled.length / 16000) * 1000);

      this.callbacks.onUtteranceComplete?.(audioBase64, durationMs);
    } catch (err: any) {
      this.callbacks.onError?.(err?.message || 'Audio processing failed.');
    }
  }

  /**
   * Aborts and cancels recording immediately.
   */
  public cancel(): void {
    this.isCapturing = false;
    this.cleanupNodes();
    this.callbacks.onCancel?.();
  }

  public stop(): void {
    this.isCapturing = false;
    this.cleanupNodes();
  }

  private cleanupNodes(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.recordedSamples = [];
    this.totalSampleCount = 0;
  }
}
