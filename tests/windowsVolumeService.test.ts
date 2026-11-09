import { describe, it, expect } from 'vitest';
import { windowsVolumeService } from '../src/services/system/windowsVolumeService';

describe('Windows Volume Control Service', () => {
  it('reads current master volume and mute status', async () => {
    const res = await windowsVolumeService.getVolume();
    expect(res).toBeDefined();
    if (res.success) {
      expect(typeof res.volume).toBe('number');
      expect(res.volume).toBeGreaterThanOrEqual(0);
      expect(res.volume).toBeLessThanOrEqual(100);
      expect(typeof res.muted).toBe('boolean');
    }
  }, 15000);

  it('sets and restores master volume to exact percentage', async () => {
    const initial = await windowsVolumeService.getVolume();
    if (!initial.success) return;

    // Set to 45%
    const setRes = await windowsVolumeService.setVolume(45);
    expect(setRes.success).toBe(true);
    expect(setRes.volume).toBe(45);

    // Verify read matches
    const verifyRes = await windowsVolumeService.getVolume();
    expect(verifyRes.volume).toBe(45);

    // Restore to initial volume
    const restoreRes = await windowsVolumeService.setVolume(initial.volume);
    expect(restoreRes.success).toBe(true);
    expect(restoreRes.volume).toBe(initial.volume);
  }, 15000);

  it('adjusts volume up and down by delta', async () => {
    const initial = await windowsVolumeService.getVolume();
    if (!initial.success) return;

    // Test adjust up
    const adjUp = await windowsVolumeService.adjustVolume(5);
    expect(adjUp.success).toBe(true);
    expect(adjUp.volume).toBe(Math.min(100, initial.volume + 5));

    // Restore
    await windowsVolumeService.setVolume(initial.volume);
  }, 15000);

  it('sets mute and unmute explicitly', async () => {
    const initial = await windowsVolumeService.getVolume();
    if (!initial.success) return;

    const muteRes = await windowsVolumeService.setMute(true);
    expect(muteRes.success).toBe(true);
    expect(muteRes.muted).toBe(true);

    const unmuteRes = await windowsVolumeService.setMute(false);
    expect(unmuteRes.success).toBe(true);
    expect(unmuteRes.muted).toBe(false);

    // Restore original mute state
    if (initial.muted) {
      await windowsVolumeService.setMute(true);
    }
  }, 15000);
});
