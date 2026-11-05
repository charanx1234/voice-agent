import { describe, expect, it, vi } from 'vitest';
import {
  FastLocalIntentRouter,
  extractMultilingualLaunchApp,
  extractMultilingualCloseApp,
} from '../src/services/agent/fastLocalIntent';

describe('FastLocalIntentRouter', () => {
  describe('Multilingual App Launch Parsing', () => {
    it('extracts English app launch commands', () => {
      expect(extractMultilingualLaunchApp('open Chrome')).toBe('Chrome');
      expect(extractMultilingualLaunchApp('Friday, launch Spotify app')).toBe('Spotify');
      expect(extractMultilingualLaunchApp('please run Notepad')).toBe('Notepad');
      expect(extractMultilingualLaunchApp('start Terminal')).toBe('Terminal');
    });

    it('extracts Telugu mixed app launch commands (Tenglish)', () => {
      expect(extractMultilingualLaunchApp('Chrome open chey')).toBe('Chrome');
      expect(extractMultilingualLaunchApp('Spotify open cheyi')).toBe('Spotify');
      expect(extractMultilingualLaunchApp('Notepad teeyi')).toBe('Notepad');
      expect(extractMultilingualLaunchApp('Calculator chalu chey')).toBe('Calculator');
    });

    it('extracts Hinglish app launch commands', () => {
      expect(extractMultilingualLaunchApp('Chrome kholo')).toBe('Chrome');
      expect(extractMultilingualLaunchApp('Spotify open karo')).toBe('Spotify');
      expect(extractMultilingualLaunchApp('Notepad chalao')).toBe('Notepad');
    });

    it('rejects multi-action compound sentences with conjunctions', () => {
      expect(extractMultilingualLaunchApp('Chrome open chey and Java tutorials search chey')).toBeNull();
      expect(extractMultilingualLaunchApp('open notepad then write letter')).toBeNull();
      expect(extractMultilingualLaunchApp('Notepad open chey kani calculator vaddu')).toBeNull();
    });
  });

  describe('Multilingual App Close Parsing', () => {
    it('extracts English app close commands', () => {
      expect(extractMultilingualCloseApp('close Chrome')).toBe('Chrome');
      expect(extractMultilingualCloseApp('Friday, quit Spotify')).toBe('Spotify');
      expect(extractMultilingualCloseApp('exit Notepad')).toBe('Notepad');
    });

    it('extracts Telugu mixed app close commands', () => {
      expect(extractMultilingualCloseApp('Chrome close chey')).toBe('Chrome');
      expect(extractMultilingualCloseApp('Spotify aapu')).toBe('Spotify');
      expect(extractMultilingualCloseApp('Notepad bandh chey')).toBe('Notepad');
      expect(extractMultilingualCloseApp('Chrome moosi veyyi')).toBe('Chrome');
    });

    it('extracts Hinglish app close commands', () => {
      expect(extractMultilingualCloseApp('Chrome band karo')).toBe('Chrome');
      expect(extractMultilingualCloseApp('Spotify close karo')).toBe('Spotify');
    });
  });

  describe('Fast Local Intent Routing (<100ms)', () => {
    const router = new FastLocalIntentRouter();

    it('routes Time queries instantly in English, Telugu and Hindi', async () => {
      // Warm up JIT
      await router.tryRoute('what time is it', 'en-IN');

      const en = await router.tryRoute('what time is it', 'en-IN');
      expect(en?.matched).toBe(true);
      expect(en?.intent).toBe('time');
      expect(en?.response).toMatch(/The time is \d+:\d+/);
      expect(en?.executionMs).toBeLessThan(150);

      const te = await router.tryRoute('time entha', 'te-IN');
      expect(te?.matched).toBe(true);
      expect(te?.response).toMatch(/Ippudu time \d+:\d+/);

      const hi = await router.tryRoute('kya time hua hai', 'hi-IN');
      expect(hi?.matched).toBe(true);
      expect(hi?.response).toMatch(/Abhi samay \d+:\d+/);
    });

    it('routes Date queries instantly in English, Telugu and Hindi', async () => {
      const en = await router.tryRoute("what is today's date", 'en-IN');
      expect(en?.matched).toBe(true);
      expect(en?.intent).toBe('date');
      expect(en?.response).toContain('Today is');
      expect(en?.executionMs).toBeLessThan(100);

      const te = await router.tryRoute('eroju theedi', 'te-IN');
      expect(te?.matched).toBe(true);
      expect(te?.response).toContain('Eroju theedi');
    });

    it('returns null for conversational or complex multi-turn prompts', async () => {
      const result = await router.tryRoute('Tell me a story about artificial intelligence and space travel');
      expect(result).toBeNull();
    });
  });
});
