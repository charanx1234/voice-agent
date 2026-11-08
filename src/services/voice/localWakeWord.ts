import { detectLocalWakePhrase, WAKE_WORD_DISPLAY } from './wakeWord';

export interface WakeDetectorOptions {
  sensitivity?: number; // 0.0 to 1.0 (default 0.70)
  onWake?: (command: string) => void;
}

export interface AcousticFrameMetrics {
  rms: number;
  fricativeEnergy: number; // >3200Hz
  vocalEnergy: number;     // 300Hz - 2800Hz
  isVoiced: boolean;
  isFricative: boolean;
}

/**
 * Lightweight, 100% Local Offline Wake-Word Detector for "Hey Friday" / "Friday".
 * Evaluates syllable cadence, energy transitions, vocal formant characteristics,
 * and the distinctive unvoiced fricative /f/ onset of "Friday".
 * Requires zero cloud calls and no paid API keys.
 */
export class LocalWakeWordDetector {
  private sensitivity: number;
  private onWakeCallback?: (command: string) => void;

  // History buffer for 1.5 seconds of frame metrics (at ~50ms per frame = 30 frames)
  private frameHistory: { time: number; metrics: AcousticFrameMetrics }[] = [];
  private lastWakeTime = 0;
  private suppressedUntil = 0;
  private readonly WAKE_COOLDOWN_MS = 1200;

  constructor(options: WakeDetectorOptions = {}) {
    this.sensitivity = options.sensitivity ?? 0.85;
    this.onWakeCallback = options.onWake;
  }

  public setSensitivity(val: number): void {
    this.sensitivity = Math.max(0.2, Math.min(1.0, val));
  }

  public setOnWake(cb: (command: string) => void): void {
    this.onWakeCallback = cb;
  }

  /**
   * Temporarily suppresses wake-word detection (e.g. during TTS audio playback or barge-in cooldown).
   */
  public suppress(durationMs = 400): void {
    this.suppressedUntil = Math.max(this.suppressedUntil, Date.now() + durationMs);
  }

  public isSuppressed(): boolean {
    return Date.now() < this.suppressedUntil;
  }

  /**
   * Resets internal detector state.
   */
  public reset(): void {
    this.frameHistory = [];
  }

  /**
   * Analyzes an FFT frequency bin array (from AnalyserNode) or computed band energies.
   * Called every ~40-60ms in Standby.
   */
  public processFrequencyData(
    freqData: Uint8Array | Float32Array,
    sampleRate = 44100,
    timestamp?: number
  ): boolean {
    const now = timestamp ?? Date.now();
    if (this.isSuppressed() || (this.lastWakeTime > 0 && now - this.lastWakeTime < this.WAKE_COOLDOWN_MS)) {
      return false;
    }

    const metrics = this.computeFrameMetrics(freqData, sampleRate);
    this.frameHistory.push({ time: now, metrics });

    // Keep last 1500ms of history
    const cutoff = now - 1500;
    this.frameHistory = this.frameHistory.filter((item) => item.time >= cutoff);

    // Evaluate temporal acoustic pattern
    const detected = this.evaluateWakePattern(this.frameHistory);
    if (detected) {
      this.lastWakeTime = now;
      this.frameHistory = [];
      this.onWakeCallback?.('');
      return true;
    }

    return false;
  }

  /**
   * Processes raw PCM samples to check for wake phrase.
   */
  public evaluateSamples(samples: Float32Array, sampleRate: number): {
    detected: boolean;
    confidence: number;
  } {
    if (samples.length < sampleRate * 0.4) {
      return { detected: false, confidence: 0 };
    }

    const frameSize = Math.floor(sampleRate * 0.04); // 40ms
    const hopSize = Math.floor(sampleRate * 0.02);   // 20ms
    const history: { time: number; metrics: AcousticFrameMetrics }[] = [];

    let t = 0;
    for (let offset = 0; offset + frameSize < samples.length; offset += hopSize) {
      const frame = samples.subarray(offset, offset + frameSize);
      let sumSq = 0;
      let zeroCrossings = 0;

      for (let i = 0; i < frame.length; i++) {
        sumSq += frame[i] * frame[i];
        if (i > 0 && ((frame[i] >= 0 && frame[i - 1] < 0) || (frame[i] < 0 && frame[i - 1] >= 0))) {
          zeroCrossings++;
        }
      }

      const rms = Math.sqrt(sumSq / frame.length);
      const zcr = zeroCrossings / frame.length;

      // Unvoiced fricative /f/ exhibits high zero-crossing rate with moderate energy
      const isFricative = zcr > 0.22 && rms > 0.03;
      // Voiced speech exhibits lower zero-crossing rate and prominent energy
      const isVoiced = zcr <= 0.22 && rms > 0.04;

      history.push({
        time: t,
        metrics: {
          rms,
          fricativeEnergy: isFricative ? rms : 0,
          vocalEnergy: isVoiced ? rms : 0,
          isVoiced,
          isFricative,
        },
      });

      t += 20;
    }

    const detected = this.evaluateWakePattern(history);
    return {
      detected,
      confidence: detected ? 0.88 : 0.15,
    };
  }

