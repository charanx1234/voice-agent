/**
 * Real-Time Double Clap Wake Detector
 */

export interface ClapDetectorOptions {
  sensitivity?: number; // 0.0 to 1.0 (default 0.75)
  onDoubleClap?: () => void;
  cooldownMs?: number;
}

export class DoubleClapDetector {
  private sensitivity: number;
  private onDoubleClapCallback?: () => void;
  private firstClapTime = 0;
  private lastTriggerTime = 0;
  private suppressedUntil = 0;
  private previousRms = 0;
  private readonly MIN_INTERVAL_MS = 140; // Claps cannot be faster than 140ms
  private readonly MAX_INTERVAL_MS = 1200; // Second clap must arrive within 1.2s
  private readonly COOLDOWN_MS = 1500; // Cooldown after a double-clap

  constructor(options: ClapDetectorOptions = {}) {
    this.sensitivity = Math.max(0.2, Math.min(1.0, options.sensitivity ?? 0.75));
    this.onDoubleClapCallback = options.onDoubleClap;
  }

  public setSensitivity(val: number): void {
    this.sensitivity = Math.max(0.2, Math.min(1.0, val));
  }

  public setOnDoubleClap(cb: () => void): void {
    this.onDoubleClapCallback = cb;
  }

  public suppress(durationMs = 600): void {
    this.suppressedUntil = Math.max(this.suppressedUntil, Date.now() + durationMs);
  }

  public isSuppressed(): boolean {
    return Date.now() < this.suppressedUntil;
  }

  public reset(): void {
    this.firstClapTime = 0;
    this.previousRms = 0;
  }

  public process(
    samples: Float32Array,
    rms: number,
    freqData?: Uint8Array,
    timestamp?: number
  ): boolean {
    const now = timestamp ?? Date.now();

    if (this.isSuppressed() || (this.lastTriggerTime > 0 && now - this.lastTriggerTime < this.COOLDOWN_MS)) {
      this.previousRms = rms;
      return false;
    }

    // 1. Calculate Peak Amplitude from samples
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }

    // 2. Detection Criteria
    const minPeak = 0.14 * (1.3 - this.sensitivity * 0.5);
    const minRms = 0.03 * (1.3 - this.sensitivity * 0.5);
    const attackDelta = rms - this.previousRms;
    const isSharpAttack = peak >= minPeak && (attackDelta >= minRms * 0.7 || (this.previousRms > 0 && rms / this.previousRms >= 1.8));
    const crestFactor = rms > 0.001 ? peak / rms : 0;
    const isImpulsive = crestFactor >= 1.8;

    let hasHighFreq = true;
    if (freqData && freqData.length >= 64) {
      let lowEnergy = 0;
      let highEnergy = 0;
      const midPoint = Math.floor(freqData.length / 4);
      for (let i = 1; i < midPoint; i++) lowEnergy += freqData[i];
      for (let i = midPoint; i < freqData.length; i++) highEnergy += freqData[i];
      if (highEnergy < lowEnergy * 0.15 && highEnergy < 20) {
        hasHighFreq = false;
      }
    }

    const isClap = isSharpAttack && isImpulsive && hasHighFreq;
    this.previousRms = rms;

    if (!isClap) {
      if (this.firstClapTime > 0 && now - this.firstClapTime > this.MAX_INTERVAL_MS) {
        this.firstClapTime = 0;
      }
      return false;
    }

    // First clap registered
    if (this.firstClapTime === 0) {
      this.firstClapTime = now;
      return false;
    }

    const elapsed = now - this.firstClapTime;

    if (elapsed < this.MIN_INTERVAL_MS) {
      // Too fast - echo/reverb
      return false;
    }

    if (elapsed <= this.MAX_INTERVAL_MS) {
      // Double clap confirmed!
      this.firstClapTime = 0;
      this.lastTriggerTime = now;
      this.onDoubleClapCallback?.();
      return true;
    }

    // Past window, reset and treat as new first clap
    this.firstClapTime = now;
    return false;
  }
}

export const doubleClapDetector = new DoubleClapDetector();
