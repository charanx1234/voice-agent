export interface TimeDateResult {
  success: boolean;
  queryType: 'time' | 'date' | 'day' | 'relative_time' | 'time_until' | 'full';
  formattedText: string;
  isoString: string;
  timestampMs: number;
  time12h: string;
  time24h: string;
  dateFull: string;
  dayOfWeek: string;
  timeZone: string;
  details?: Record<string, any>;
}

export class TimeDateService {
  /**
   * Returns current local time and date in both 12-hour and 24-hour formats.
   */
  public getNow(format12or24: '12h' | '24h' = '12h'): TimeDateResult {
    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const time12h = now.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const time24h = now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const dateFull = now.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const dayOfWeek = now.toLocaleDateString(undefined, { weekday: 'long' });

    const formattedTime = format12or24 === '24h' ? time24h : time12h;

    return {
      success: true,
      queryType: 'full',
      formattedText: `It's ${formattedTime} on ${dateFull} (${timeZone}).`,
      isoString: now.toISOString(),
      timestampMs: now.getTime(),
      time12h,
      time24h,
      dateFull,
      dayOfWeek,
      timeZone,
    };
  }

  /**
   * Calculates future or past time given hours and minutes offset.
   * e.g. "What time will it be in two hours?" -> hoursOffset = 2
   */
  public calculateRelativeTime(hoursOffset = 0, minutesOffset = 0): TimeDateResult {
    const target = new Date();
    target.setMinutes(target.getMinutes() + minutesOffset);
    target.setHours(target.getHours() + hoursOffset);

    const time12h = target.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const isFuture = hoursOffset > 0 || (hoursOffset === 0 && minutesOffset > 0);
    const durationParts: string[] = [];
    const absHours = Math.abs(hoursOffset);
    const absMins = Math.abs(minutesOffset);

    if (absHours > 0) durationParts.push(`${absHours} hour${absHours > 1 ? 's' : ''}`);
    if (absMins > 0) durationParts.push(`${absMins} minute${absMins > 1 ? 's' : ''}`);
    const durationStr = durationParts.join(' and ') || '0 minutes';

    const formattedText = isFuture
      ? `In ${durationStr}, it will be ${time12h}.`
      : `${durationStr} ago, it was ${time12h}.`;

    const base = this.getNow();
    return {
      ...base,
      queryType: 'relative_time',
      formattedText,
      isoString: target.toISOString(),
      timestampMs: target.getTime(),
      time12h,
      details: { hoursOffset, minutesOffset, isFuture },
    };
  }

  /**
   * Calculates the remaining duration until a given target time string.
   * Supports: "6 PM", "18:00", "6:30 PM", "noon", "midnight".
   */
  public calculateTimeUntil(targetTimeString: string): TimeDateResult {
    const base = this.getNow();
    const clean = (targetTimeString || '').toLowerCase().trim();

    let targetHour = -1;
    let targetMinute = 0;

    if (clean === 'noon' || clean === '12 noon') {
      targetHour = 12;
      targetMinute = 0;
    } else if (clean === 'midnight' || clean === '12 midnight') {
      targetHour = 0;
      targetMinute = 0;
    } else {
      // Parse patterns like "6 pm", "6:30 pm", "18:00", "6am"
      const match12 = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
      if (match12) {
        let h = parseInt(match12[1], 10);
        const m = match12[2] ? parseInt(match12[2], 10) : 0;
        const meridian = match12[3].toLowerCase();
        if (meridian === 'pm' && h < 12) h += 12;
        if (meridian === 'am' && h === 12) h = 0;
        targetHour = h;
        targetMinute = m;
      } else {
        const match24 = clean.match(/^(\d{1,2}):(\d{2})$/);
        if (match24) {
          targetHour = parseInt(match24[1], 10);
          targetMinute = parseInt(match24[2], 10);
        }
      }
    }

    if (targetHour < 0 || targetHour > 23 || targetMinute < 0 || targetMinute > 59) {
      return {
        ...base,
        success: false,
        formattedText: `I couldn't recognize "${targetTimeString}" as a valid time. Try saying e.g. "6 PM" or "18:30".`,
      };
    }

    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setHours(targetHour, targetMinute, 0, 0);

    // If the target time has already passed today, assume tomorrow
    if (targetDate.getTime() <= now.getTime()) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    const diffMs = targetDate.getTime() - now.getTime();
    const totalMinutes = Math.round(diffMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    const timeRemainingStr = parts.join(' and ');

    const displayTarget = targetDate.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const isTomorrow = targetDate.getDate() !== now.getDate();
    const formattedText = `There is ${timeRemainingStr} until ${displayTarget}${isTomorrow ? ' tomorrow' : ''}.`;

    return {
      ...base,
      queryType: 'time_until',
      formattedText,
      details: {
        targetHour,
        targetMinute,
        remainingHours: hours,
        remainingMinutes: minutes,
        totalMinutes,
        displayTarget,
        isTomorrow,
      },
    };
  }
}

export const timeDateService = new TimeDateService();
