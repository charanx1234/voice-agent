import { describe, it, expect } from 'vitest';
import { parseReminderTime } from '../src/services/reminders/timeParser';
import { sanitizeArtifact } from '../src/services/dashboard/dashboardTool';

const at = (hour: number, minute = 0) => new Date(2026, 9, 31, hour, minute, 0);

describe('Reminder time parsing', () => {
  it('understands relative minutes and hours', () => {
    const now = at(10, 0);
    expect(parseReminderTime('in 20 minutes', now)?.dueAt.getTime()).toBe(
      now.getTime() + 20 * 60_000
    );
    expect(parseReminderTime('in 2 hours', now)?.dueAt.getTime()).toBe(
      now.getTime() + 2 * 3_600_000
    );
    expect(parseReminderTime('in an hour', now)?.dueAt.getTime()).toBe(
      now.getTime() + 3_600_000
    );
  });

  it('reads a bare hour as the next occurrence', () => {
    // 10:00 -> "at 6" means 18:00 today
    const morning = parseReminderTime('at 6', at(10))!;
    expect(morning.dueAt.getHours()).toBe(18);
    expect(morning.dueAt.getDate()).toBe(31);

    // 19:00 -> "at 6" means 18:00 tomorrow
    const evening = parseReminderTime('at 6', at(19))!;
    expect(evening.dueAt.getHours()).toBe(18);
    expect(evening.dueAt.getDate()).toBe(1);
  });

  it('honours explicit am/pm', () => {
    const morning = parseReminderTime('at 9 am', at(7))!;
    expect(morning.dueAt.getHours()).toBe(9);

    const evening = parseReminderTime('at 9 pm', at(7))!;
    expect(evening.dueAt.getHours()).toBe(21);
  });

  it('respects today, tonight and tomorrow', () => {
    const tomorrow = parseReminderTime('tomorrow at 9', at(15))!;
    expect(tomorrow.dueAt.getDate()).toBe(1);
    expect(tomorrow.dueAt.getHours()).toBe(9);

    const tonight = parseReminderTime('tonight at 8', at(15))!;
    expect(tonight.dueAt.getDate()).toBe(31);
    expect(tonight.dueAt.getHours()).toBe(20);

    const bareTomorrow = parseReminderTime('tomorrow', at(15))!;
    expect(bareTomorrow.dueAt.getDate()).toBe(1);
    expect(bareTomorrow.dueAt.getHours()).toBe(9);
  });

  it('accepts an ISO timestamp from the model', () => {
    const parsed = parseReminderTime('2026-11-01T18:30:00', at(9))!;
    expect(parsed.dueAt.getFullYear()).toBe(2026);
    expect(parsed.dueAt.getMonth()).toBe(10);
    expect(parsed.dueAt.getDate()).toBe(1);
    expect(parsed.dueAt.getHours()).toBe(18);
    expect(parsed.dueAt.getMinutes()).toBe(30);
  });

  it('returns null when no time is present', () => {
    expect(parseReminderTime('call mom sometime', at(10))).toBeNull();
    expect(parseReminderTime('', at(10))).toBeNull();
  });
});

describe('Dashboard artifact sanitising', () => {
  it('keeps a valid artifact', () => {
    const artifact = sanitizeArtifact({
      title: 'Retry helper',
      kind: 'code',
      content: 'def retry(): pass',
      language: 'python',
    })!;

    expect(artifact.kind).toBe('code');
    expect(artifact.language).toBe('python');
    expect(artifact.title).toBe('Retry helper');
    expect(artifact.id).toMatch(/^art_/);
  });

  it('falls back to document for unknown kinds', () => {
    const artifact = sanitizeArtifact({ title: 'x', kind: 'video', content: 'hello' })!;
    expect(artifact.kind).toBe('document');
  });

  it('rejects empty content', () => {
    expect(sanitizeArtifact({ title: 'x', kind: 'code', content: '   ' })).toBeNull();
    expect(sanitizeArtifact({})).toBeNull();
  });

  it('caps very large content and titles', () => {
    const artifact = sanitizeArtifact({
      title: 't'.repeat(500),
      kind: 'document',
      content: 'x'.repeat(100_000),
    })!;

    expect(artifact.title.length).toBe(120);
    expect(artifact.content.length).toBe(40_000);
  });
});
