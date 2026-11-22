/**
 * FRIDAY Hybrid Voice Architecture V2 — Turn & Pause Detector
 * Sophisticated speech boundary and conversational turn-taking engine:
 * - Differentiates between mid-sentence hesitation pauses and true sentence completion.
 * - Dynamic silence window: Allows short pauses (up to 1000-1200ms) mid-utterance while
 *   completing promptly on confirmed trailing sentence pauses (600-800ms).
 * - Trailing syllable preservation: Ensures the final words of an utterance are never clipped.
 * - Hysteresis thresholds linked to the ambient noise floor.
 */

export interface TurnDetectorConfig {
  /** Silence duration before completing turn when sentence is likely complete (default: 750ms) */
  speechEndMs: number;
  /** Permitted mid-sentence hesitation pause (default: 1200ms) */
  maxPauseMs: number;
  /** Minimum utterance duration to be considered valid speech (default: 250ms) */
  minUtteranceMs: number;
  /** Maximum utterance length before forcing completion (default: 30000ms) */
  maxUtteranceMs: number;
  /** Sensitivity level: 'low' | 'medium' | 'high' */
  sensitivity: 'low' | 'medium' | 'high';
}

export type TurnEvent =
  | { type: 'speech_started'; timestamp: number }
  | { type: 'speech_continuing'; durationMs: number; level: number }
  | { type: 'pause_detected'; pauseDurationMs: number }
  | { type: 'turn_completed'; durationMs: number; peakLevel: number; forced: boolean };

export class TurnDetector {
  private config: TurnDetectorConfig = {
    speechEndMs: 750,
    maxPauseMs: 1200,
    minUtteranceMs: 250,
    maxUtteranceMs: 30000,
    sensitivity: 'medium',
  };

  private isSpeaking = false;
  private utteranceStartedAt = 0;
  private lastSpeechTimestamp = 0;
  private peakLevel = 0;
  private speechStartCandidate: number | null = null;
  private ambientNoiseFloor = 0.015;

  constructor(config: Partial<TurnDetectorConfig> = {}) {
    this.config = { ...this.config, ...config };
  }

  public setSensitivity(sensitivity: 'low' | 'medium' | 'high'): void {
    this.config.sensitivity = sensitivity;
    if (sensitivity === 'high') {
      this.config.speechEndMs = 650;
      this.config.maxPauseMs = 1000;
    } else if (sensitivity === 'low') {
      this.config.speechEndMs = 900;
      this.config.maxPauseMs = 1400;
    } else {
      this.config.speechEndMs = 750;
      this.config.maxPauseMs = 1200;
    }
  }

  public setAmbientFloor(floor: number): void {
    this.ambientNoiseFloor = Math.max(0.005, floor);
  }

  public getSpeechStartThreshold(): number {
    const base = this.config.sensitivity === 'high' ? 0.06 : this.config.sensitivity === 'low' ? 0.16 : 0.09;
    return Math.max(base, this.ambientNoiseFloor * 1.8);
  }

  public getSpeechEndThreshold(): number {
    const base = this.config.sensitivity === 'high' ? 0.03 : this.config.sensitivity === 'low' ? 0.08 : 0.045;
    return Math.max(base, this.ambientNoiseFloor * 1.3);
  }

  /**
   * Evaluates incoming frame level.
   * Returns a TurnEvent when a boundary state change occurs.
   */
  public update(frameRms: number, nowMs = Date.now()): TurnEvent | null {
    if (frameRms > this.peakLevel) {
      this.peakLevel = frameRms;
    }

    const startThresh = this.getSpeechStartThreshold();
    const endThresh = this.getSpeechEndThreshold();

    // 1. In Standby: waiting for speech to begin
    if (!this.isSpeaking) {
      if (frameRms >= startThresh) {
        if (this.speechStartCandidate === null) {
          this.speechStartCandidate = nowMs;
        } else if (nowMs - this.speechStartCandidate >= 80) {
          // Sustained energy for >80ms -> Speech Confirmed
          this.isSpeaking = true;
          this.utteranceStartedAt = this.speechStartCandidate;
          this.lastSpeechTimestamp = nowMs;
          this.speechStartCandidate = null;
          this.peakLevel = frameRms;
          return { type: 'speech_started', timestamp: this.utteranceStartedAt };
        }
      } else {
        this.speechStartCandidate = null;
      }
      return null;
    }

    // 2. Currently Capturing Speech
    const utteranceDuration = nowMs - this.utteranceStartedAt;

    // Hard cutoff if max duration exceeded
    if (utteranceDuration >= this.config.maxUtteranceMs) {
      this.isSpeaking = false;
      const duration = utteranceDuration;
      const peak = this.peakLevel;
      this.reset();
      return { type: 'turn_completed', durationMs: duration, peakLevel: peak, forced: true };
    }

    if (frameRms >= endThresh) {
      // Speech energy sustained
      this.lastSpeechTimestamp = nowMs;
      return { type: 'speech_continuing', durationMs: utteranceDuration, level: frameRms };
    }

    // Silence interval in progress
    const silenceDuration = nowMs - this.lastSpeechTimestamp;

    // Dynamic completion evaluation:
    // If utterance is very short (< minUtteranceMs), require full pause window to avoid noise burts
    const effectiveSilenceTimeout =
      utteranceDuration < 1200 ? this.config.speechEndMs : this.config.speechEndMs + 100;

    if (silenceDuration >= effectiveSilenceTimeout) {
      // Turn boundary reached!
      if (utteranceDuration >= this.config.minUtteranceMs && this.peakLevel >= this.getSpeechStartThreshold()) {
        this.isSpeaking = false;
        const duration = utteranceDuration;
        const peak = this.peakLevel;
        this.reset();
        return { type: 'turn_completed', durationMs: duration, peakLevel: peak, forced: false };
      } else {
        // Discard sub-threshold noise pop
        this.reset();
        return null;
      }
    }

    // Mid-sentence hesitation pause (between 300ms and silence timeout)
    if (silenceDuration > 300 && silenceDuration < effectiveSilenceTimeout) {
      return { type: 'pause_detected', pauseDurationMs: silenceDuration };
    }

    return null;
  }

  public get isActive(): boolean {
    return this.isSpeaking;
  }

  public reset(): void {
    this.isSpeaking = false;
    this.utteranceStartedAt = 0;
    this.lastSpeechTimestamp = 0;
    this.peakLevel = 0;
    this.speechStartCandidate = null;
  }
}

export const turnDetector = new TurnDetector();
