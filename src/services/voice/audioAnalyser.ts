// Web Audio API Analyser for Live Mouth Lip-Sync & Waveform Visualization

export class AudioAnalyser {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private timeDomainArray: Uint8Array | null = null;
  private sourceNode: MediaStreamAudioSourceNode | AudioNode | null = null;
  private animationFrameId: number | null = null;
  private onAmplitudeCallback?: (amplitude: number, frequencies: number[]) => void;

  public init(callback: (amplitude: number, frequencies: number[]) => void): void {
    this.onAmplitudeCallback = callback;
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Connect an HTMLAudioElement or MediaStream to the analyser
   */
  public connectMediaStream(stream: MediaStream): void {
    this.disconnect();
    const ctx = this.getAudioContext();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 64; // Fast, lightweight frequency response
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomainArray = new Uint8Array(this.analyser.fftSize);

    this.sourceNode = ctx.createMediaStreamSource(stream);
    this.sourceNode.connect(this.analyser);

    this.startLoop();
  }

  public connectAudioElement(audioEl: HTMLAudioElement): void {
    this.disconnect();
    const ctx = this.getAudioContext();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 64;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomainArray = new Uint8Array(this.analyser.fftSize);

    try {
      this.sourceNode = ctx.createMediaElementSource(audioEl);
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(ctx.destination);
    } catch {
      // Element might already be connected
    }

    this.startLoop();
  }

  /**
   * SpeechSynthesis does not expose its audio stream to Web Audio in Chromium.
   * Use deterministic text timing as the fallback, with punctuation and
   * whitespace creating real pauses instead of random mouth movement.
   */
  public simulateSpeakingAnimation(isPlaying: () => boolean, speechText = '', rate = 1): void {
    this.disconnect();
    const characters = Array.from(speechText.trim() || '...');
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const safeRate = Math.max(0.7, Math.min(1.5, rate));

    const loop = () => {
      if (!isPlaying()) {
        if (this.onAmplitudeCallback) {
          this.onAmplitudeCallback(0, [0, 0, 0, 0, 0]);
        }
        return;
      }

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsedMs = now - startedAt;
      const charIndex = Math.floor((elapsedMs * safeRate) / 72) % characters.length;
      const character = characters[charIndex];
      const isPause = /\s|[,.!?;:—–-]/.test(character);
      const isOpenSound = /[aeiouyоуअआइईउऊएऐओऔ]/i.test(character);
      const cadence = 0.62 + Math.sin(elapsedMs / 95 + charIndex * 1.31) * 0.2;
      const amplitude = isPause ? 0 : Math.max(0.08, Math.min(1, (isOpenSound ? 0.9 : 0.62) * cadence));

      const frequencies = [
        amplitude * 0.7,
        amplitude * 1.0,
        amplitude * 0.85,
        amplitude * 0.6,
        amplitude * 0.4,
      ];

      if (this.onAmplitudeCallback) {
        this.onAmplitudeCallback(amplitude, frequencies);
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private startLoop(): void {
    let lastFrameTime = 0;
    const targetIntervalMs = 33; // 30 FPS throttle
    let lastSentAmp = 0;

    const loop = () => {
      if (!this.analyser || !this.dataArray || !this.timeDomainArray) return;

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastFrameTime >= targetIntervalMs) {
        lastFrameTime = now;

        this.analyser.getByteFrequencyData(this.dataArray as any);
        this.analyser.getByteTimeDomainData(this.timeDomainArray as any);

        let rmsSum = 0;
        const sliceCount = 8;
        const freqSample: number[] = [];

        for (let i = 0; i < sliceCount; i++) {
          const val = this.dataArray[i] / 255;
          freqSample.push(val);
        }

        for (const sample of this.timeDomainArray) {
          const normalized = (sample - 128) / 128;
          rmsSum += normalized * normalized;
        }
        const rmsAmplitude = Math.sqrt(rmsSum / this.timeDomainArray.length);
        const avgAmplitude = Math.max(0, Math.min(1, rmsAmplitude * 2.6));

        // Skip sending callbacks if silence persists to save IPC & render cycles
        if (avgAmplitude > 0.03 || lastSentAmp > 0) {
          lastSentAmp = avgAmplitude <= 0.03 ? 0 : avgAmplitude;
          if (this.onAmplitudeCallback) {
            this.onAmplitudeCallback(lastSentAmp, freqSample);
          }
        }
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  public disconnect(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    this.analyser = null;
    this.dataArray = null;
    this.timeDomainArray = null;
    if (this.onAmplitudeCallback) {
      this.onAmplitudeCallback(0, [0, 0, 0, 0, 0]);
    }
  }
}