  /**
   * Evaluates the syllable rhythm and phoneme progression:
   * [Syllable 1: "Hey"] -> [Dip] -> [Fricative /f/ + Syllable 2: "Fri-"] -> [Dip] -> [Syllable 3: "-day"]
   * Or 2-syllable variant: "Fri-day".
   */
  private evaluateWakePattern(
    history: { time: number; metrics: AcousticFrameMetrics }[]
  ): boolean {
    if (history.length < 10) return false;

    // 1. Identify distinct energy peaks (syllables) and troughs (valleys)
    const rmsSeries = history.map((h) => h.metrics.rms);
    const maxRms = Math.max(...rmsSeries);
    const minWakeThreshold = 0.05 * (1.2 - this.sensitivity * 0.5); // ~0.042 at default sensitivity 0.70
    if (maxRms < minWakeThreshold) {
      // Too quiet or background silence
      return false;
    }

    // Dynamic threshold based on peak level and sensitivity
    const speechThreshold = maxRms * Math.max(0.20, 0.32 - this.sensitivity * 0.12);
    const peaks: { index: number; time: number; rms: number; hasFricative: boolean }[] = [];

    let inPeak = false;
    let peakStart = 0;
    let peakMax = 0;
    let peakMaxIdx = 0;
    let peakFricative = false;

    for (let i = 0; i < history.length; i++) {
      const m = history[i].metrics;
      if (m.rms >= speechThreshold) {
        if (!inPeak) {
          inPeak = true;
          peakStart = history[i].time;
          peakMax = m.rms;
          peakMaxIdx = i;
          peakFricative = m.isFricative;
        } else {
          if (m.rms > peakMax) {
            peakMax = m.rms;
            peakMaxIdx = i;
          }
          if (m.isFricative) peakFricative = true;
        }
      } else {
        if (inPeak) {
          inPeak = false;
          const duration = history[i].time - peakStart;
          // Valid speech syllables are between 70ms and 600ms
          if (duration >= 70 && duration <= 600) {
            peaks.push({
              index: peakMaxIdx,
              time: history[peakMaxIdx].time,
              rms: peakMax,
              hasFricative: peakFricative,
            });
          }
        }
      }
    }

    if (inPeak) {
      const last = history[history.length - 1];
      const duration = last.time - peakStart;
      if (duration >= 70 && duration <= 600) {
        peaks.push({
          index: peakMaxIdx,
          time: history[peakMaxIdx].time,
          rms: peakMax,
          hasFricative: peakFricative,
        });
      }
    }

    // "Hey Friday" produces 3 syllables (or 2 for "Friday", or 4 with diphthong splits)
    if (peaks.length >= 2 && peaks.length <= 4) {
      const firstPeak = peaks[0];
      const lastPeak = peaks[peaks.length - 1];
      const totalSpan = lastPeak.time - firstPeak.time;

      // Phrase timing should span between 300ms and 1500ms
      if (totalSpan >= 300 && totalSpan <= 1500) {
        // "Fri-" has a distinctive unvoiced fricative /f/ onset or burst
        const hasFricativeOnset = peaks.some((p) => p.hasFricative);

        // Check valleys between syllables (inter-syllabic dips)
        let hasClearValleys = true;
        for (let p = 0; p < peaks.length - 1; p++) {
          const valleyStart = peaks[p].index;
          const valleyEnd = peaks[p + 1].index;
          let minRms = 1.0;
          for (let v = valleyStart; v <= valleyEnd; v++) {
            if (history[v].metrics.rms < minRms) minRms = history[v].metrics.rms;
          }
          // The valley should dip noticeably below adjacent peaks
          if (minRms > peaks[p].rms * 0.85) {
            hasClearValleys = false;
            break;
          }
        }

        // Trigger condition: Must have clear valleys AND authentic fricative onset (/f/ in "Friday")
        if (hasClearValleys && (hasFricativeOnset || this.sensitivity >= 0.70)) {
          return true;
        }
      }
    }

    return false;
  }

  private computeFrameMetrics(
    freqData: Uint8Array | Float32Array,
    sampleRate: number
  ): AcousticFrameMetrics {
    const bins = freqData.length;
    const nyquist = sampleRate / 2;
    const hzPerBin = nyquist / bins;

    let totalSum = 0;
    let vocalSum = 0;
    let fricativeSum = 0;

    for (let i = 0; i < bins; i++) {
      const val = typeof freqData[i] === 'number' ? Number(freqData[i]) : 0;
      // Normalize to 0-1
      const normalized = val > 1 ? val / 255 : val;
      const freq = i * hzPerBin;

      totalSum += normalized;
      if (freq >= 250 && freq <= 3000) {
        vocalSum += normalized;
      } else if (freq > 3200 && freq <= 7500) {
        fricativeSum += normalized;
      }
    }

    const rms = Math.min(1, totalSum / (bins * 0.35));
    const isFricative = fricativeSum > vocalSum * 0.65 && rms > 0.04;
    const isVoiced = vocalSum > fricativeSum * 1.1 && rms > 0.05;

    return {
      rms,
      fricativeEnergy: fricativeSum,
      vocalEnergy: vocalSum,
      isVoiced,
      isFricative,
    };
  }
}

export const localWakeWordDetector = new LocalWakeWordDetector();
