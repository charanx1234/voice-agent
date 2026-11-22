/**
 * FRIDAY Hybrid Voice Architecture V2 — Acoustic Echo Canceller & Reference Mask
 * Prevents FRIDAY's own TTS playback from feeding back into the microphone
 * and falsely triggering speech recognition or unintended self-interruption.
 *
 * Mechanism:
 * - Playback controller registers active playback frames / energy envelope.
 * - Computes adaptive cross-energy cancellation factor between speaker output and mic capture.
 * - Suppresses acoustic bleed while keeping true user speech audible (Barge-in detection).
 */

export interface EchoCancellerConfig {
  enabled: boolean;
  /** Estimated loopback latency in ms (playback-to-capture acoustic delay) */
  acousticDelayMs?: number;
  /** Suppression depth when FRIDAY is actively speaking (0.0 to 1.0) */
  suppressionDepth?: number;
}

export class EchoCanceller {
  private enabled = true;
  private isFridaySpeaking = false;
  private playbackEnergyHistory: { timestamp: number; rms: number }[] = [];
  private readonly HISTORY_WINDOW_MS = 800;
  private readonly DEFAULT_DELAY_MS = 60; // Typical acoustic round-trip delay
  private suppressionDepth = 0.85;

  constructor(config: Partial<EchoCancellerConfig> = {}) {
    if (config.enabled !== undefined) this.enabled = config.enabled;
    if (config.suppressionDepth !== undefined) this.suppressionDepth = config.suppressionDepth;
  }

  public setEnabled(val: boolean): void {
    this.enabled = val;
  }

  public setSpeakingState(speaking: boolean): void {
    this.isFridaySpeaking = speaking;
    if (!speaking) {
      // Clear playback history shortly after speech ends
      setTimeout(() => {
        if (!this.isFridaySpeaking) {
          this.playbackEnergyHistory = [];
        }
      }, 300);
    }
  }

  /**
   * Registers a frame of TTS playback audio to act as the acoustic reference signal.
   */
  public registerPlaybackFrame(playbackSamples: Float32Array): void {
    if (!this.enabled || playbackSamples.length === 0) return;

    let sumSq = 0;
    for (let i = 0; i < playbackSamples.length; i++) {
      sumSq += playbackSamples[i] * playbackSamples[i];
    }
    const rms = Math.sqrt(sumSq / playbackSamples.length);

    const now = Date.now();
    this.playbackEnergyHistory.push({ timestamp: now, rms });

    // Prune history older than window
    const cutoff = now - this.HISTORY_WINDOW_MS;
    this.playbackEnergyHistory = this.playbackEnergyHistory.filter((item) => item.timestamp >= cutoff);
  }

  /**
   * Filters microphone capture audio using the registered playback reference.
   * Returns:
   * - processed: Float32Array of cleaned audio samples.
   * - isSelfEcho: boolean indicating if the mic frame was dominated by FRIDAY's speaker output.
   * - isUserBargeIn: boolean indicating genuine human speech overriding FRIDAY's voice.
   */
  public process(micSamples: Float32Array): {
    processed: Float32Array;
    isSelfEcho: boolean;
    isUserBargeIn: boolean;
  } {
    if (!this.enabled || !this.isFridaySpeaking || micSamples.length === 0) {
      return {
        processed: micSamples,
        isSelfEcho: false,
        isUserBargeIn: false,
      };
    }

    // Measure mic frame RMS
    let micSumSq = 0;
    for (let i = 0; i < micSamples.length; i++) {
      micSumSq += micSamples[i] * micSamples[i];
    }
    const micRms = Math.sqrt(micSumSq / micSamples.length);

    // Look for matching playback energy roughly 40-120ms in the past (acoustic travel time)
    const now = Date.now();
    const targetTime = now - this.DEFAULT_DELAY_MS;
    let closestPlaybackRms = 0;

    for (const item of this.playbackEnergyHistory) {
      if (Math.abs(item.timestamp - targetTime) <= 75) {
        if (item.rms > closestPlaybackRms) closestPlaybackRms = item.rms;
      }
    }

    // If playback energy is high and mic energy closely tracks it -> likely self-echo
    const isCorrelatedEcho = closestPlaybackRms > 0.05 && micRms < closestPlaybackRms * 1.4;
    
    // User barge-in condition: Mic energy significantly exceeds expected speaker bleed
    const isUserBargeIn = this.isFridaySpeaking && micRms > Math.max(0.22, closestPlaybackRms * 1.8);

    if (isUserBargeIn) {
      // True user barge-in! Allow speech through untouched
      return {
        processed: micSamples,
        isSelfEcho: false,
        isUserBargeIn: true,
      };
    }

    if (isCorrelatedEcho) {
      // Speaker bleed detected: suppress acoustic echo
      const attenuation = 1.0 - this.suppressionDepth;
      const output = new Float32Array(micSamples.length);
      for (let i = 0; i < micSamples.length; i++) {
        output[i] = micSamples[i] * attenuation;
      }
      return {
        processed: output,
        isSelfEcho: true,
        isUserBargeIn: false,
      };
    }

    return {
      processed: micSamples,
      isSelfEcho: false,
      isUserBargeIn: false,
    };
  }

  public reset(): void {
    this.isFridaySpeaking = false;
    this.playbackEnergyHistory = [];
  }
}

export const echoCanceller = new EchoCanceller();
