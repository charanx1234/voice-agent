import { EnrolledSpeakerProfile, FridaySettings, SpeakerVerificationResult } from '../../shared/types';
import { VoiceActivityDetector, VadOptions, DEFAULT_VAD_OPTIONS, BARGE_IN_VAD_OPTIONS } from './voiceActivity';
import { localWakeWordDetector } from './localWakeWord';
import { speakerVerificationService } from './speakerVerification';
import { ListeningEnvironment, getEnvironmentPreset } from './listeningEnvironment';

export interface AudioPipelineConfig {
  noiseSuppression: 'off' | 'standard' | 'strong';
  echoCancellation: boolean;
  autoGainControl: boolean;
  vadSensitivity: 'low' | 'medium' | 'high';
  deviceId?: string;
  speakerVerificationEnabled?: boolean;
  enrolledVoiceProfile?: EnrolledSpeakerProfile;
  /**
   * Listening environment preset. When set, it overrides individual
   * noiseSuppression / vadSensitivity / compressor parameters.
   */
  listeningEnvironment?: ListeningEnvironment;
}

export interface MicTestResult {
  success: boolean;
  snrDb: number;
  peakLevel: number;
  noiseFloor: number;
  voiceDetected: boolean;
  playbackBase64?: string;
  mimeType?: string;
  error?: string;
}

/** Real-time diagnostics snapshot exposed to the UI. */
export interface AudioPipelineDiagnostics {
  /** Selected microphone label (may be empty if permission not yet granted). */
  micLabel: string;
  /** Whether the pipeline is running. */
  active: boolean;
  /** Whether audio is currently being captured to a recording. */
  capturing: boolean;
  /** Whether FRIDAY is speaking (ducking active). */
  fridaySpeaking: boolean;
  /** Current live input level (0–1). */
  liveLevel: number;
  /** Estimated ambient noise floor (0–1). */
  ambientNoiseFloor: number;
  /** Whether the VAD believes speech is in progress. */
  speechDetected: boolean;
  /** Noise suppression mode in use. */
  noiseSuppression: 'off' | 'standard' | 'strong';
  /** Echo cancellation state. */
  echoCancellation: boolean;
  /** VAD sensitivity in use. */
  vadSensitivity: 'low' | 'medium' | 'high';
  /** Active listening environment label. */
  listeningEnvironment: ListeningEnvironment;
  /** True when signal level approaches clipping. */
  clipping: boolean;
}

export interface AudioPipelineCallbacks {
  onLevel?: (level: number) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: (audioBlob: Blob, samples: Float32Array, verification: SpeakerVerificationResult) => void;
  onWakeWord?: () => void;
  onError?: (err: string) => void;
  /** Fires every tick with the latest diagnostics snapshot (optional — only connect if UI is showing). */
  onDiagnostics?: (diag: AudioPipelineDiagnostics) => void;
}

/**
 * Advanced Voice Isolation & Audio Processing Pipeline
 * Coordinates WebRTC AEC/AGC/NoiseSuppression, Web Audio bandpass & vocal filters,
 * multi-band noise gating, ducking, real-time adaptive VAD, local wake-word,
 * and speaker verification.
 *
 * Key improvement over the original: the VoiceActivityDetector now receives a
 * running ambient noise floor update on every tick, so VAD thresholds adapt
 * dynamically when background noise changes (fan, TV, etc.).
 */
export class AudioPipeline {
  private config: AudioPipelineConfig = {
    noiseSuppression: 'standard',
    echoCancellation: true,
    autoGainControl: true,
    vadSensitivity: 'medium',
  };

  private callbacks: AudioPipelineCallbacks = {};
  private audioCtx: AudioContext | null = null;
  private rawStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private vocalPresenceFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private duckingGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private pcmSamplesBuffer: Float32Array[] = [];

  private isRunning = false;
  private isCapturing = false;
  private isFridaySpeaking = false;
  private animFrameId: number | null = null;

  private vad: VoiceActivityDetector;
  private ambientNoiseFloor = 0.02;
  private liveLevel = 0;
  private clipping = false;

  /** Label of the microphone track that opened successfully. */
  private micLabel = '';

  constructor(config?: Partial<AudioPipelineConfig>) {
    if (config) this.config = { ...this.config, ...config };
    this.vad = new VoiceActivityDetector(this.getVadOptions());
  }

