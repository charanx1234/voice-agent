import { EnrolledSpeakerProfile, SpeakerVerificationResult } from '../../shared/types';

/**
 * Local Biometric Speaker Verification Layer
 * Extracts pitch (F0) and 16-band vocal spectral signatures to distinguish
 * the enrolled user's voice from background speech, television, or secondary speakers.
 */
export class SpeakerVerificationService {
  /**
   * Computes acoustic biometric features from an audio buffer or Float32Array time-domain samples.
   */
  public extractAcousticProfile(samples: Float32Array, sampleRate: number): {
    pitchMean: number;
    pitchStd: number;
    spectralVector: number[];
    spectralCentroid: number;
  } {
    if (samples.length === 0) {
      return {
        pitchMean: 0,
        pitchStd: 0,
        spectralVector: new Array(16).fill(0),
        spectralCentroid: 0,
      };
    }

    // 1. Pitch Estimation using Time-Domain Autocorrelation with Center Clipping
    const frameSize = Math.floor(sampleRate * 0.03); // 30ms frames
    const hopSize = Math.floor(sampleRate * 0.015);  // 15ms hop
    const pitches: number[] = [];

    // Min and Max human voice frequencies (70Hz to 380Hz)
    const minPeriod = Math.floor(sampleRate / 380);
    const maxPeriod = Math.floor(sampleRate / 70);

    for (let offset = 0; offset + frameSize < samples.length; offset += hopSize) {
      const frame = samples.subarray(offset, offset + frameSize);

      // Energy check - only analyze voiced frames
      let frameEnergy = 0;
      for (let i = 0; i < frame.length; i++) frameEnergy += frame[i] * frame[i];
      const rms = Math.sqrt(frameEnergy / frame.length);
      if (rms < 0.02) continue;

      // Autocorrelation
      let bestCorrelation = -1;
      let bestLag = -1;

      for (let lag = minPeriod; lag <= maxPeriod && lag < frame.length; lag++) {
        let sum = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < frame.length - lag; i++) {
          sum += frame[i] * frame[i + lag];
          normA += frame[i] * frame[i];
          normB += frame[i + lag] * frame[i + lag];
        }
        const denom = Math.sqrt(normA * normB);
        const corr = denom > 0.0001 ? sum / denom : 0;
        if (corr > bestCorrelation) {
          bestCorrelation = corr;
          bestLag = lag;
        }
      }

      if (bestCorrelation > 0.45 && bestLag > 0) {
        const pitch = sampleRate / bestLag;
        if (pitch >= 75 && pitch <= 360) {
          pitches.push(pitch);
        }
      }
    }

    const pitchMean =
      pitches.length > 0
        ? pitches.reduce((acc, p) => acc + p, 0) / pitches.length
        : 140; // Neutral fallback

    const pitchVariance =
      pitches.length > 1
        ? pitches.reduce((acc, p) => acc + Math.pow(p - pitchMean, 2), 0) / (pitches.length - 1)
        : 100;
    const pitchStd = Math.sqrt(pitchVariance);

    // 2. 16-Band Log-Filterbank Spectral Timbre Vector using Goertzel Analysis
    // Bands from 100Hz to 7000Hz (human vocal timbre range)
    const numBands = 16;
    const bandEnergies = new Float32Array(numBands);
    const bandEdges = [
      100, 160, 240, 340, 460, 600, 780, 1000, 1280, 1620, 2040, 2540, 3120, 3800, 4600, 5600, 7000
    ];

    const frameLen = Math.min(samples.length, 1024);
    const subFrames = Math.min(8, Math.max(1, Math.floor(samples.length / frameLen)));

    let totalSpectralEnergy = 0;
    let weightedFrequencySum = 0;

    for (let b = 0; b < numBands; b++) {
      const centerFreq = (bandEdges[b] + bandEdges[b + 1]) / 2;
      let bandSum = 0;

      for (let f = 0; f < subFrames; f++) {
        const start = f * frameLen;
        const sub = samples.subarray(start, start + frameLen);
        if (sub.length === 0) continue;

        // Goertzel algorithm for single-frequency energy extraction
        const k = Math.round((sub.length * centerFreq) / sampleRate);
        const omega = (2 * Math.PI * k) / sub.length;
        const coeff = 2 * Math.cos(omega);
        let s_prev = 0;
        let s_prev2 = 0;

        for (let i = 0; i < sub.length; i++) {
          const s = sub[i] + coeff * s_prev - s_prev2;
          s_prev2 = s_prev;
          s_prev = s;
        }

        const energy = Math.max(0, s_prev * s_prev + s_prev2 * s_prev2 - coeff * s_prev * s_prev2);
        bandSum += energy;
      }

      bandEnergies[b] = bandSum / subFrames;
      totalSpectralEnergy += bandEnergies[b];
      weightedFrequencySum += bandEnergies[b] * centerFreq;
    }

