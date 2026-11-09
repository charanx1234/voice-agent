/**
 * Real-Time Deliberate Double-Clap Wake Detector
 * Specially tuned to reject keyboard typing, mouse clicks, desk bumps, and speech.
 */

export interface ClapDetectorOptions {
  sensitivity?: number; // 0.0 to 1.0 (default 0.70)
  onDoubleClap?: () => void;
  cooldownMs?: number;
}

export class DoubleClapDetector {
  private sensitivity: number;
  private onDoubleClapCallback?: () => void;
  private firstClapTime = 0;
  private lastTriggerTime = 0;
  private suppressedUntil = 0;
  private previousPeak = 0;
  private previousRms = 0;
  private sustainedLoudFrames = 0;

  // Deliberate human double-clap timing constraints:
  // - Human hands cannot clap twice faster than ~180ms (faster is echo or resonance)
  // - A deliberate double-clap completes within ~800ms
  private readonly MIN_INTERVAL_MS = 180;
  private readonly MAX_INTERVAL_MS = 800;
  private readonly COOLDOWN_MS = 2500;

  constructor(options: ClapDetectorOptions = {}) {
    this.sensitivity = Math.max(0.2, Math.min(1.0, options.sensitivity ?? 0.70));
    this.onDoubleClapCallback = options.onDoubleClap;
  }

  public setSensitivity(val: number): void {
    this.sensitivity = Math.max(0.2, Math.min(1.0, val));
  }

  public setOnDoubleClap(cb: () => void): void {
    this.onDoubleClapCallback = cb;
  }

  public suppress(durationMs = 1000): void {
    this.suppressedUntil = Math.max(this.suppressedUntil, Date.now() + durationMs);
    this.firstClapTime = 0;
    this.sustainedLoudFrames = 0;
  }

  public isSuppressed(): boolean {
    return Date.now() < this.suppressedUntil;
  }

  public reset(): void {
    this.firstClapTime = 0;
    this.previousPeak = 0;
    this.previousRms = 0;
    this.sustainedLoudFrames = 0;
  }

  /**
   * Process an audio frame for deliberate double-clap detection.
   * Returns true ONLY when a genuine double-clap pattern is confirmed.
   */
  public process(
    samples: Float32Array,
    rms: number,
    freqData?: Uint8Array,
    timestamp?: number
  ): boolean {
    const now = timestamp ?? Date.now();

    // Check suppression and cooldown
    if (this.isSuppressed() || (this.lastTriggerTime > 0 && now - this.lastTriggerTime < this.COOLDOWN_MS)) {
      this.previousPeak = 0;
      this.previousRms = rms;
      this.firstClapTime = 0;
      return false;
    }

    // 1. Calculate Peak Amplitude
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }

    // 2. Reject sustained sounds (speech, coughing, continuous noise)
    // A clap is an instantaneous transient (< 40ms). If loud audio persists, it's not a clap.
    if (rms > 0.06 || peak > 0.25) {
      this.sustainedLoudFrames++;
      if (this.sustainedLoudFrames > 3) {
        // More than ~60ms of continuous sound: reset first clap candidate
        this.firstClapTime = 0;
        this.previousPeak = peak;
        this.previousRms = rms;
        return false;
      }
    } else {
      this.sustainedLoudFrames = 0;
    }

    // 3. Acoustic Criteria for a Real Hand Clap
    // Sensitivity scales the required peak: higher sensitivity allows slightly softer claps (min 0.32),
    // but never allows ambient noise, typing, or mouse clicks (which stay below 0.22).
    const minPeak = 0.42 - (this.sensitivity * 0.12); // Range: ~0.30 to 0.40 (typing is ~0.10-0.20)
    const minAttackJump = 0.20; // Jump in peak from previous frame

    const isLoudEnough = peak >= minPeak;
    const isSharpAttack = (peak - this.previousPeak) >= minAttackJump || (this.previousRms < 0.03 && rms >= 0.05);

    // Crest factor: peak / rms. Pure impulse has high crest factor (> 3.0), continuous speech has ~1.5 - 2.5.
    const crestFactor = rms > 0.005 ? peak / rms : 0;
    const isImpulsive = crestFactor >= 2.8;

    // 4. Spectral Distribution: A clap has broad high-frequency acoustic presence.
    // Low thumps (footsteps, desk bumps) are low-frequency heavy; speech vowels are < 1.5 kHz.
    let hasHighFreq = true;
    if (freqData && freqData.length >= 64) {
      let lowEnergy = 0;
      let highEnergy = 0;
      const midPoint = Math.floor(freqData.length / 4);
      for (let i = 1; i < midPoint; i++) lowEnergy += freqData[i];
      for (let i = midPoint; i < freqData.length; i++) highEnergy += freqData[i];

      // If low-frequency energy overwhelms high frequencies by more than 4x, it's a thump/vowel
      if (lowEnergy > highEnergy * 4.0 || highEnergy < 35) {
        hasHighFreq = false;
      }
    }

    const isClap = isLoudEnough && isSharpAttack && isImpulsive && hasHighFreq;

    this.previousPeak = peak;
    this.previousRms = rms;

    // If no clap detected in this frame, check if waiting for 2nd clap timed out
    if (!isClap) {
      if (this.firstClapTime > 0 && now - this.firstClapTime > this.MAX_INTERVAL_MS) {
        this.firstClapTime = 0; // Window expired
      }
      return false;
    }

    // A valid single clap candidate was detected!
    if (this.firstClapTime === 0) {
      // First clap recorded: start interval timer
      this.firstClapTime = now;
      return false;
    }

    // Evaluating second clap
    const elapsed = now - this.firstClapTime;

    if (elapsed < this.MIN_INTERVAL_MS) {
      // Reverb/echo from the first clap: ignore
      return false;
    }

    if (elapsed <= this.MAX_INTERVAL_MS) {
      // Valid deliberate double-clap confirmed!
      console.info(`[DoubleClap] Confirmed! Interval: ${elapsed}ms, Peak: ${peak.toFixed(2)}, Crest: ${crestFactor.toFixed(1)}`);
      this.firstClapTime = 0;
      this.lastTriggerTime = now;
      this.suppressedUntil = now + this.COOLDOWN_MS;
      this.onDoubleClapCallback?.();
      return true;
    }

    // Past interval window: reset and count this clap as a new first clap
    this.firstClapTime = now;
    return false;
  }
}

export const doubleClapDetector = new DoubleClapDetector();
