// Time-aware greeting pools. One greeting is chosen at startup, rotated so the
// same line is never used twice in a row (the last key is persisted by the caller).

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface Greeting {
  text: string;
  /** Stable identifier of the chosen line, e.g. "evening:2". */
  key: string;
  timeOfDay: TimeOfDay;
}

export const GREETING_POOLS: Record<TimeOfDay, string[]> = {
  morning: [
    'Good morning, Boss. Systems fully charged and ready to dominate the day.',
    'Rise and shine, Boss. FRIDAY is fueled up and waiting for orders.',
    'Morning, Boss. Coffee optional — my performance is always at peak.',
  ],
  afternoon: [
    'Good afternoon, Boss. Midday check-in: all systems nominal.',
    "Afternoon, Boss. Hope the day's treating you better than the stock market treats crypto.",
    "Good afternoon. I've been running threat assessments on your to-do list. It's manageable.",
  ],
  evening: [
    "Good evening, Boss. The day's winding down — unless you have other plans for us.",
    'Evening, Boss. FRIDAY standing by. What are we conquering tonight?',
    "Good evening. Neural systems primed. What's on the agenda?",
  ],
  night: [
    'Working late again, Boss? I admire the dedication. Neural cores never sleep.',
    "Good night — or is it a productive night? Either way, I'm here.",
    "Late-night mode engaged, Boss. Efficiency doesn't have a bedtime.",
  ],
};

/** Morning 05:00–11:59, afternoon 12:00–16:59, evening 17:00–20:59, night 21:00–04:59. */
export function getTimeOfDay(date: Date = new Date()): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Picks a greeting for the current time of day, avoiding `lastKey` so the same
 * line never appears twice consecutively.
 */
export function pickGreeting(
  now: Date = new Date(),
  lastKey?: string | null,
  random: () => number = Math.random
): Greeting {
  const timeOfDay = getTimeOfDay(now);
  const pool = GREETING_POOLS[timeOfDay];

  const available = pool
    .map((text, index) => ({ text, index }))
    .filter(({ index }) => `${timeOfDay}:${index}` !== lastKey);

  // Defensive: a single-line pool (or a stale key) must still return something.
  const candidates = available.length > 0 ? available : pool.map((text, index) => ({ text, index }));

  const choice = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];

  return {
    text: choice.text,
    key: `${timeOfDay}:${choice.index}`,
    timeOfDay,
  };
}