  public setCallbacks(cb: AudioPipelineCallbacks): void {
    this.callbacks = cb;
  }

  public updateConfig(patch: Partial<AudioPipelineConfig>): void {
    const prev = { ...this.config };
    this.config = { ...this.config, ...patch };

    // Update VAD sensitivity
    if (patch.vadSensitivity || patch.listeningEnvironment) {
      this.vad = new VoiceActivityDetector(this.getVadOptions());
    }

    // Apply runtime filter updates if audio graph is running
    if (this.audioCtx && this.highpassFilter && this.lowpassFilter) {
      this.applyFilterSettings();
    }

    // If device ID changed or AEC/NS changed, restart capture stream cleanly
    if (
      this.isRunning &&
      (patch.deviceId !== undefined && patch.deviceId !== prev.deviceId ||
        patch.echoCancellation !== undefined && patch.echoCancellation !== prev.echoCancellation ||
        patch.noiseSuppression !== undefined && patch.noiseSuppression !== prev.noiseSuppression)
    ) {
      void this.restartStream();
    }
  }

  /** Returns the current ambient noise floor for external monitoring. */
  public getAmbientNoiseFloor(): number {
    return this.ambientNoiseFloor;
  }

  /** Returns whether the VAD is currently detecting speech. */
  public getIsSpeechDetected(): boolean {
    return this.vad.isSpeaking;
  }

  private getEffectiveNoiseSuppression(): 'off' | 'standard' | 'strong' {
    if (this.config.listeningEnvironment) {
      return getEnvironmentPreset(this.config.listeningEnvironment).noiseSuppression;
    }
    return this.config.noiseSuppression;
  }

  private getEffectiveVadSensitivity(): 'low' | 'medium' | 'high' {
    if (this.config.listeningEnvironment) {
      return getEnvironmentPreset(this.config.listeningEnvironment).vadSensitivity;
    }
    return this.config.vadSensitivity;
  }

  private getNoiseGateMultiplier(): number {
    if (this.config.listeningEnvironment) {
      return getEnvironmentPreset(this.config.listeningEnvironment).noiseGateMultiplier;
    }
    return 1.0;
  }

  private getVadOptions(): VadOptions {
    const sens = this.getEffectiveVadSensitivity();
    const gate = this.getNoiseGateMultiplier();
    switch (sens) {
      case 'high':
        return {
          startThreshold: 0.065,
          endThreshold: 0.035,
          speechStartMs: 90,
          speechEndMs: 1100,
          noiseGateMultiplier: gate,
          maxUtteranceMs: 30000,
        };
      case 'low':
        return {
          startThreshold: 0.22,
          endThreshold: 0.10,
          speechStartMs: 140,
          speechEndMs: 1600,
          noiseGateMultiplier: gate,
          maxUtteranceMs: 30000,
        };
      case 'medium':
      default:
        return { ...DEFAULT_VAD_OPTIONS, speechEndMs: 1300, noiseGateMultiplier: gate, maxUtteranceMs: 30000 };
    }
  }

