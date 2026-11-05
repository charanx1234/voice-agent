import { describe, expect, it } from 'vitest';
import {
  SpeakerVerificationService,
  speakerVerificationService,
} from '../src/services/voice/speakerVerification';
import { EnrolledSpeakerProfile } from '../src/shared/types';

describe('SpeakerVerificationService', () => {
  const service = new SpeakerVerificationService();

  // Helper to generate a synthetic pure tone (sine wave)
  function generateTone(frequency: number, sampleRate: number, durationSeconds: number): Float32Array {
    const totalSamples = Math.floor(sampleRate * durationSeconds);
    const buffer = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      buffer[i] = 0.5 * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    }
    return buffer;
  }

  it('handles empty sample buffer gracefully', () => {
    const profile = service.extractAcousticProfile(new Float32Array(0), 44100);
    expect(profile.pitchMean).toBe(0);
    expect(profile.pitchStd).toBe(0);
    expect(profile.spectralVector).toHaveLength(16);
    expect(profile.spectralCentroid).toBe(0);
  });

  it('accurately estimates pitch and creates an enrolled profile', () => {
    // 150 Hz tone, 1 second at 44100Hz
    const samples = generateTone(150, 44100, 1.0);
    const profile = service.createProfile(samples, 44100);

    expect(profile.enrolledAt).toBeGreaterThan(0);
    expect(profile.sampleDurationMs).toBe(1000);
    // Estimated pitch should be close to 150 Hz (+/- 5 Hz)
    expect(Math.abs(profile.pitchMean - 150)).toBeLessThan(10);
    expect(profile.spectralVector).toHaveLength(16);
  });

  it('allows access when no profile is enrolled', () => {
    const samples = generateTone(140, 44100, 0.5);
    const result = service.verifySpeaker(samples, 44100, null as any);
    expect(result.verified).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.reason).toContain('No speaker profile enrolled');
  });

  it('verifies a matching speaker voice with high similarity', () => {
    const sampleRate = 44100;
    const enrolledAudio = generateTone(160, sampleRate, 1.0);
    const profile: EnrolledSpeakerProfile = service.createProfile(enrolledAudio, sampleRate);

    // Utterance with same fundamental frequency
    const matchingAudio = generateTone(160, sampleRate, 0.8);
    const result = service.verifySpeaker(matchingAudio, sampleRate, profile, 0.60);

    expect(result.verified).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.60);
    expect(result.spectralSimilarity).toBeGreaterThan(0.70);
  });

  it('rejects a substantially different speaker voice (e.g. 100Hz vs 300Hz)', () => {
    const sampleRate = 44100;
    // Enrolled at low pitch (100Hz)
    const enrolledAudio = generateTone(100, sampleRate, 1.0);
    const profile = service.createProfile(enrolledAudio, sampleRate);

    // Intruder speaking at high pitch (300Hz)
    const intruderAudio = generateTone(300, sampleRate, 1.0);
    const result = service.verifySpeaker(intruderAudio, sampleRate, profile, 0.65);

    expect(result.verified).toBe(false);
    expect(result.pitchDistance).toBeGreaterThan(50);
  });
});
