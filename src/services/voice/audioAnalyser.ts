// Web Audio API Analyser for Live Mouth Lip-Sync & Waveform Visualization

export class AudioAnalyser {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
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
   * For synthetic speech (SpeechSynthesisUtterance) where direct WebAudio node isn't exposed by browser,
   * we generate realistic acoustic envelope pulses during speech playback to drive natural mouth movement.
   */
  public simulateSpeakingAnimation(isPlaying: () => boolean): void {
    this.disconnect();
    let tick = 0;

    const loop = () => {
      if (!isPlaying()) {
        if (this.onAmplitudeCallback) {
          this.onAmplitudeCallback(0, [0, 0, 0, 0, 0]);
        }
        return;
      }

      tick += 0.25;
      // Combine multiple sine waves for realistic conversational cadence and syllables
      const base = Math.sin(tick) * 0.35 + Math.sin(tick * 2.3) * 0.25 + 0.4;
      const amplitude = Math.max(0.1, Math.min(1.0, base));

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
    const loop = () => {
      if (!this.analyser || !this.dataArray) return;

      this.analyser.getByteFrequencyData(this.dataArray as any);

      let sum = 0;
      const sliceCount = 8;
      const freqSample: number[] = [];

      for (let i = 0; i < sliceCount; i++) {
        const val = this.dataArray[i] / 255;
        freqSample.push(val);
        sum += val;
      }

      const avgAmplitude = sum / sliceCount;

      if (this.onAmplitudeCallback) {
        this.onAmplitudeCallback(avgAmplitude, freqSample);
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
    if (this.onAmplitudeCallback) {
      this.onAmplitudeCallback(0, [0, 0, 0, 0, 0]);
    }
  }
}
