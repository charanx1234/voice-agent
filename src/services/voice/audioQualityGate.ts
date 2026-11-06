/**
 * Audio Quality Gate
 * Evaluates a captured audio blob or PCM samples before sending to STT.
 * Prevents FRIDAY from sending silent or extremely noisy recordings to Gemini,
 * which would cause hallucinated or nonsensical transcripts.
 *
 * Does NOT make biometric identity decisions.
 */

export interface AudioQualityReport {
  /** Whether the audio meets the minimum quality bar for STT submission. */
  acceptable: boolean;
  /** Dominant reason why the audio was rejected (if not acceptable). */
  reason: 'silent' | 'too_short' | 'clipped' | 'low_snr' | 'ok';
  /** Estimated peak amplitude (0–1). */
  peakLevel: number;
  /** RMS energy of the full recording (0–1). */
  rmsLevel: number;
  /** Estimated SNR in dB (positive = more signal than noise). */
  snrDb: number;
  /** Whether hard clipping was detected (sample near ±1.0). */
  clipping: boolean;
  /** Duration of the recording in milliseconds. */
  durationMs: number;
  /** Human-readable description for diagnostics display. */
  summary: string;
}

export interface AudioQualityOptions {
  /**
   * Minimum peak amplitude to be considered non-silent.
   * Default 0.04. Very quiet rooms may need 0.02; noisy rooms benefit from 0.07.
   */
  minPeakLevel?: number;
  /** Minimum recording duration in ms. Default 350. */
  minDurationMs?: number;
  /** Minimum acceptable SNR in dB. Default 4. */
  minSnrDb?: number;
}

const CLIP_THRESHOLD = 0.985;
const DEFAULT_OPTIONS: Required<AudioQualityOptions> = {
  minPeakLevel: 0.04,
  minDurationMs: 350,
  minSnrDb: 4,
};

/**
 * Evaluates audio quality from a Float32Array of PCM samples.
 * Called synchronously from the voice pipeline after a recording ends.
 */
export function evaluatePcmQuality(
  samples: Float32Array,
  sampleRate: number,
  options: AudioQualityOptions = {}
): AudioQualityReport {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const durationMs = (samples.length / sampleRate) * 1000;

  if (durationMs < opts.minDurationMs) {
    return {
      acceptable: false,
      reason: 'too_short',
      peakLevel: 0,
      rmsLevel: 0,
      snrDb: 0,
      clipping: false,
      durationMs,
      summary: `Recording too short (${Math.round(durationMs)}ms < ${opts.minDurationMs}ms minimum).`,
    };
  }

  let peak = 0;
  let sumSq = 0;
  let clippedSamples = 0;

  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
    sumSq += abs * abs;
    if (abs >= CLIP_THRESHOLD) clippedSamples++;
  }

  const rms = Math.sqrt(sumSq / samples.length);
  const clipping = clippedSamples / samples.length > 0.005; // >0.5% samples clipped

  // Noise floor estimation: use the quietest 20% of 50ms frames
  const frameSize = Math.floor(sampleRate * 0.05);
  const frameRms: number[] = [];

  for (let offset = 0; offset + frameSize < samples.length; offset += frameSize) {
    let frameSumSq = 0;
    for (let i = offset; i < offset + frameSize; i++) {
      frameSumSq += samples[i] * samples[i];
    }
    frameRms.push(Math.sqrt(frameSumSq / frameSize));
  }

  frameRms.sort((a, b) => a - b);
  const noiseFloor =
    frameRms.length > 0
      ? frameRms.slice(0, Math.max(1, Math.floor(frameRms.length * 0.2))).reduce((a, b) => a + b, 0) /
        Math.max(1, Math.floor(frameRms.length * 0.2))
      : 0.005;

  const snrDb =
    noiseFloor > 0 && peak > noiseFloor
      ? 20 * Math.log10(peak / Math.max(noiseFloor, 0.0001))
      : peak > 0.001
      ? 20
      : 0;

  if (peak < opts.minPeakLevel) {
    return {
      acceptable: false,
      reason: 'silent',
      peakLevel: peak,
      rmsLevel: rms,
      snrDb,
      clipping,
      durationMs,
      summary: `Audio appears silent (peak ${(peak * 100).toFixed(1)}%). Please speak closer to the microphone.`,
    };
  }

  if (snrDb < opts.minSnrDb) {
    return {
      acceptable: false,
      reason: 'low_snr',
      peakLevel: peak,
      rmsLevel: rms,
      snrDb,
      clipping,
      durationMs,
      summary: `Signal-to-noise ratio too low (${snrDb.toFixed(1)} dB). Try moving to a quieter spot or switching to Noisy environment mode.`,
    };
  }

  return {
    acceptable: true,
    reason: 'ok',
    peakLevel: peak,
    rmsLevel: rms,
    snrDb,
    clipping,
    durationMs,
    summary: clipping
      ? `Audio accepted (SNR ${snrDb.toFixed(1)} dB) but clipping detected — reduce microphone input gain.`
      : `Audio quality acceptable. SNR ${snrDb.toFixed(1)} dB, peak ${(peak * 100).toFixed(1)}%.`,
  };
}

/**
 * Lightweight peak-level check used before decoding a Blob.
 * Returns true if the blob appears silent (peak below threshold).
 */
export function isLikelySilentPeak(peakLevel: number, threshold = 0.025): boolean {
  return peakLevel < threshold;
}
