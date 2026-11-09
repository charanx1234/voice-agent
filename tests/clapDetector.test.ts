import { describe, expect, it, vi } from 'vitest';
import { DoubleClapDetector } from '../src/services/voice/clapDetector';

describe('DoubleClapDetector', () => {
  it('initializes and configures sensitivity', () => {
    const detector = new DoubleClapDetector({ sensitivity: 0.8 });
    detector.setSensitivity(0.6);
    detector.setSensitivity(0.01); // clamps to 0.2
    detector.setSensitivity(1.5);  // clamps to 1.0
  });

  it('does not trigger on silence', () => {
    const onWake = vi.fn();
    const detector = new DoubleClapDetector({ onDoubleClap: onWake });
    const silence = new Float32Array(512).fill(0);
    for (let i = 0; i < 20; i++) {
      expect(detector.process(silence, 0)).toBe(false);
    }
    expect(onWake).not.toHaveBeenCalled();
  });

  it('does not trigger on a single isolated clap', () => {
    const onWake = vi.fn();
    const detector = new DoubleClapDetector({ onDoubleClap: onWake });

    // Single clap: sharp impulse
    const clap = new Float32Array(512).fill(0);
    clap[10] = 0.8;
    clap[11] = -0.7;

    const triggered = detector.process(clap, 0.25, undefined, 1000);
    expect(triggered).toBe(false);
    expect(onWake).not.toHaveBeenCalled();

    // Silence follows
    const silence = new Float32Array(512).fill(0);
    for (let t = 1050; t <= 3000; t += 50) {
      detector.process(silence, 0, undefined, t);
    }
    expect(onWake).not.toHaveBeenCalled();
  });

  it('triggers when two claps occur within 140ms - 1200ms', () => {
    const onWake = vi.fn();
    const detector = new DoubleClapDetector({ onDoubleClap: onWake });

    const clap = new Float32Array(512).fill(0);
    clap[10] = 0.85;
    clap[11] = -0.75;
    const silence = new Float32Array(512).fill(0);

    // Initial silence
    detector.process(silence, 0.01, undefined, 1000);

    // Clap 1 at t=1100
    const trig1 = detector.process(clap, 0.28, undefined, 1100);
    expect(trig1).toBe(false);
    expect(onWake).not.toHaveBeenCalled();

    // Gap between claps (350ms of quiet)
    for (let t = 1150; t <= 1400; t += 50) {
      detector.process(silence, 0.01, undefined, t);
    }

    // Clap 2 at t=1450 (350ms after Clap 1)
    const trig2 = detector.process(clap, 0.30, undefined, 1450);
    expect(trig2).toBe(true);
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it('rejects claps that are too fast (< 140ms apart, reverberation)', () => {
    const onWake = vi.fn();
    const detector = new DoubleClapDetector({ onDoubleClap: onWake });

    const clap = new Float32Array(512).fill(0);
    clap[10] = 0.85;

    // Clap 1 at t=1000
    detector.process(clap, 0.28, undefined, 1000);

    // Too fast clap at t=1050 (50ms later)
    const trig = detector.process(clap, 0.25, undefined, 1050);
    expect(trig).toBe(false);
    expect(onWake).not.toHaveBeenCalled();
  });

  it('rejects second clap if it arrives after the 1200ms window has expired', () => {
    const onWake = vi.fn();
    const detector = new DoubleClapDetector({ onDoubleClap: onWake });

    const clap = new Float32Array(512).fill(0);
    clap[10] = 0.85;
    const silence = new Float32Array(512).fill(0);

    // Clap 1 at t=1000
    detector.process(clap, 0.28, undefined, 1000);

    // 1500ms of silence
    for (let t = 1050; t <= 2400; t += 50) {
      detector.process(silence, 0.01, undefined, t);
    }

    // Clap 2 arrives at t=2500 (1500ms later -> window expired, becomes new Clap 1)
    const trig = detector.process(clap, 0.28, undefined, 2500);
    expect(trig).toBe(false);
    expect(onWake).not.toHaveBeenCalled();
  });
});
