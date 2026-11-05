// Energy-based voice activity detection for hands-free mode.
//
// The detector is fed microphone levels (0-1) with timestamps and decides when
// an utterance starts and ends. Pure logic, no DOM, so it is unit-testable.

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
}

export const DEFAULT_VAD_OPTIONS: VadOptions = {
  startThreshold: 0.12,
  endThreshold: 0.055,
  speechStartMs: 100,
  speechEndMs: 1200,
};

/** Barge-in during TTS playback: stricter, so speaker echo does not trigger it. */
export const BARGE_IN_VAD_OPTIONS: VadOptions = {
  startThreshold: 0.18,
  endThreshold: 0.075,
  speechStartMs: 120,
  speechEndMs: 600,
};

export type VadEvent =
  | { type: 'start' }
  | { type: 'end', durationMs: number, peakLevel: number };

export class VoiceActivityDetector {
  private readonly options: VadOptions;
  private speaking = false;
  private startedAt = 0;
  private loudSince: number | null = null;
  private quietSince: number | null = null;
  private peak = 0;

  constructor(options: Partial<VadOptions> = {}) {
    this.options = { ...DEFAULT_VAD_OPTIONS, ...options };
  }

  public get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Feed one level sample. Returns an event when the state changes. */
  public update(level: number, nowMs: number): VadEvent | null {
    if (level > this.peak) this.peak = level;

    if (!this.speaking) {
      if (level >= this.options.startThreshold) {
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

    // speaking: wait for sustained quiet to close the utterance
    if (level < this.options.endThreshold) {
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

  private reset(): void {
    this.speaking = false;
    this.loudSince = null;
    this.quietSince = null;
    this.startedAt = 0;
    this.peak = 0;
  }
}
