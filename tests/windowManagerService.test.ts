import { describe, it, expect, vi } from 'vitest';
import { WindowManagerService } from '../src/services/quicktools/windowManagerService';

describe('WindowManagerService', () => {
  const service = new WindowManagerService();

  it('runs getOpenWindows without crashing and returns an array of WindowInfo', async () => {
    const windows = await service.getOpenWindows();
    expect(Array.isArray(windows)).toBe(true);
    for (const w of windows) {
      expect(typeof w.handle).toBe('number');
      expect(typeof w.title).toBe('string');
      expect(typeof w.processName).toBe('string');
    }
  });

  it('handles arrangeWindow with valid parameters gracefully', async () => {
    // Center action on current foreground
    const res = await service.arrangeWindow({ action: 'center' });
    expect(res).toBeDefined();
    expect(typeof res.success).toBe('boolean');
    expect(typeof res.message).toBe('string');
  });

  it('handles side-by-side action gracefully', async () => {
    const res = await service.arrangeWindow({
      action: 'split_left',
      windowTarget: 'NonExistentApplicationTitle12345',
      secondTarget: 'AnotherFakeApp67890',
    });
    expect(res).toBeDefined();
    expect(typeof res.success).toBe('boolean');
  });
});