  /**
   * Starts the continuous microphone stream and Web Audio processing graph.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      const effectiveNS = this.getEffectiveNoiseSuppression();
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: this.config.deviceId ? { exact: this.config.deviceId } : undefined,
          echoCancellation: this.config.echoCancellation !== false,
          noiseSuppression: effectiveNS !== 'off',
          autoGainControl: this.config.autoGainControl !== false,
          // Request 16kHz mono for lower latency and better speech model compatibility.
          // Browsers may not honour all advanced constraints; fail gracefully.
          sampleRate: { ideal: 16000 },
          channelCount: { ideal: 1 },
        },
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.rawStream = stream;

      // Capture the microphone track label for diagnostics
      const audioTrack = stream.getAudioTracks()[0];
      this.micLabel = audioTrack?.label || '';

      // Notify about unexpected device (e.g., user has set a specific device but
      // the browser opened a different one due to OS routing).
      if (this.config.deviceId && audioTrack && !audioTrack.getSettings().deviceId?.startsWith(this.config.deviceId)) {
        console.warn('[AudioPipeline] Opened microphone device does not match requested deviceId. OS may have redirected to a different device.');
      }

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      this.audioCtx = ctx;

      // 1. Source Node
      this.sourceNode = ctx.createMediaStreamSource(stream);

      // 2. High-pass filter (cuts low rumble, desk thumps, AC/fan drone <85-110Hz)
      this.highpassFilter = ctx.createBiquadFilter();
      this.highpassFilter.type = 'highpass';

      // 3. Low-pass filter (cuts keyboard clicks, mouse clicks, hiss >3400-3800Hz)
      this.lowpassFilter = ctx.createBiquadFilter();
      this.lowpassFilter.type = 'lowpass';

      // 4. Peaking vocal presence filter (boosts 1.2kHz - 2.2kHz human speech intelligibility)
      this.vocalPresenceFilter = ctx.createBiquadFilter();
      this.vocalPresenceFilter.type = 'peaking';
      this.vocalPresenceFilter.frequency.value = 1600;
      this.vocalPresenceFilter.Q.value = 1.2;
      this.vocalPresenceFilter.gain.value = 3.5;

      // 5. AGC & Dynamics Limiter Compressor
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 20;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      // 6. Ducking Gain (attenuates mic when FRIDAY is speaking to prevent loopback)
      this.duckingGain = ctx.createGain();
      this.duckingGain.gain.value = 1.0;

      // 7. Analyser for FFT & level measurement
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3;

      // 8. Destination for clean MediaRecorder
      this.destinationNode = ctx.createMediaStreamDestination();

      this.applyFilterSettings();

      // Connect Web Audio Graph
      this.sourceNode.connect(this.highpassFilter);
      this.highpassFilter.connect(this.lowpassFilter);
      this.lowpassFilter.connect(this.vocalPresenceFilter);
      this.vocalPresenceFilter.connect(this.compressor);
      this.compressor.connect(this.duckingGain);

      this.duckingGain.connect(this.analyser);
      this.duckingGain.connect(this.destinationNode);

      this.isRunning = true;
      this.startProcessingLoop();
    } catch (err: any) {
      console.error('[AudioPipeline] Microphone initialization failed:', err);
      this.callbacks.onError?.(err?.message || 'Could not access microphone.');
      throw err;
    }
  }

  private applyFilterSettings(): void {
    if (!this.highpassFilter || !this.lowpassFilter || !this.compressor) return;

    const effectiveNS = this.getEffectiveNoiseSuppression();
    const envPreset = this.config.listeningEnvironment ? getEnvironmentPreset(this.config.listeningEnvironment) : null;
    const compRatioMult = envPreset?.compressorRatioMultiplier ?? 1.0;

    if (effectiveNS === 'off') {
      this.highpassFilter.frequency.value = 20; // Wide open
      this.lowpassFilter.frequency.value = 20000;
      this.compressor.ratio.value = 1; // Minimal compression
    } else if (effectiveNS === 'strong') {
      // Aggressive human speech isolation
      this.highpassFilter.frequency.value = 110; // Steeper low-end cut
      this.highpassFilter.Q.value = 1.0;
      this.lowpassFilter.frequency.value = 3400; // Tighter high-frequency cut
      this.lowpassFilter.Q.value = 1.0;
      this.compressor.ratio.value = Math.min(20, 10 * compRatioMult);
      this.compressor.threshold.value = -28;
    } else {
      // Standard balance
      this.highpassFilter.frequency.value = 85;
      this.highpassFilter.Q.value = 0.7;
      this.lowpassFilter.frequency.value = 3800;
      this.lowpassFilter.Q.value = 0.7;
      this.compressor.ratio.value = Math.min(20, 6 * compRatioMult);
      this.compressor.threshold.value = -24;
    }
  }

  /**
   * Sets ducking state: attenuates microphone when FRIDAY is speaking through speakers.
   * Does not fully silence the mic — the user can still barge-in.
   */
  public setFridaySpeaking(speaking: boolean): void {
    this.isFridaySpeaking = speaking;
    if (this.duckingGain && this.audioCtx) {
      const targetGain = speaking && this.config.echoCancellation !== false ? 0.08 : 1.0;
      this.duckingGain.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.05);
    }
  }

  /**
   * Begins actively capturing an utterance to be sent to Gemini/AI backend.
   */
  public startCapture(): void {
    if (this.isCapturing || !this.destinationNode) return;
    this.isCapturing = true;
    this.recordedChunks = [];
    this.pcmSamplesBuffer = [];

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(this.destinationNode.stream, { mimeType });
      this.mediaRecorder = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };

      recorder.start(100);
    } catch (err: any) {
      console.error('[AudioPipeline] MediaRecorder start error:', err);
    }
  }

  /**
   * Stops active capture and emits the processed audio blob & speaker verification result.
   */
  public stopCapture(): void {
    if (!this.isCapturing) return;
    this.isCapturing = false;

    const recorder = this.mediaRecorder;
    if (!recorder || recorder.state === 'inactive') return;

    recorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: recorder.mimeType });

      // Combine collected PCM samples for speaker verification
      let totalLength = 0;
      for (const b of this.pcmSamplesBuffer) totalLength += b.length;
      const combinedSamples = new Float32Array(totalLength);
      let offset = 0;
      for (const b of this.pcmSamplesBuffer) {
        combinedSamples.set(b, offset);
        offset += b.length;
      }

      // Run Speaker Verification if enabled
      let verificationResult: SpeakerVerificationResult = {
        verified: true,
        score: 1.0,
        pitchDistance: 0,
        spectralSimilarity: 1.0,
      };

      if (this.config.speakerVerificationEnabled && this.config.enrolledVoiceProfile) {
        const sampleRate = this.audioCtx?.sampleRate || 44100;
        verificationResult = speakerVerificationService.verifySpeaker(
          combinedSamples,
          sampleRate,
          this.config.enrolledVoiceProfile
        );
      }

      this.callbacks.onSpeechEnd?.(blob, combinedSamples, verificationResult);
    };

    try {
      recorder.stop();
    } catch {}
  }

  /**
   * Real-time Audio Loop:
   * Extracts RMS level, updates ambient noise floor, feeds adaptive VAD,
   * checks Local Wake Word in Standby, and gathers PCM samples.
   */
  private startProcessingLoop(): void {
    if (!this.analyser) return;

    const timeDomain = new Float32Array(this.analyser.fftSize);
    const freqData = new Uint8Array(this.analyser.frequencyBinCount);

    const tick = () => {
      if (!this.isRunning || !this.analyser) return;

      this.analyser.getFloatTimeDomainData(timeDomain);
      this.analyser.getByteFrequencyData(freqData);

      // Compute RMS
      let sumSq = 0;
      let maxAbs = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        const abs = Math.abs(timeDomain[i]);
        sumSq += timeDomain[i] * timeDomain[i];
        if (abs > maxAbs) maxAbs = abs;
      }
      let rms = Math.sqrt(sumSq / timeDomain.length);

      // Clipping detection (sample near ±1.0)
      this.clipping = maxAbs > 0.98;

      // Track running ambient noise floor using slow exponential smoothing.
      // Only update from low-energy frames (not from speech or loud transients).
      if (rms > 0.003 && rms < 0.08) {
        this.ambientNoiseFloor = this.ambientNoiseFloor * 0.97 + rms * 0.03;
      }

      // Feed updated noise floor to adaptive VAD so thresholds self-adjust
      this.vad.setAmbientFloor(this.ambientNoiseFloor);

      // In Strong mode, apply software spectral noise gate
      const effectiveNS = this.getEffectiveNoiseSuppression();
      if (effectiveNS === 'strong' && rms < this.ambientNoiseFloor * this.getNoiseGateMultiplier()) {
        rms = 0;
      }

      this.liveLevel = Math.min(1, rms * 4.5);
      this.callbacks.onLevel?.(this.liveLevel);

      // If active capture is running, collect PCM slice
      if (this.isCapturing) {
        const slice = new Float32Array(timeDomain.length);
        slice.set(timeDomain);
        this.pcmSamplesBuffer.push(slice);
      }

      const now = Date.now();

      // 1. In Standby (not capturing, FRIDAY not speaking): Check Local Wake Word
      if (!this.isCapturing && !this.isFridaySpeaking) {
        const wakeDetected = localWakeWordDetector.processFrequencyData(
          freqData,
          this.audioCtx?.sampleRate || 44100
        );
        if (wakeDetected) {
          this.callbacks.onWakeWord?.();
        }
      }

      // 2. VAD: Detect speech onset / completion
      // Scale level down when FRIDAY is speaking to suppress echo from speakers.
      const effectiveLevel = this.isFridaySpeaking ? rms * 0.5 : rms;
      const vadEvent = this.vad.update(effectiveLevel, now);

      if (vadEvent?.type === 'start') {
        if (!this.isCapturing) {
          this.callbacks.onSpeechStart?.();
        }
      } else if (vadEvent?.type === 'end') {
        if (this.isCapturing) {
          this.stopCapture();
        }
      }

      // 3. Emit diagnostics snapshot if a listener is attached
      if (this.callbacks.onDiagnostics) {
        this.callbacks.onDiagnostics({
          micLabel: this.micLabel,
          active: this.isRunning,
          capturing: this.isCapturing,
          fridaySpeaking: this.isFridaySpeaking,
          liveLevel: this.liveLevel,
          ambientNoiseFloor: this.ambientNoiseFloor,
          speechDetected: this.vad.isSpeaking,
          noiseSuppression: this.getEffectiveNoiseSuppression(),
          echoCancellation: this.config.echoCancellation !== false,
          vadSensitivity: this.getEffectiveVadSensitivity(),
          listeningEnvironment: this.config.listeningEnvironment || 'quiet',
          clipping: this.clipping,
        });
      }

      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);
  }

  /**
   * Functional Microphone Test Button Handler:
   * Records 3 seconds through the exact configured audio pipeline, evaluates SNR and peak,
   * and produces a playback blob with base64 for instant user verification.
   */
  public async testMicrophone(durationMs = 3000): Promise<MicTestResult> {
    if (!this.isRunning) {
      await this.start();
    }

    return new Promise((resolve) => {
      if (!this.destinationNode || !this.audioCtx) {
        resolve({
          success: false,
          snrDb: 0,
          peakLevel: 0,
          noiseFloor: 0,
          voiceDetected: false,
          error: 'Audio pipeline destination unavailable.',
        });
        return;
      }

      const chunks: Blob[] = [];
      const samples: Float32Array[] = [];
      let maxPeak = 0;
      let minFloor = 1.0;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(this.destinationNode.stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const testAnalyser = this.analyser;
      const buffer = new Float32Array(testAnalyser ? testAnalyser.fftSize : 256);
      let samplingInterval: any = null;

      if (testAnalyser) {
        samplingInterval = setInterval(() => {
          testAnalyser.getFloatTimeDomainData(buffer);
          let sumSq = 0;
          for (let i = 0; i < buffer.length; i++) {
            const abs = Math.abs(buffer[i]);
            if (abs > maxPeak) maxPeak = abs;
            sumSq += abs * abs;
          }
          const rms = Math.sqrt(sumSq / buffer.length);
          if (rms < minFloor && rms > 0.001) minFloor = rms;
          const slice = new Float32Array(buffer.length);
          slice.set(buffer);
          samples.push(slice);
        }, 50);
      }

      recorder.onstop = () => {
        if (samplingInterval) clearInterval(samplingInterval);
        const testBlob = new Blob(chunks, { type: mimeType });

        const noiseFloor = minFloor === 1.0 ? 0.01 : minFloor;
        const snr = maxPeak > noiseFloor ? 20 * Math.log10(maxPeak / noiseFloor) : 0;
        const voiceDetected = maxPeak > 0.06 && snr > 6;

        const reader = new FileReader();
        reader.onloadend = () => {
          const res = (reader.result as string) || '';
          const b64 = res.split(',')[1] || '';
          resolve({
            success: true,
            snrDb: Math.round(snr * 10) / 10,
            peakLevel: Math.round(maxPeak * 100) / 100,
            noiseFloor: Math.round(noiseFloor * 1000) / 1000,
            voiceDetected,
            playbackBase64: b64,
            mimeType,
          });
        };
        reader.readAsDataURL(testBlob);
      };

      recorder.start();
      setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, durationMs);
    });
  }

  private async restartStream(): Promise<void> {
    this.stop();
    await this.start();
  }

  /**
   * Shuts down audio processing and closes microphone stream.
   */
  public stop(): void {
    this.isRunning = false;
    this.isCapturing = false;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.rawStream) {
      this.rawStream.getTracks().forEach((track) => track.stop());
      this.rawStream = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
