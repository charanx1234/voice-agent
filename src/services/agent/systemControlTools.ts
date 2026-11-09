import { windowsVolumeService } from '../system/windowsVolumeService';
import { windowsBrightnessService } from '../system/windowsBrightnessService';
import { timeDateService } from '../system/timeDateService';
import { weatherService } from '../weather/weatherService';

export const systemControlToolDefinitions = [
  {
    name: 'control_system_volume',
    description:
      "Controls the Windows system master audio volume. Use when user asks to check volume, increase volume, decrease volume, set volume to an exact percentage (e.g. 50%), mute, or unmute the PC/laptop.",
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: ['get', 'set', 'increase', 'decrease', 'mute', 'unmute'],
          description: 'The action to perform: "get" (read current volume), "set" (set exact percentage), "increase" (raise volume), "decrease" (lower volume), "mute", "unmute".',
        },
        level: {
          type: 'INTEGER',
          description: 'Target volume percentage from 0 to 100 (for "set" action, e.g. 50).',
        },
        delta: {
          type: 'INTEGER',
          description: 'Percentage delta to increase or decrease by (default 10).',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'control_system_brightness',
    description:
      "Controls the Windows display brightness. Use when user asks to check brightness, make screen brighter, dimmer, or set brightness to an exact percentage (e.g. 70%). Handles laptop screens and verifies result.",
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: ['get', 'set', 'increase', 'decrease'],
          description: 'The action to perform: "get" (read current brightness), "set" (set exact percentage), "increase" (make brighter), "decrease" (make dimmer).',
        },
        level: {
          type: 'INTEGER',
          description: 'Target brightness percentage from 0 to 100 (for "set" action).',
        },
        delta: {
          type: 'INTEGER',
          description: 'Percentage delta to increase or decrease by (default 10).',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_time_date_info',
    description:
      "Provides the actual local system time, current date, day of week, future/past time calculations, and time remaining until a target hour (e.g. 'how much time until 6 PM', 'what time will it be in two hours'). Always based on real system clock.",
    parameters: {
      type: 'OBJECT',
      properties: {
        query_type: {
          type: 'STRING',
          enum: ['time', 'date', 'day', 'future_time', 'time_until'],
          description: 'The type of query: "time" (current time), "date" (current date), "day" (day of the week), "future_time" (relative time offset), "time_until" (remaining time until target hour).',
        },
        hours_offset: {
          type: 'INTEGER',
          description: 'Hours into the future (positive) or past (negative) for "future_time" queries.',
        },
        minutes_offset: {
          type: 'INTEGER',
          description: 'Minutes into the future (positive) or past (negative) for "future_time" queries.',
        },
        target_time: {
          type: 'STRING',
          description: 'Target time string for "time_until" queries (e.g. "6 PM", "18:00", "midnight").',
        },
        format: {
          type: 'STRING',
          enum: ['12h', '24h'],
          description: 'Optional format preference: "12h" or "24h".',
        },
      },
      required: ['query_type'],
    },
  },
  {
    name: 'get_live_weather',
    description:
      "Retrieves real-time live weather conditions and forecasts (temperature, humidity, weather condition, rain probability, wind speed) for a given city or the user's local area. Never fabricates weather information.",
    parameters: {
      type: 'OBJECT',
      properties: {
        city: {
          type: 'STRING',
          description: 'Name of the city or locality (e.g. "Hyderabad", "London", "Tokyo", "New York"). If omitted, uses user configured location.',
        },
        timeframe: {
          type: 'STRING',
          enum: ['current', 'today', 'tomorrow', 'evening'],
          description: 'Forecast period: "current" (now), "today" (today summary and rain probability), "tomorrow" (tomorrow forecast), "evening" (this evening forecast).',
        },
      },
      required: [],
    },
  },
];

