import { describe, it, expect } from 'vitest';
import { windowsBrightnessService } from '../src/services/system/windowsBrightnessService';

describe('Windows Brightness Control Service', () => {
  it('queries display brightness or reports graceful unsupported status', async () => {
    const res = await windowsBrightnessService.getBrightness();
    expect(res).toBeDefined();
    if (res.supported && res.success) {
      expect(typeof res.brightness).toBe('number');
      expect(res.brightness).toBeGreaterThanOrEqual(0);
      expect(res.brightness).toBeLessThanOrEqual(100);
    } else {
      expect(res.supported).toBe(false);
      expect(res.error).toBeDefined();
    }
  });

  it('adjusts and restores brightness when supported', async () => {
    const initial = await windowsBrightnessService.getBrightness();
    if (!initial.supported || !initial.success) return;

    // Set brightness
    const target = initial.brightness > 50 ? initial.brightness - 5 : initial.brightness + 5;
    const setRes = await windowsBrightnessService.setBrightness(target);
    expect(setRes.success).toBe(true);
    expect(typeof setRes.brightness).toBe('number');

    // Verify
    const verifyRes = await windowsBrightnessService.getBrightness();
    expect(typeof verifyRes.brightness).toBe('number');

    // Restore
    await windowsBrightnessService.setBrightness(initial.brightness);
  }, 15000);
});
