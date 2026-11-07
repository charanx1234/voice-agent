// Energy-based voice activity detection for hands-free mode.
//
// The detector is fed microphone levels (0-1) with timestamps and decides when
// an utterance starts and ends. Pure logic, no DOM, so it is unit-testable.
//
// Adaptive thresholds: the caller can feed a live ambient noise floor estimate
// so the start/end thresholds automatically rise in noisy environments.

export interface VadOptions {
  /** Level that counts as speech (0-1). */
  startThreshold: number;
  /** Level below which speech is considered over; lower than startThreshold
   * (hysteresis) so trailing quiet syllables don't split one utterance. */
  endThreshold: number;
  /** Speech must be sustained this long before "start" fires (ms). */
  speechStartMs: number;
  /** Quiet must be sustained this long before "end" fires (ms). */
  speechEndMs: number;
  /**
   * Noise gate multiplier applied on top of the ambient noise floor.
   * When > 1, the detector requires the signal to be proportionally
   * louder than background noise before triggering speech.
   * Default 1.0 (no additional gate).
   */
  noiseGateMultiplier?: number;
  /** Maximum utterance duration (ms) before forcing turn completion. Default 30,000ms. */
  maxUtteranceMs?: number;
}

export const DEFAULT_VAD_OPTIONS: VadOptions = {
  startThreshold: 0.12,
  endThreshold: 0.055,
  speechStartMs: 100,
  speechEndMs: 1200,
  noiseGateMultiplier: 1.0,
  maxUtteranceMs: 30000,
};

/** Barge-in during TTS playback: stricter, so speaker echo does not trigger it. */
export const BARGE_IN_VAD_OPTIONS: VadOptions = {
  startThreshold: 0.24,
  endThreshold: 0.09,
  speechStartMs: 160,
  speechEndMs: 600,
  noiseGateMultiplier: 1.4,
  maxUtteranceMs: 30000,
};

export type VadEvent =
  | { type: 'start' }
  | { type: 'end'; durationMs: number; peakLevel: number };

export class VoiceActivityDetector {
  private readonly options: VadOptions;
  private speaking = false;
  private startedAt = 0;
  private loudSince: number | null = null;
  private quietSince: number | null = null;
  private peak = 0;

  /** Running ambient noise floor estimate. Updated externally via setAmbientFloor(). */
  private ambientFloor = 0;

  constructor(options: Partial<VadOptions> = {}) {
    this.options = { ...DEFAULT_VAD_OPTIONS, ...options };
  }

  public get isSpeaking(): boolean {
    return this.speaking;
  }

  /**
   * Updates the adaptive noise floor. Called from the audio processing loop
   * when the ambient noise level changes (e.g., a fan turns on).
   * The VAD dynamically raises its effective threshold to stay above noise.
   */
  public setAmbientFloor(floor: number): void {
    this.ambientFloor = Math.max(0, floor);
  }

  /** Effective start threshold accounting for adaptive ambient noise floor. */
  private get effectiveStartThreshold(): number {
    const gate = this.options.noiseGateMultiplier ?? 1.0;
    return Math.max(this.options.startThreshold, this.ambientFloor * gate * 1.8);
  }

  /** Effective end threshold accounting for adaptive ambient noise floor. */
  private get effectiveEndThreshold(): number {
    const gate = this.options.noiseGateMultiplier ?? 1.0;
    return Math.max(this.options.endThreshold, this.ambientFloor * gate * 1.2);
  }

  /** Feed one level sample. Returns an event when the state changes. */
  public update(level: number, nowMs: number): VadEvent | null {
    if (level > this.peak) this.peak = level;

    if (!this.speaking) {
      if (level >= this.effectiveStartThreshold) {
        this.loudSince ??= nowMs;
        if (nowMs - this.loudSince >= this.options.speechStartMs) {
          this.speaking = true;
          this.startedAt = this.loudSince;
          this.quietSince = null;
          return { type: 'start' };
        }
      } else {
        this.loudSince = null;
      }
      return null;
    }

    // speaking: check maximum utterance duration timeout first
    if (this.options.maxUtteranceMs && nowMs - this.startedAt >= this.options.maxUtteranceMs) {
      const durationMs = nowMs - this.startedAt;
      const peakLevel = this.peak;
      this.reset();
      return { type: 'end', durationMs, peakLevel };
    }

    // speaking: wait for sustained quiet to close the utterance
    if (level < this.effectiveEndThreshold) {
      this.quietSince ??= nowMs;
      if (nowMs - this.quietSince >= this.options.speechEndMs) {
        const durationMs = nowMs - this.startedAt;
        const peakLevel = this.peak;
        this.reset();
        return { type: 'end', durationMs, peakLevel };
      }
    } else {
      this.quietSince = null;
    }
    return null;
  }

  public finish(nowMs: number): VadEvent | null {
    if (!this.speaking) return null;
    const durationMs = nowMs - this.startedAt;
    const peakLevel = this.peak;
    this.reset();
    return { type: 'end', durationMs: durationMs, peakLevel: peakLevel };
  }

  public reset(): void {
    this.speaking = false;
    this.loudSince = null;
    this.quietSince = null;
    this.startedAt = 0;
    this.peak = 0;
  }
}