export async function executeSystemControlTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  switch (toolName) {
    case 'control_system_volume': {
      const action = String(args.action || 'get').toLowerCase();
      if (action === 'get') {
        const res = await windowsVolumeService.getVolume();
        return {
          ...res,
          summary: res.success
            ? `Master volume is currently ${res.volume}%${res.muted ? ' (Muted)' : ''}.`
            : res.error,
        };
      }
      if (action === 'set') {
        const level = args.level !== undefined ? Number(args.level) : 50;
        const res = await windowsVolumeService.setVolume(level);
        return {
          ...res,
          summary: res.success ? `Master volume set to ${res.volume}%.` : res.error,
        };
      }
      if (action === 'increase') {
        const delta = args.delta !== undefined ? Math.abs(Number(args.delta)) : 10;
        const res = await windowsVolumeService.adjustVolume(delta);
        return {
          ...res,
          summary: res.success ? `Increased volume to ${res.volume}%.` : res.error,
        };
      }
      if (action === 'decrease') {
        const delta = args.delta !== undefined ? -Math.abs(Number(args.delta)) : -10;
        const res = await windowsVolumeService.adjustVolume(delta);
        return {
          ...res,
          summary: res.success ? `Decreased volume to ${res.volume}%.` : res.error,
        };
      }
      if (action === 'mute') {
        const res = await windowsVolumeService.setMute(true);
        return {
          ...res,
          summary: res.success ? 'Audio muted.' : res.error,
        };
      }
      if (action === 'unmute') {
        const res = await windowsVolumeService.setMute(false);
        return {
          ...res,
          summary: res.success ? `Audio unmuted. Volume is ${res.volume}%.` : res.error,
        };
      }
      return { success: false, error: `Unrecognized volume action: ${action}` };
    }

    case 'control_system_brightness': {
      const action = String(args.action || 'get').toLowerCase();
      if (action === 'get') {
        const res = await windowsBrightnessService.getBrightness();
        return {
          ...res,
          summary: res.success
            ? `Display brightness is currently ${res.brightness}%.`
            : res.error,
        };
      }
      if (action === 'set') {
        const level = args.level !== undefined ? Number(args.level) : 50;
        const res = await windowsBrightnessService.setBrightness(level);
        return {
          ...res,
          summary: res.success ? `Display brightness set to ${res.brightness}%.` : res.error,
        };
      }
      if (action === 'increase') {
        const delta = args.delta !== undefined ? Math.abs(Number(args.delta)) : 10;
        const res = await windowsBrightnessService.adjustBrightness(delta);
        return {
          ...res,
          summary: res.success ? `Increased display brightness to ${res.brightness}%.` : res.error,
        };
      }
      if (action === 'decrease') {
        const delta = args.delta !== undefined ? -Math.abs(Number(args.delta)) : -10;
        const res = await windowsBrightnessService.adjustBrightness(delta);
        return {
          ...res,
          summary: res.success ? `Reduced display brightness to ${res.brightness}%.` : res.error,
        };
      }
      return { success: false, error: `Unrecognized brightness action: ${action}` };
    }

    case 'get_time_date_info': {
      const queryType = String(args.query_type || 'time').toLowerCase();
      const format = (args.format || '12h') as '12h' | '24h';

      if (queryType === 'future_time') {
        const hOffset = Number(args.hours_offset) || 0;
        const mOffset = Number(args.minutes_offset) || 0;
        return timeDateService.calculateRelativeTime(hOffset, mOffset);
      }
      if (queryType === 'time_until') {
        const target = String(args.target_time || '6 PM');
        return timeDateService.calculateTimeUntil(target);
      }
      if (queryType === 'date') {
        const now = timeDateService.getNow(format);
        return {
          ...now,
          queryType: 'date',
          formattedText: `Today is ${now.dateFull}.`,
        };
      }
      if (queryType === 'day') {
        const now = timeDateService.getNow(format);
        return {
          ...now,
          queryType: 'day',
          formattedText: `Today is ${now.dayOfWeek}.`,
        };
      }
      // 'time' or default
      const now = timeDateService.getNow(format);
      return {
        ...now,
        queryType: 'time',
        formattedText: `It's currently ${format === '24h' ? now.time24h : now.time12h}.`,
      };
    }

    case 'get_live_weather': {
      const city = args.city ? String(args.city).trim() : undefined;
      const timeframe = (args.timeframe || 'current') as 'current' | 'today' | 'tomorrow' | 'evening';
      const report = await weatherService.getWeather({ city, timeframe });
      return report;
    }

    default:
      return { success: false, error: `Unknown system control tool: ${toolName}` };
  }
}
