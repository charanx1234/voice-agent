import { describe, it, expect } from 'vitest';
import { GREETING_POOLS, getTimeOfDay, pickGreeting } from '../src/services/voice/greetings';

const at = (hour: number, minute = 0) => new Date(2026, 9, 31, hour, minute, 0);

describe('Time-of-day buckets', () => {
  it('maps clock hours to morning, afternoon, evening and night', () => {
    expect(getTimeOfDay(at(5))).toBe('morning');
    expect(getTimeOfDay(at(11, 59))).toBe('morning');
    expect(getTimeOfDay(at(12))).toBe('afternoon');
    expect(getTimeOfDay(at(16, 59))).toBe('afternoon');
    expect(getTimeOfDay(at(17))).toBe('evening');
    expect(getTimeOfDay(at(20, 59))).toBe('evening');
    expect(getTimeOfDay(at(21))).toBe('night');
    expect(getTimeOfDay(at(23, 59))).toBe('night');
    expect(getTimeOfDay(at(4, 59))).toBe('night');
  });
});

describe('Greeting rotation', () => {
  it('has three lines in every pool', () => {
    for (const pool of Object.values(GREETING_POOLS)) {
      expect(pool).toHaveLength(3);
    }
  });

  it('only returns a line from the current time of day', () => {
    const greeting = pickGreeting(at(18), null, () => 0.5);

    expect(GREETING_POOLS.evening).toContain(greeting.text);
    expect(greeting.key.startsWith('evening:')).toBe(true);
    expect(greeting.timeOfDay).toBe('evening');
  });

  it('never repeats the previous greeting, even when randomness is constant', () => {
    let lastKey: string | null = null;

    for (let i = 0; i < 30; i++) {
      const greeting = pickGreeting(at(9), lastKey, () => 0);
      expect(greeting.key).not.toBe(lastKey);
      lastKey = greeting.key;
    }
  });

  it('avoids the previous line regardless of which line the random source picks', () => {
    GREETING_POOLS.afternoon.forEach((_, index) => {
      const previous = `afternoon:${index}`;
      const greeting = pickGreeting(at(14), previous, () => index / GREETING_POOLS.afternoon.length);
      expect(greeting.key).not.toBe(previous);
    });
  });

  it('still returns a greeting when the random source is at the boundary', () => {
    const greeting = pickGreeting(at(22), null, () => 1);
    expect(GREETING_POOLS.night).toContain(greeting.text);
  });
});
