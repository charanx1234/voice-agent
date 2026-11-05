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
});
