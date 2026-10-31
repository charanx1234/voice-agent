// Turns spoken phrases like "at 6", "in 20 minutes" or "tomorrow at 9"
// into a concrete Date. Returns null when no time can be understood.

export interface ParsedReminderTime {
  dueAt: Date;
  /** The fragment that produced the date, useful for confirmations. */
  matched: string;
}

const TIME_PATTERN = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

function withTime(base: Date, hours: number, minutes: number): Date {
  const result = new Date(base);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function parseReminderTime(input: string, now: Date = new Date()): ParsedReminderTime | null {
  const text = (input || '').trim().toLowerCase();
  if (!text) return null;

  // Explicit ISO timestamp from the model.
  const iso = input.trim().match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/);
  if (iso) {
    const parsed = new Date(iso[0]);
    if (!Number.isNaN(parsed.getTime())) {
      return { dueAt: parsed, matched: iso[0] };
    }
  }

  // Relative: "in 20 minutes", "in an hour", "in 2 hours 10 minutes"
  const relative = text.match(/\bin\s+(\d+|an?|one)\s*(sec(?:ond)?s?|min(?:ute)?s?|hours?|hrs?|days?)/);
  if (relative) {
    const rawCount = relative[1];
    const count = rawCount === 'a' || rawCount === 'an' || rawCount === 'one' ? 1 : parseInt(rawCount, 10);
    const unit = relative[2];
    const multiplier = unit.startsWith('sec')
      ? 1000
      : unit.startsWith('min')
      ? 60_000
      : unit.startsWith('h')
      ? 3_600_000
      : 86_400_000;

    return { dueAt: new Date(now.getTime() + count * multiplier), matched: relative[0] };
  }

  // "tomorrow at 9", "tonight at 8", "today at 18:30"
  const dayWord = text.match(/\b(today|tonight|tomorrow)\b/)?.[1];
  const timeMatch = text.match(TIME_PATTERN);

  if (timeMatch) {
    const rawHour = parseInt(timeMatch[1], 10);
    const rawMinutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3];

    if (rawMinutes > 59) return null;

    let hours: number;
    if (meridiem) {
      hours = rawHour % 12 + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
    } else if (dayWord) {
      hours = rawHour;
    } else if (rawHour <= 12) {
      // Ambiguous hour: pick the next occurrence, preferring the nearest future time.
      const morning = withTime(now, rawHour % 12, rawMinutes);
      const evening = withTime(now, (rawHour % 12) + 12, rawMinutes);
      const next = morning.getTime() > now.getTime() ? morning : evening;
      const dueAt = next.getTime() > now.getTime() ? next : addDays(next, 1);
      return { dueAt, matched: timeMatch[0] };
    } else {
      hours = rawHour;
    }

    let dueAt = withTime(now, hours, rawMinutes);
    if (dayWord === 'tomorrow') dueAt = addDays(dueAt, 1);
    if (dayWord === 'tonight' && hours < 12) dueAt = withTime(now, hours + 12, rawMinutes);
    if (!dayWord && dueAt.getTime() <= now.getTime()) dueAt = addDays(dueAt, 1);

    return { dueAt, matched: `${dayWord ? `${dayWord} ` : ''}${timeMatch[0]}` };
  }

  // Bare "tomorrow" / "tonight" defaults to 9am / 8pm.
  if (dayWord === 'tomorrow') {
    return { dueAt: withTime(addDays(now, 1), 9, 0), matched: 'tomorrow' };
  }
  if (dayWord === 'tonight') {
    return { dueAt: withTime(now, 20, 0), matched: 'tonight' };
  }

  return null;
}
