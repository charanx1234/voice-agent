import { describe, expect, it, vi } from 'vitest';
import { LocalWakeWordDetector } from '../src/services/voice/localWakeWord';

describe('LocalWakeWordDetector', () => {
  it('initializes with default sensitivity and allows configuration', () => {
    const detector = new LocalWakeWordDetector({ sensitivity: 0.8 });
    detector.setSensitivity(0.65);
    // Bounds clamping
    detector.setSensitivity(0.05); // clamped to 0.2
    detector.setSensitivity(1.5);  // clamped to 1.0
  });

  it('resets internal frame history on command', () => {
    const detector = new LocalWakeWordDetector();
    detector.reset();
  });

  it('does not trigger on pure silence', () => {
    const onWake = vi.fn();
    const detector = new LocalWakeWordDetector({ onWake });

    const silentBins = new Uint8Array(128).fill(0);
    for (let i = 0; i < 20; i++) {
      const triggered = detector.processFrequencyData(silentBins);
      expect(triggered).toBe(false);
    }
    expect(onWake).not.toHaveBeenCalled();
  });

  it('rejects stationary broadband noise (e.g., continuous fan humming)', () => {
    const onWake = vi.fn();
    const detector = new LocalWakeWordDetector({ onWake });

    // Fan noise: steady, flat energy without syllable cadence or fricative transitions
    const fanBins = new Uint8Array(128).fill(40);
    for (let i = 0; i < 30; i++) {
      const triggered = detector.processFrequencyData(fanBins);
      expect(triggered).toBe(false);
    }
    expect(onWake).not.toHaveBeenCalled();
  });

  it('rejects sudden isolated impulsive transients (e.g., single keyboard click)', () => {
    const onWake = vi.fn();
    const detector = new LocalWakeWordDetector({ onWake });

    // Baseline background
    const quietBins = new Uint8Array(128).fill(5);
    for (let i = 0; i < 10; i++) {
      detector.processFrequencyData(quietBins);
    }

    // 1 frame sharp click
    const clickBins = new Uint8Array(128).fill(180);
    const triggered = detector.processFrequencyData(clickBins);
    expect(triggered).toBe(false);

    // Immediate return to quiet
    for (let i = 0; i < 5; i++) {
      detector.processFrequencyData(quietBins);
    }
    expect(onWake).not.toHaveBeenCalled();
  });

  it('suppresses wake-word detection during echo / TTS cooldown period', () => {
    const onWake = vi.fn();
    const detector = new LocalWakeWordDetector({ onWake });

    expect(detector.isSuppressed()).toBe(false);
    detector.suppress(1500);
    expect(detector.isSuppressed()).toBe(true);

    const activeBins = new Uint8Array(128).fill(80);
    const triggered = detector.processFrequencyData(activeBins);
    expect(triggered).toBe(false);
    expect(onWake).not.toHaveBeenCalled();
  });

  it('rejects 3-syllable ambient sounds that lack the unvoiced fricative onset of "Fri-"', () => {
    const onWake = vi.fn();
    const detector = new LocalWakeWordDetector({ onWake });

    // Pure low-frequency vocal humming (3 bursts) with zero energy in high-frequency fricative bins (>3200Hz)
    const lowFreqBins = new Uint8Array(128).fill(0);
    for (let bin = 2; bin <= 10; bin++) lowFreqBins[bin] = 120; // 300Hz-1500Hz only
    const silenceBins = new Uint8Array(128).fill(0);

    // Peak 1 (Hey)
    for (let i = 0; i < 3; i++) detector.processFrequencyData(lowFreqBins);
    // Valley
    for (let i = 0; i < 2; i++) detector.processFrequencyData(silenceBins);
    // Peak 2 (non-fricative)
    for (let i = 0; i < 3; i++) detector.processFrequencyData(lowFreqBins);
    // Valley
    for (let i = 0; i < 2; i++) detector.processFrequencyData(silenceBins);
    // Peak 3 (non-fricative)
    for (let i = 0; i < 3; i++) detector.processFrequencyData(lowFreqBins);

    expect(onWake).not.toHaveBeenCalled();
  });
});
