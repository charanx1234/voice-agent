import { describe, it, expect } from 'vitest';
import { fastLocalIntentRouter } from '../src/services/agent/fastLocalIntent';

describe('Fast Local Intent Router Expansion — Volume, Brightness, Time, Weather & Mouse', () => {
  // --- VOLUME TESTS ---
  describe('Volume Commands', () => {
    it('handles "Set volume to 50 percent"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Set volume to 50 percent.');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('volume');
      expect(res?.response).toMatch(/volume.*50%/i);
    });

    it('handles "Reduce volume to 20 percent"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Friday, reduce volume to 20 percent.');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('volume');
      expect(res?.response).toMatch(/volume.*20%/i);
    });

    it('handles "Set volume to maximum"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Set volume to maximum');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('volume');
      expect(res?.response).toMatch(/volume.*100%/i);
    });

    it('handles "Decrease volume by 10"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Friday, decrease volume by 10');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('volume');
      expect(res?.response).toMatch(/volume/i);
    });

    it('handles "Friday, increase the volume"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Friday, increase the volume.');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('volume');
      expect(res?.response).toMatch(/Volume increased/i);
    });

    it('handles "Mute my laptop" and "Unmute"', async () => {
      const muteRes = await fastLocalIntentRouter.tryRoute('Mute my laptop');
      expect(muteRes?.matched).toBe(true);
      expect(muteRes?.intent).toBe('volume');
      expect(muteRes?.response).toContain('Audio muted');

      const unmuteRes = await fastLocalIntentRouter.tryRoute('Unmute');
      expect(unmuteRes?.matched).toBe(true);
      expect(unmuteRes?.intent).toBe('volume');
      expect(unmuteRes?.response).toMatch(/Audio unmuted/i);
    });
  });

  // --- BRIGHTNESS TESTS ---
  describe('Brightness Commands', () => {
    it('handles "Set brightness to 70 percent"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Set brightness to 70 percent.');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('brightness');
      expect(res?.response).toBeDefined();
    });

    it('handles "Reduce brightness to 30 percent"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Reduce brightness to 30 percent');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('brightness');
      expect(res?.response).toBeDefined();
    });

    it('handles "Friday, increase brightness"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Friday, increase brightness.');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('brightness');
      expect(res?.response).toBeDefined();
    });

    it('handles "Make my screen dimmer"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Make my screen dimmer');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('brightness');
      expect(res?.response).toBeDefined();
    });

    it('handles "Set brightness to maximum"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Set brightness to maximum');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('brightness');
      expect(res?.response).toBeDefined();
    });
  });

  // --- TIME AND DATE TESTS ---
  describe('Time & Date Commands', () => {
    it('handles "Friday, what time is it?"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Friday, what time is it?');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('time');
      expect(res?.response).toMatch(/The time is \d{1,2}:\d{2}\s+(?:AM|PM)/i);
    });

    it('handles "What\'s today\'s date?"', async () => {
      const res = await fastLocalIntentRouter.tryRoute("What's today's date?");
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('date');
      expect(res?.response).toMatch(/Today is/i);
    });

    it('handles "What day is today?"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('What day is today?');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('date');
      expect(res?.response).toMatch(/Today is (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
    });

    it('handles "What time will it be in two hours?"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('What time will it be in two hours?');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('time');
      expect(res?.response).toMatch(/In 2 hours, it will be \d{1,2}:\d{2}\s+(?:AM|PM)/i);
    });

    it('handles "How much time until 6 PM?"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('How much time until 6 PM?');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('time');
      expect(res?.response).toMatch(/There is .* until 6:00 PM/i);
    });
  });

  // --- WEATHER TESTS ---
  describe('Live Weather Commands', () => {
    it('handles "Friday, what\'s the weather?"', async () => {
      const res = await fastLocalIntentRouter.tryRoute("Friday, what's the weather?");
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('weather');
      expect(res?.response).toBeDefined();
    });

    it('handles "What\'s the weather in Hyderabad?"', async () => {
      const res = await fastLocalIntentRouter.tryRoute("What's the weather in Hyderabad?");
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('weather');
      expect(res?.response).toContain('Hyderabad');
    });

    it('handles "Will it rain today?"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Will it rain today?');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('weather');
      expect(res?.response).toMatch(/forecast|rain|high of/i);
    });

    it('handles "Tell me tomorrow\'s weather"', async () => {
      const res = await fastLocalIntentRouter.tryRoute("Tell me tomorrow's weather");
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('weather');
      expect(res?.response).toMatch(/Tomorrow in/i);
    });

    it('handles "What\'s the temperature outside?"', async () => {
      const res = await fastLocalIntentRouter.tryRoute("What's the temperature outside?");
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('weather');
      expect(res?.response).toContain('°C');
    });
  });

  // --- MOUSE AUTOMATION TESTS ---
  describe('Mouse Automation Commands', () => {
    it('handles "Friday, move the mouse to the top-right corner"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Friday, move the mouse to the top-right corner');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('mouse');
      expect(res?.response).toMatch(/top-right/i);
    });

    it('handles "Double-click this icon"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Double-click this icon');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('mouse');
      expect(res?.response).toMatch(/Double-clicked/i);
    });

    it('handles "Right-click here"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Right-click here');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('mouse');
      expect(res?.response).toMatch(/Right-clicked/i);
    });

    it('handles "Scroll down" and "Scroll up"', async () => {
      const downRes = await fastLocalIntentRouter.tryRoute('Scroll down');
      expect(downRes?.matched).toBe(true);
      expect(downRes?.intent).toBe('mouse');
      expect(downRes?.response).toContain('Scrolled down');

      const upRes = await fastLocalIntentRouter.tryRoute('Scroll up');
      expect(upRes?.matched).toBe(true);
      expect(upRes?.intent).toBe('mouse');
      expect(upRes?.response).toContain('Scrolled up');
    });

    it('handles "Click the Start button"', async () => {
      const res = await fastLocalIntentRouter.tryRoute('Click the Start button');
      expect(res?.matched).toBe(true);
      expect(res?.intent).toBe('mouse');
      expect(res?.response).toBeDefined();
    });
  });
});