    // Normalize spectral vector
    const spectralVector: number[] = [];
    let norm = 0;
    for (let b = 0; b < numBands; b++) {
      const logE = Math.log1p(bandEnergies[b]);
      spectralVector.push(logE);
      norm += logE * logE;
    }
    const magnitude = Math.sqrt(norm) || 1;
    for (let b = 0; b < numBands; b++) {
      spectralVector[b] = spectralVector[b] / magnitude;
    }

    const spectralCentroid =
      totalSpectralEnergy > 0 ? weightedFrequencySum / totalSpectralEnergy : 1500;

    return {
      pitchMean: Math.round(pitchMean * 10) / 10,
      pitchStd: Math.round(pitchStd * 10) / 10,
      spectralVector,
      spectralCentroid: Math.round(spectralCentroid),
    };
  }

  /**
   * Creates an enrolled profile from audio samples.
   */
  public createProfile(samples: Float32Array, sampleRate: number): EnrolledSpeakerProfile {
    const profile = this.extractAcousticProfile(samples, sampleRate);
    return {
      enrolledAt: Date.now(),
      pitchMean: profile.pitchMean,
      pitchStd: profile.pitchStd,
      spectralVector: profile.spectralVector,
      spectralCentroid: profile.spectralCentroid,
      sampleDurationMs: Math.round((samples.length / sampleRate) * 1000),
    };
  }

  /**
   * Verifies an utterance against an enrolled voice profile.
   * Returns a match score from 0.0 to 1.0 and verification decision.
   */
  public verifySpeaker(
    samples: Float32Array,
    sampleRate: number,
    enrolled: EnrolledSpeakerProfile,
    threshold = 0.65
  ): SpeakerVerificationResult {
    if (!enrolled || !enrolled.spectralVector || enrolled.spectralVector.length === 0) {
      return {
        verified: true, // If no profile is enrolled, verification defaults open
        score: 1.0,
        pitchDistance: 0,
        spectralSimilarity: 1.0,
        reason: 'No speaker profile enrolled.',
      };
    }

    const candidate = this.extractAcousticProfile(samples, sampleRate);

    // 1. Spectral Cosine Similarity (timbre footprint match)
    let dot = 0;
    let normCandidate = 0;
    let normEnrolled = 0;

    const len = Math.min(candidate.spectralVector.length, enrolled.spectralVector.length);
    for (let i = 0; i < len; i++) {
      dot += candidate.spectralVector[i] * enrolled.spectralVector[i];
      normCandidate += candidate.spectralVector[i] * candidate.spectralVector[i];
      normEnrolled += enrolled.spectralVector[i] * enrolled.spectralVector[i];
    }

    const denom = Math.sqrt(normCandidate * normEnrolled);
    const spectralSimilarity = denom > 0.0001 ? Math.max(0, Math.min(1, dot / denom)) : 0;

    // 2. Pitch Distance (normalized by expected pitch deviation)
    const pitchDiff = Math.abs(candidate.pitchMean - enrolled.pitchMean);
    const tolerance = Math.max(35, enrolled.pitchStd * 2.2);
    const pitchMatchScore = Math.max(0, 1 - pitchDiff / (tolerance * 2.5));

    // 3. Centroid Compatibility
    const centroidDiff = Math.abs(candidate.spectralCentroid - enrolled.spectralCentroid);
    const centroidScore = Math.max(0, 1 - centroidDiff / 2000);

    // Weighted composite score (timbre 60%, pitch 30%, centroid 10%)
    const compositeScore =
      spectralSimilarity * 0.6 + pitchMatchScore * 0.3 + centroidScore * 0.1;

    const verified = compositeScore >= threshold;
    const reason = verified
      ? `Speaker verified (confidence: ${Math.round(compositeScore * 100)}%).`
      : `Speaker verification failed (confidence: ${Math.round(compositeScore * 100)}% < threshold ${Math.round(threshold * 100)}%).`;

    return {
      verified,
      score: Math.round(compositeScore * 100) / 100,
      pitchDistance: Math.round(pitchDiff),
      spectralSimilarity: Math.round(spectralSimilarity * 100) / 100,
      reason,
    };
  }
}

export const speakerVerificationService = new SpeakerVerificationService();
