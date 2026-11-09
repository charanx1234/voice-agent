import { describe, it, expect } from 'vitest';
import { timeDateService } from '../src/services/system/timeDateService';

describe('Time and Date Service', () => {
  it('returns current time, date and timezone correctly', () => {
    const res = timeDateService.getNow();
    expect(res.success).toBe(true);
    expect(res.time12h).toMatch(/^\d{1,2}:\d{2}\s+(?:AM|PM)$/i);
    expect(res.time24h).toMatch(/^\d{2}:\d{2}$/);
    expect(res.dayOfWeek).toMatch(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i);
    expect(res.dateFull.length).toBeGreaterThan(5);
    expect(res.timeZone.length).toBeGreaterThan(0);
  });

  it('calculates future relative time offsets accurately', () => {
    const res = timeDateService.calculateRelativeTime(2, 0);
    expect(res.success).toBe(true);
    expect(res.formattedText).toMatch(/In 2 hours, it will be \d{1,2}:\d{2}\s+(?:AM|PM)\./i);
    expect(res.details?.hoursOffset).toBe(2);
  });

  it('calculates past relative time offsets accurately', () => {
    const res = timeDateService.calculateRelativeTime(-1, -30);
    expect(res.success).toBe(true);
    expect(res.formattedText).toMatch(/1 hour and 30 minutes ago, it was \d{1,2}:\d{2}\s+(?:AM|PM)\./i);
    expect(res.details?.isFuture).toBe(false);
  });

  it('calculates time remaining until target hour', () => {
    const res = timeDateService.calculateTimeUntil('6 PM');
    expect(res.success).toBe(true);
    expect(res.formattedText).toMatch(/There is .* until 6:00 PM/i);
    expect(res.details?.totalMinutes).toBeGreaterThan(0);
  });

  it('handles invalid time input gracefully', () => {
    const res = timeDateService.calculateTimeUntil('invalid_time_xyz');
    expect(res.success).toBe(false);
    expect(res.formattedText).toContain('valid time');
  });
});
