import { execFile } from 'child_process';
import { toolRegistry } from './toolRegistry';
import { desktopControlService } from '../desktop/desktopControlService';
import { windowsVolumeService } from '../system/windowsVolumeService';
import { windowsBrightnessService } from '../system/windowsBrightnessService';
import { timeDateService } from '../system/timeDateService';
import { weatherService } from '../weather/weatherService';
import { quickActionsService } from '../quicktools/quickActionsService';
import { clipboardHistoryService } from '../quicktools/clipboardHistoryService';
import { snippetsService } from '../quicktools/snippetsService';
import { windowManagerService } from '../quicktools/windowManagerService';
import { quickNotesService } from '../quicktools/quickNotesService';
import { batchRenamerService } from '../quicktools/batchRenamerService';
import { fileFinderService } from '../quicktools/fileFinderService';
import { workspacesService } from '../quicktools/workspacesService';
import {
  sendMediaKeyEvent,
  executeMusicControlTool,
  getPendingMusicQuery,
  setPendingMusicQuery,
  clearPendingMusicQuery,
} from './musicControlTool';
import { bestAppMatch, displayNameForAppQuery, ALLOWED_APPLICATIONS } from './appShortcutsTool';
import { isForeignAssistantCommand, validateVoiceAction } from './voiceActionGuard';

export interface FastLocalIntentResult {
  matched: boolean;
  intent: 'launch_app' | 'close_app' | 'media' | 'volume' | 'brightness' | 'time' | 'date' | 'battery' | 'window' | 'weather' | 'mouse' | 'quicktools';
  response: string;
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, any>;
    result: any;
    status: 'completed' | 'failed';
  }>;
  executionMs: number;
}

// Windows Virtual-Key Codes for Multimedia & Volume
const VK_VOLUME_MUTE = 0xad;
const VK_VOLUME_DOWN = 0xae;
const VK_VOLUME_UP = 0xaf;
const VK_MEDIA_NEXT_TRACK = 0xb0;
const VK_MEDIA_PREV_TRACK = 0xb1;
const VK_MEDIA_PLAY_PAUSE = 0xb3;

/**
 * Executes PowerShell snippet quickly with 4s timeout.
 */
function runFastPowerShell(script: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 4000 },
      (err, stdout) => {
        if (err) resolve('');
        else resolve((stdout || '').trim());
      }
    );
  });
}

/**
 * Extracts target app from multilingual launch commands.
 * Handles:
 * - English: "open chrome", "launch spotify", "run notepad", "start terminal"
 * - Telugu: "chrome open chey", "spotify open cheyi", "notepad teeyi", "calculator chalu chey"
 * - Hinglish: "chrome kholo", "notepad chalao", "spotify open karo"
 */
export function extractMultilingualLaunchApp(text: string): string | null {
  const clean = (text || '').trim();
  if (!clean || /\b(and|then|after|when|because|kani|mariyu|tarwatha)\b/i.test(clean)) {
    return null;
  }

  // English prefix patterns: open / launch / start / run / check <app>
  const enMatch = clean.match(
    /^(?:(?:wait|no|okay|ok|actually|hey|please|first|can you|could you)[, ]+)*(?:first[, ]+)?(?:friday[\s,]+)?(?:please\s+)?(?:open|launch|start|run|check(?:\s+for|\s+if|\s+out)?)\s+(.+?)\s*[,.!?]*$/i
  );
  if (enMatch) {
    let candidate = enMatch[1].replace(/^the\s+/i, '').replace(/\s+(?:application|app)$/i, '').trim();
    candidate = candidate.replace(/\s+(?:is|there)?\s*(?:on\s+(?:my\s+)?(?:desktop|pc|computer))(?:\s*,\s*check(?:\s+once)?)?$/i, '').trim();
    candidate = candidate.replace(/\s+(?:is|there)$/i, '').trim();
    if (candidate && !/\b(weather|news|meaning|definition)\b/i.test(candidate)) {
      return candidate;
    }
  }

  // Desktop check patterns: e.g. "I mean not anti-gravity, I just mean anti-gravity on my desktop, check once"
  const desktopMatch = clean.match(
    /(?:(?:mean|check|find|look for|open)\s+)?(?:the\s+)?([a-zA-Z0-9_\-\.\+ ]+?)\s+on\s+my\s+(?:desktop|pc|computer)(?:[,\s]+check(?:\s+once)?)?/i
  );
  if (desktopMatch) {
    let candidate = desktopMatch[1].trim();
    candidate = candidate.replace(/^(?:i\s+)?(?:just\s+)?(?:mean\s+)?(?:the\s+)?/i, '').trim();
    if (candidate && candidate.length > 1 && !/\b(weather|news|time|date)\b/i.test(candidate)) {
      return candidate;
    }
  }

  // Telugu suffix patterns: <app> open chey / open cheyi / teeyi / chalu chey
  const teMatch = clean.match(
    /^(?:(?:wait|no|okay|ok|aagu)[, ]+)*(?:first[, ]+)?(?:hey\s+)?(?:friday[\s,]+)?(.+?)\s+(?:open\s*chey(?:i)?|chalu\s*chey(?:i)?|teeyi|open\s*sey)\s*[,.!?]*$/i
  );
  if (teMatch) {
    return teMatch[1].replace(/^the\s+/i, '').replace(/\s+(?:application|app)$/i, '').trim();
  }

  // Hinglish suffix patterns: <app> kholo / open karo / chalao
  const hiMatch = clean.match(
    /^(?:(?:wait|no|okay|ok|ruko)[, ]+)*(?:first[, ]+)?(?:hey\s+)?(?:friday[\s,]+)?(.+?)\s+(?:kholo|open\s*karo|chalao)\s*[,.!?]*$/i
  );
  if (hiMatch) {
    return hiMatch[1].replace(/^the\s+/i, '').replace(/\s+(?:application|app)$/i, '').trim();
  }

  return null;
}

/**
 * Extracts target app from multilingual close commands.
 * Handles:
 * - English: "close chrome", "quit spotify", "exit notepad"
 * - Telugu: "chrome close chey", "spotify aapu", "notepad bandh chey", "chrome moosi veyyi"
 * - Hinglish: "chrome band karo", "spotify close karo"
 */
export function extractMultilingualCloseApp(text: string): string | null {
  const clean = (text || '').trim();
  if (!clean || /\b(and|then|after|when|because)\b/i.test(clean)) return null;

  // English: close / quit / exit <app>
  const enMatch = clean.match(
    /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?(?:close|quit|exit|kill)\s+(.+?)\s*[,.!?]*$/i
  );
  if (enMatch) {
    return enMatch[1].replace(/^the\s+/i, '').replace(/\s+(?:application|app)$/i, '').trim();
  }

  // Telugu: <app> close chey / aapu / bandh chey / moosi veyyi
  const teMatch = clean.match(
    /^(?:hey\s+)?(?:friday[\s,]+)?(.+?)\s+(?:close\s*chey(?:i)?|aapu|bandh\s*chey(?:i)?|moosi\s*veyyi)\s*[,.!?]*$/i
  );
  if (teMatch) {
    return teMatch[1].replace(/^the\s+/i, '').replace(/\s+(?:application|app)$/i, '').trim();
  }

  // Hinglish: <app> band karo / close karo
  const hiMatch = clean.match(
    /^(?:hey\s+)?(?:friday[\s,]+)?(.+?)\s+(?:band\s*karo|close\s*karo)\s*[,.!?]*$/i
  );
  if (hiMatch) {
    return hiMatch[1].replace(/^the\s+/i, '').replace(/\s+(?:application|app)$/i, '').trim();
  }

  return null;
}

/**
 * Fast Local Intent Router (<100ms Execution).
 * Intercepts unambiguous voice commands locally without calling cloud LLM APIs.
 */

function parseNumberWord(text: string): number | null {
  const map: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
    twentyfive: 25, 'twenty-five': 25, thirty: 30,
    forty: 40, fifty: 50, sixty: 60, seventy: 70,
    eighty: 80, ninety: 90, hundred: 100, maximum: 100, max: 100,
  };
  const clean = (text || '').toLowerCase().trim();
  if (map[clean] !== undefined) return map[clean];
  const num = parseInt(clean, 10);
  return isNaN(num) ? null : num;
}

export class FastLocalIntentRouter {
  public async tryRoute(
    userInput: string,
    preferredLanguage = 'en-IN',
    personalityMode = 'balanced'
  ): Promise<FastLocalIntentResult | null> {
    const start = Date.now();
    const clean = (userInput || '').trim();
    if (!clean) return null;

    const lower = clean.toLowerCase();
    const isTelugu = preferredLanguage.startsWith('te') || /\b(chey|cheyi|aapu|undi|entha|cheppu|theedi)\b/i.test(lower);
    const isHindi = preferredLanguage.startsWith('hi') || /\b(karo|kholo|chalao|batao|hai|kitni)\b/i.test(lower);

    // Block accidental desktop execution if command was addressed to another assistant
    if (isForeignAssistantCommand(clean)) {
      return {
        matched: true,
        intent: 'media',
        response: isTelugu
          ? 'ఆ కమాండ్ వేరే అసిస్టెంట్‌కి ఉద్దేశించినది కాబట్టి నేను ఎటువంటి డెస్క్‌టాప్ యాక్షన్ చేయలేదు.'
          : 'That command was addressed to another assistant (Google/Siri/Alexa). Desktop actions were blocked for security.',
        toolCalls: [],
        executionMs: Date.now() - start,
      };
    }

    // 1. Time query
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:what\s+time\s+is\s+it|tell\s+me\s+the\s+time|current\s+time|time\s+entha|time\s+cheppu|samayam\s+entha|kya\s+time\s+hua\s+hai|time\s+batao)[?.!]?$/i.test(
        lower
      )
    ) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      let response = `The time is ${timeStr}.`;
      if (isTelugu) response = `Ippudu time ${timeStr}.`;
      else if (isHindi) response = `Abhi samay ${timeStr} hua hai.`;

      return {
        matched: true,
        intent: 'time',
        response,
        executionMs: Date.now() - start,
      };
    }

    // 1b. Day of week query
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:what\s+day\s+is\s+today|what\s+day\s+is\s+it|which\s+day\s+is\s+today|today\s+which\s+day|eroju\s+emi\s+vaaram|aaj\s+kaun\s+sa\s+din\s+hai)[?.!]?$/i.test(
        lower
      )
    ) {
      const now = timeDateService.getNow();
      let response = `Today is ${now.dayOfWeek}.`;
      if (isTelugu) response = `Eroju ${now.dayOfWeek}.`;
      else if (isHindi) response = `Aaj ${now.dayOfWeek} hai.`;

      return {
        matched: true,
        intent: 'date',
        response,
        toolCalls: [{ toolName: 'get_time_date_info', args: { query_type: 'day' }, result: { day: now.dayOfWeek }, status: 'completed' }],
        executionMs: Date.now() - start,
      };
    }

    // 1c. Relative future/past time query (e.g. "what time will it be in two hours", "what time will it be in 30 minutes")
    const relativeTimeMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:what\s+time\s+will\s+it\s+be\s+in|time\s+after)\s+(\w+)\s+(hour|hours|hr|hrs|minute|minutes|min|mins)[?.!]?$/i
    );
    if (relativeTimeMatch) {
      const count = parseNumberWord(relativeTimeMatch[1]);
      if (count !== null) {
        const isHours = relativeTimeMatch[2].startsWith('h');
        const hOffset = isHours ? count : 0;
        const mOffset = isHours ? 0 : count;
        const res = timeDateService.calculateRelativeTime(hOffset, mOffset);
        return {
          matched: true,
          intent: 'time',
          response: res.formattedText,
          toolCalls: [{ toolName: 'get_time_date_info', args: { query_type: 'future_time', hours_offset: hOffset, minutes_offset: mOffset }, result: res, status: 'completed' }],
          executionMs: Date.now() - start,
        };
      }
    }

    // 1d. Time until query (e.g. "how much time until 6 PM", "how much time left until 6:00 pm", "how long until 6 pm")
    const timeUntilMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:how\s+much\s+time(?:\s+is\s+there|\s+left)?\s+until|how\s+long\s+until)\s+(.+?)[?.!]?$/i
    );
    if (timeUntilMatch) {
      const targetStr = timeUntilMatch[1].trim();
      const res = timeDateService.calculateTimeUntil(targetStr);
      if (res.success) {
        return {
          matched: true,
          intent: 'time',
          response: res.formattedText,
          toolCalls: [{ toolName: 'get_time_date_info', args: { query_type: 'time_until', target_time: targetStr }, result: res, status: 'completed' }],
          executionMs: Date.now() - start,
        };
      }
    }

    // 1e. Weather queries (e.g. "what's the weather", "what's the temperature outside", "will it rain today", "tomorrow's weather", "weather in Hyderabad")
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:(?:what(?:'s|\s+is)\s+the\s+weather|how(?:'s|\s+is)\s+the\s+weather|weather\s+report|weather\s+forecast)(?:\s+(?:in|for|at)\s+([a-zA-Z\s]+))?|will\s+it\s+rain\s+today|is\s+it\s+going\s+to\s+rain(?:\s+this\s+evening|\s+today|\s+tonight)?|what(?:'s|\s+is)\s+the\s+temperature(?:\s+outside)?|tell\s+me\s+tomorrow(?:'s)?\s+weather)[?.!]?$/i.test(
        lower
      )
    ) {
      let timeframe: 'current' | 'today' | 'tomorrow' | 'evening' = 'current';
      if (/tomorrow/i.test(lower)) timeframe = 'tomorrow';
      else if (/evening|tonight/i.test(lower)) timeframe = 'evening';
      else if (/today|rain\s+today/i.test(lower)) timeframe = 'today';

      const cityMatch = lower.match(/(?:in|for|at)\s+([a-zA-Z\s]+?)(?:\s+(?:today|tomorrow|this\s+evening))?[?.!]?$/i);
      const city = cityMatch ? cityMatch[1].trim() : undefined;

      const report = await weatherService.getWeather({ city, timeframe });
      return {
        matched: true,
        intent: 'weather',
        response: report.formattedText,
        toolCalls: [{ toolName: 'get_live_weather', args: { city, timeframe }, result: report, status: report.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // 2. Date query
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:what('s|\s+is)\s+today'?s?\s+date|what\s+date\s+is\s+it|today'?s?\s+date|date\s+cheppu|eroju\s+date\s+entha|eroju\s+theedi|aaj\s+ki\s+date|aaj\s+kaun\s+sa\s+din\s+hai)[?.!]?$/i.test(
        lower
      )
    ) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      let response = `Today is ${dateStr}.`;
      if (isTelugu) response = `Eroju theedi ${dateStr}.`;
      else if (isHindi) response = `Aaj ki date ${dateStr} hai.`;

      return {
        matched: true,
        intent: 'date',
        response,
        executionMs: Date.now() - start,
      };
    }

    // 3. Battery status
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:battery\s+level|battery\s+status|battery\s+percentage|charge\s+entha\s+undi|battery\s+entha\s+undi|battery\s+kitni\s+hai)[?.!]?$/i.test(
        lower
      )
    ) {
      const script = `Add-Type -AssemblyName System.Windows.Forms; [math]::Round([System.Windows.Forms.SystemInformation]::PowerStatus.BatteryLifePercent * 100)`;
      const percentStr = await runFastPowerShell(script);
      const percent = parseInt(percentStr, 10);
      let response = 'Battery information is currently unavailable.';
      if (!isNaN(percent) && percent >= 0) {
        response = `Battery is at ${percent}%.`;
        if (isTelugu) response = `Battery ${percent}% undi.`;
        else if (isHindi) response = `Battery ${percent}% hai.`;
      }

      return {
        matched: true,
        intent: 'battery',
        response,
        executionMs: Date.now() - start,
      };
    }

    // 4. Music Platform Choice Follow-up ("spotify" or "youtube")
    const pendingSong = getPendingMusicQuery();
    if (
      pendingSong &&
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?(?:on\s+|in\s+)?(?:spotify|spotify\s*lo|spotify\s*me|spotify\s*please)[?.!]?$/i.test(
        lower
      )
    ) {
      clearPendingMusicQuery();
      await executeMusicControlTool('control_music', {
        action: 'play_spotify',
        app: 'spotify',
        query: pendingSong,
      });
      return {
        matched: true,
        intent: 'media',
        response: `Searching and playing "${pendingSong}" on Spotify.`,
        executionMs: Date.now() - start,
      };
    }

    if (
      pendingSong &&
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?(?:on\s+|in\s+)?(?:youtube|youtube\s*lo|youtube\s*me|youtube\s*please|yt)[?.!]?$/i.test(
        lower
      )
    ) {
      clearPendingMusicQuery();
      await executeMusicControlTool('control_music', {
        action: 'play_youtube',
        app: 'youtube',
        query: pendingSong,
      });
      return {
        matched: true,
        intent: 'media',
        response: `Searching and playing "${pendingSong}" on YouTube.`,
        executionMs: Date.now() - start,
      };
    }

    // Explicit Spotify Play (e.g. "play starboy on spotify", "spotify lo starboy play chey")
    const spotifyDirectMatch =
      clean.match(
        /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?(?:play|search\s+and\s+play)\s+(.+?)\s+(?:on|in)\s+spotify[?.!]?$/i
      ) ||
      clean.match(
        /^(?:hey\s+)?(?:friday[\s,]+)?spotify\s*(?:lo|me|pe)\s*(.+?)\s*(?:play\s*chey|chalao|play)[?.!]?$/i
      ) ||
      clean.match(
        /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?(?:play\s+on\s+spotify|open\s+spotify\s+and\s+play\s+(.+?))[?.!]?$/i
      );

    if (spotifyDirectMatch) {
      const song = (spotifyDirectMatch[1] || '').trim();
      clearPendingMusicQuery();
      await executeMusicControlTool('control_music', {
        action: 'play_spotify',
        app: 'spotify',
        query: song,
      });
      return {
        matched: true,
        intent: 'media',
        response: song ? `Searching and playing "${song}" on Spotify.` : 'Opened Spotify and resumed playback.',
        executionMs: Date.now() - start,
      };
    }

    // Explicit YouTube Play (e.g. "play starboy on youtube", "youtube lo starboy play chey")
    const youtubeDirectMatch =
      clean.match(
        /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?(?:play|search\s+and\s+play)\s+(.+?)\s+(?:on|in)\s+youtube[?.!]?$/i
      ) ||
      clean.match(
        /^(?:hey\s+)?(?:friday[\s,]+)?youtube\s*(?:lo|me|pe)\s*(.+?)\s*(?:play\s*chey|chalao|play)[?.!]?$/i
      ) ||
      clean.match(
        /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?(?:play\s+on\s+youtube|open\s+youtube\s+and\s+play\s+(.+?))[?.!]?$/i
      );

    if (youtubeDirectMatch) {
      const song = (youtubeDirectMatch[1] || '').trim();
      clearPendingMusicQuery();
      await executeMusicControlTool('control_music', {
        action: 'play_youtube',
        app: 'youtube',
        query: song,
      });
      return {
        matched: true,
        intent: 'media',
        response: song ? `Searching and playing "${song}" on YouTube.` : 'Opened YouTube Music.',
        executionMs: Date.now() - start,
      };
    }

    // Generic Play Song without app specified -> Ask preference: Spotify or YouTube?
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?(?:play\s+a\s+song|play\s+some\s+song|play\s+some\s+music|paata\s+paadu|patalu\s+veyyi|gana\s+chalao|koyi\s+gana\s+chalao)[?.!]?$/i.test(
        lower
      )
    ) {
      setPendingMusicQuery('popular music');
      return {
        matched: true,
        intent: 'media',
        response: isTelugu
          ? 'మీరు ఏ యాప్‌లో వినాలనుకుంటున్నారు: Spotify లేదా YouTube?'
          : 'Which app do you prefer: Spotify or YouTube?',
        executionMs: Date.now() - start,
      };
    }

    const genericSongPlayMatch = clean.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?play\s+(.+?)\s*(?:song)?\s*[?.!]?$/i
    );
    if (
      genericSongPlayMatch &&
      !lower.includes('spotify') &&
      !lower.includes('youtube') &&
      !/^(?:the\s+)?(?:music|time|date|weather|video|game|audio|recording|screen)$/i.test(genericSongPlayMatch[1].trim())
    ) {
      const candidateSong = genericSongPlayMatch[1].trim();
      setPendingMusicQuery(candidateSong);
      return {
        matched: true,
        intent: 'media',
        response: isTelugu
          ? `మీరు "${candidateSong}" పాటను ఏ యాప్‌లో వినాలనుకుంటున్నారు: Spotify లేదా YouTube?`
          : `Which app do you prefer for "${candidateSong}": Spotify or YouTube?`,
        executionMs: Date.now() - start,
      };
    }

    // Play / Pause controls
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:pause\s+music|pause\s+song|pause|music\s+pause\s+chey|music\s+aapu|patalu\s+aapu|song\s+aapu|gana\s+roko)[?.!]?$/i.test(
        lower
      )
    ) {
      await sendMediaKeyEvent(VK_MEDIA_PLAY_PAUSE);
      let response = 'Music paused.';
      if (isTelugu) response = 'Music pause chesa.';
      else if (isHindi) response = 'Music pause kar diya.';

      return {
        matched: true,
        intent: 'media',
        response,
        executionMs: Date.now() - start,
      };
    }

    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:resume\s+music|resume\s+song|unpause\s+music|unpause|resume)[?.!]?$/i.test(
        lower
      )
    ) {
      await sendMediaKeyEvent(VK_MEDIA_PLAY_PAUSE);
      let response = 'Playback resumed.';
      if (isTelugu) response = 'Music play chestunna.';
      else if (isHindi) response = 'Music chala diya.';

      return {
        matched: true,
        intent: 'media',
        response,
        executionMs: Date.now() - start,
      };
    }

    // Move to next / skip track
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:next\s+song|next\s+track|skip\s+song|skip|move\s+to\s+next(?:\s+song)?|next\s+song\s+play\s+chey|next\s+track\s+veyyi|agla\s+gana)[?.!]?$/i.test(
        lower
      )
    ) {
      await sendMediaKeyEvent(VK_MEDIA_NEXT_TRACK);
      let response = 'Moved to next track.';
      if (isTelugu) response = 'Next song play chestunna.';
      else if (isHindi) response = 'Agla gana chala diya.';

      return {
        matched: true,
        intent: 'media',
        response,
        executionMs: Date.now() - start,
      };
    }

    // Rewind / Previous track
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:previous\s+song|prev\s+song|last\s+song|rewind|rewind\s+(?:the\s+)?song|restart\s+song|venaka\s+paata|pichhla\s+gana)[?.!]?$/i.test(
        lower
      )
    ) {
      await sendMediaKeyEvent(VK_MEDIA_PREV_TRACK);
      let response = 'Rewound song / playing previous track.';
      if (isTelugu) response = 'Song rewind chesa.';
      else if (isHindi) response = 'Gana rewind kar diya.';

      return {
        matched: true,
        intent: 'media',
        response,
        executionMs: Date.now() - start,
      };
    }

    // 5. Real Windows Master Volume Controls
    // Exact volume percent e.g. "set volume to 50 percent", "reduce volume to 20 percent", "set volume to maximum"
    const exactVolumeMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?(?:set|change|reduce|bring|turn)\s+(?:the\s+)?volume\s+(?:to\s+)?(\w+)(?:\s*percent|\s*%)?[?.!]?$/i
    ) || lower.match(/^(?:hey\s+)?(?:friday[\s,]+)?(?:set\s+volume\s+to\s+maximum|max\s+volume|maximum\s+volume)[?.!]?$/i);

    if (exactVolumeMatch) {
      const isMax = /max/i.test(exactVolumeMatch[0]);
      const targetPercent = isMax ? 100 : parseNumberWord(exactVolumeMatch[1]);
      if (targetPercent !== null) {
        const res = await windowsVolumeService.setVolume(targetPercent);
        let response = res.actionTaken || `Volume set to ${res.volume}%.`;
        if (isTelugu) response = `Volume ${res.volume}% ki set chesa.`;
        else if (isHindi) response = `Volume ${res.volume}% par set kar diya.`;
        return {
          matched: true,
          intent: 'volume',
          response,
          toolCalls: [{ toolName: 'control_system_volume', args: { action: 'set', level: targetPercent }, result: res, status: res.success ? 'completed' : 'failed' }],
          executionMs: Date.now() - start,
        };
      }
    }

    // Adjust volume by delta e.g. "decrease volume by 10", "increase volume by 15", "reduce volume by 20"
    const deltaVolumeMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?(increase|decrease|reduce|raise|lower)\s+(?:the\s+)?volume\s+by\s+(\w+)(?:\s*percent|\s*%)?[?.!]?$/i
    );
    if (deltaVolumeMatch) {
      const isInc = deltaVolumeMatch[1] === 'increase' || deltaVolumeMatch[1] === 'raise';
      const deltaVal = parseNumberWord(deltaVolumeMatch[2]);
      if (deltaVal !== null) {
        const delta = isInc ? deltaVal : -deltaVal;
        const res = await windowsVolumeService.adjustVolume(delta);
        return {
          matched: true,
          intent: 'volume',
          response: res.actionTaken || `Volume is now ${res.volume}%.`,
          toolCalls: [{ toolName: 'control_system_volume', args: { action: isInc ? 'increase' : 'decrease', delta: Math.abs(delta) }, result: res, status: res.success ? 'completed' : 'failed' }],
          executionMs: Date.now() - start,
        };
      }
    }

    // Generic volume up
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:volume\s+up|increase\s+(?:the\s+)?volume|sound\s+penchu|sound\s+ekkuva\s+chey|volume\s+penchu|awaz\s+badhao)[?.!]?$/i.test(
        lower
      )
    ) {
      const res = await windowsVolumeService.adjustVolume(10);
      let response = res.success ? `Volume increased to ${res.volume}%.` : 'Volume increased.';
      if (isTelugu) response = `Volume pencha (${res.volume}%).`;
      else if (isHindi) response = `Awaz badha di (${res.volume}%).`;

      return {
        matched: true,
        intent: 'volume',
        response,
        toolCalls: [{ toolName: 'control_system_volume', args: { action: 'increase', delta: 10 }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // Generic volume down
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:volume\s+down|decrease\s+(?:the\s+)?volume|reduce\s+(?:the\s+)?volume|sound\s+thagginchu|sound\s+takkuva\s+chey|volume\s+thagginchu|awaz\s+kam\s+karo)[?.!]?$/i.test(
        lower
      )
    ) {
      const res = await windowsVolumeService.adjustVolume(-10);
      let response = res.success ? `Volume decreased to ${res.volume}%.` : 'Volume decreased.';
      if (isTelugu) response = `Volume thaggincha (${res.volume}%).`;
      else if (isHindi) response = `Awaz kam kar di (${res.volume}%).`;

      return {
        matched: true,
        intent: 'volume',
        response,
        toolCalls: [{ toolName: 'control_system_volume', args: { action: 'decrease', delta: 10 }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // Mute
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:mute\s+my\s+laptop|mute\s+pc|mute\s+sound|mute|mute\s+chey|sound\s+bandh\s+chey|awaz\s+band\s+karo|chup\s+chey)[?.!]?$/i.test(
        lower
      )
    ) {
      const res = await windowsVolumeService.setMute(true);
      let response = 'Audio muted.';
      if (isTelugu) response = 'Mute chesa.';
      else if (isHindi) response = 'Mute kar diya.';

      return {
        matched: true,
        intent: 'volume',
        response,
        toolCalls: [{ toolName: 'control_system_volume', args: { action: 'mute' }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // Unmute
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:unmute\s+my\s+laptop|unmute\s+pc|unmute\s+sound|unmute|unmute\s+chey)[?.!]?$/i.test(
        lower
      )
    ) {
      const res = await windowsVolumeService.setMute(false);
      let response = `Audio unmuted. Volume is at ${res.volume}%.`;
      if (isTelugu) response = `Unmute chesa, volume ${res.volume}%.`;
      else if (isHindi) response = `Unmute kar diya, volume ${res.volume}% hai.`;

      return {
        matched: true,
        intent: 'volume',
        response,
        toolCalls: [{ toolName: 'control_system_volume', args: { action: 'unmute' }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // 5b. Windows Display Brightness Controls
    // Exact brightness e.g. "set brightness to 70 percent", "reduce brightness to 30 percent", "set brightness to maximum"
    const exactBrightnessMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?(?:set|change|reduce|bring)\s+(?:screen\s+|display\s+)?brightness\s+(?:to\s+)?(\w+)(?:\s*percent|\s*%)?[?.!]?$/i
    ) || lower.match(/^(?:hey\s+)?(?:friday[\s,]+)?(?:set\s+brightness\s+to\s+maximum|max\s+brightness|maximum\s+brightness)[?.!]?$/i);

    if (exactBrightnessMatch) {
      const isMax = /max/i.test(exactBrightnessMatch[0]);
      const targetPercent = isMax ? 100 : parseNumberWord(exactBrightnessMatch[1]);
      if (targetPercent !== null) {
        const res = await windowsBrightnessService.setBrightness(targetPercent);
        const response = res.supported && res.success
          ? (res.actionTaken || `Brightness set to ${res.brightness}%.`)
          : (res.error || 'Display brightness could not be adjusted.');
        return {
          matched: true,
          intent: 'brightness',
          response,
          toolCalls: [{ toolName: 'control_system_brightness', args: { action: 'set', level: targetPercent }, result: res, status: res.success ? 'completed' : 'failed' }],
          executionMs: Date.now() - start,
        };
      }
    }

    // Increase brightness
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:increase\s+(?:screen\s+|display\s+)?brightness|brightness\s+up|make\s+(?:my\s+)?screen\s+brighter|brighter\s+screen)[?.!]?$/i.test(
        lower
      )
    ) {
      const res = await windowsBrightnessService.adjustBrightness(10);
      const response = res.supported && res.success
        ? (res.actionTaken || `Screen brightness increased to ${res.brightness}%.`)
        : (res.error || 'Screen brightness could not be increased.');
      return {
        matched: true,
        intent: 'brightness',
        response,
        toolCalls: [{ toolName: 'control_system_brightness', args: { action: 'increase', delta: 10 }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // Decrease brightness / dimmer
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:decrease\s+(?:screen\s+|display\s+)?brightness|reduce\s+(?:screen\s+|display\s+)?brightness|brightness\s+down|make\s+(?:my\s+)?screen\s+dimmer|dim\s+screen|dimmer\s+screen)[?.!]?$/i.test(
        lower
      )
    ) {
      const res = await windowsBrightnessService.adjustBrightness(-10);
      const response = res.supported && res.success
        ? (res.actionTaken || `Screen brightness reduced to ${res.brightness}%.`)
        : (res.error || 'Screen brightness could not be dimmed.');
      return {
        matched: true,
        intent: 'brightness',
        response,
        toolCalls: [{ toolName: 'control_system_brightness', args: { action: 'decrease', delta: 10 }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // 5c. Real Windows Mouse & Cursor Controls
    // Move mouse to screen corner or center e.g. "move the mouse to the top-right corner"
    const mouseCornerMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?move\s+(?:the\s+)?(?:mouse|cursor)\s+to\s+(?:the\s+)?(top-left|top-right|bottom-left|bottom-right|top\s+left|top\s+right|bottom\s+left|bottom\s+right|center)(?:\s+corner|\s+of\s+(?:the\s+)?screen)?[?.!]?$/i
    );
    if (mouseCornerMatch) {
      const rawPos = mouseCornerMatch[1].replace(/\s+/g, '-').toLowerCase() as any;
      const res = await desktopControlService.executeMouseAction({ action: 'move', position: rawPos });
      return {
        matched: true,
        intent: 'mouse',
        response: res.details || `Moved mouse to ${rawPos}.`,
        toolCalls: [{ toolName: 'move_mouse_cursor', args: { position: rawPos }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // Move cursor to named control e.g. "move the cursor to the search box", "move cursor to close button"
    const moveCursorTargetMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?move\s+(?:the\s+)?(?:mouse|cursor)\s+to\s+(?:the\s+)?([a-zA-Z0-9_\-\s]+?)[?.!]?$/i
    );
    if (
      moveCursorTargetMatch &&
      !/^(?:top|bottom|center|corner)/i.test(moveCursorTargetMatch[1].trim()) &&
      !/\b(app|application|chrome|spotify|notepad|window)\b/i.test(moveCursorTargetMatch[1].trim())
    ) {
      const targetName = moveCursorTargetMatch[1].trim();
      const res = await desktopControlService.executeMouseAction({ action: 'move', target: targetName });
      return {
        matched: true,
        intent: 'mouse',
        response: res.details || res.error || `Attempted to move cursor to ${targetName}.`,
        toolCalls: [{ toolName: 'move_mouse_cursor', args: { target: targetName }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // Double-click
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:double-click\s+(?:this\s+)?icon|double-click\s+here|double\s+click\s+here|double-click|double\s+click)[?.!]?$/i.test(
        lower
      )
    ) {
      const res = await desktopControlService.executeMouseAction({ action: 'double_click' });
      return {
        matched: true,
        intent: 'mouse',
        response: res.details || 'Double-clicked.',
        toolCalls: [{ toolName: 'click_desktop_element', args: { clickType: 'double' }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // Right-click
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:right-click\s+here|right\s+click\s+here|right-click|right\s+click)[?.!]?$/i.test(
        lower
      )
    ) {
      const res = await desktopControlService.executeMouseAction({ action: 'right_click' });
      return {
        matched: true,
        intent: 'mouse',
        response: res.details || 'Right-clicked.',
        toolCalls: [{ toolName: 'click_desktop_element', args: { clickType: 'right' }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // Click named button or link e.g. "click the start button", "click the button labelled Submit", "click the link named Settings"
    const clickNamedMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?click\s+(?:the\s+)?(?:button\s+labelled\s+|button\s+named\s+|link\s+named\s+|button\s+|link\s+)?([a-zA-Z0-9_\-\s]+?)[?.!]?$/i
    );
    if (
      clickNamedMatch &&
      !/^(?:here|left|right|double)$/i.test(clickNamedMatch[1].trim())
    ) {
      const targetName = clickNamedMatch[1].trim();
      const res = await desktopControlService.executeMouseAction({ action: 'click', target: targetName });
      return {
        matched: true,
        intent: 'mouse',
        response: res.details || res.error || `Clicked ${targetName}.`,
        toolCalls: [{ toolName: 'click_desktop_element', args: { target: targetName, clickType: 'single' }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // Scrolling
    if (/^(?:hey\s+)?(?:friday[\s,]+)?(?:scroll\s+down|screen\s+scroll\s+down)[?.!]?$/i.test(lower)) {
      const res = await desktopControlService.executeMouseAction({ action: 'scroll', direction: 'down', amount: -3 });
      return {
        matched: true,
        intent: 'mouse',
        response: 'Scrolled down.',
        toolCalls: [{ toolName: 'scroll_desktop', args: { direction: 'down' }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    if (/^(?:hey\s+)?(?:friday[\s,]+)?(?:scroll\s+up|screen\s+scroll\s+up)[?.!]?$/i.test(lower)) {
      const res = await desktopControlService.executeMouseAction({ action: 'scroll', direction: 'up', amount: 3 });
      return {
        matched: true,
        intent: 'mouse',
        response: 'Scrolled up.',
        toolCalls: [{ toolName: 'scroll_desktop', args: { direction: 'up' }, result: res, status: res.success ? 'completed' : 'failed' }],
        executionMs: Date.now() - start,
      };
    }

    // --- QUICKTOOLS PHASE 1: QUICK ACTIONS, CLIPBOARD, SNIPPETS ---
    // 5.1 Desktop & Folder Clean / Organization
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:clean\s+(?:up\s+)?my\s+desktop|clean\s+desktop|organise\s+my\s+desktop|organize\s+my\s+desktop|organize\s+desktop|organise\s+desktop|desktop\s+clean\s+chey)[?.!]?$/i.test(
        lower
      )
    ) {
      const target = quickActionsService.getDesktopPath();
      const preview = quickActionsService.generatePreview(target);
      const res = quickActionsService.executeOrganize(preview);
      const response =
        res.successCount > 0
          ? `Cleaned your Desktop! Moved ${res.successCount} files into categorized folders. You can undo anytime.`
          : 'Your Desktop is already tidy, nothing to move.';
      return {
        matched: true,
        intent: 'quicktools',
        response,
        toolCalls: [
          {
            toolName: 'organize_desktop_folder',
            args: { target: 'desktop', action: 'execute' },
            result: res,
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:organise\s+(?:my\s+)?downloads|organize\s+(?:my\s+)?downloads|clean\s+(?:my\s+)?downloads)[?.!]?$/i.test(
        lower
      )
    ) {
      const target = quickActionsService.getDownloadsPath();
      const preview = quickActionsService.generatePreview(target);
      const res = quickActionsService.executeOrganize(preview);
      const response =
        res.successCount > 0
          ? `Organized your Downloads! Moved ${res.successCount} files into categorized subfolders.`
          : 'Your Downloads folder is already organized.';
      return {
        matched: true,
        intent: 'quicktools',
        response,
        toolCalls: [
          {
            toolName: 'organize_desktop_folder',
            args: { target: 'downloads', action: 'execute' },
            result: res,
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:move\s+(?:all\s+)?pdfs\s+into\s+documents|organise\s+(?:my\s+)?pdfs|organize\s+(?:my\s+)?pdfs)[?.!]?$/i.test(
        lower
      )
    ) {
      const target = quickActionsService.getDesktopPath();
      const preview = quickActionsService.generatePreview(target);
      preview.proposedMoves = preview.proposedMoves.filter((m) => m.category === 'Documents');
      const res = quickActionsService.executeOrganize(preview);
      const response =
        res.successCount > 0
          ? `Moved ${res.successCount} PDF and document file(s) into your Documents folder.`
          : 'No stray PDF files found on your desktop.';
      return {
        matched: true,
        intent: 'quicktools',
        response,
        toolCalls: [
          {
            toolName: 'organize_desktop_folder',
            args: { target: 'desktop', action: 'execute', category_filter: 'Documents' },
            result: res,
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:organise\s+(?:my\s+)?screenshots|organize\s+(?:my\s+)?screenshots|clean\s+(?:my\s+)?screenshots)[?.!]?$/i.test(
        lower
      )
    ) {
      const target = quickActionsService.getDesktopPath();
      const preview = quickActionsService.generatePreview(target);
      preview.proposedMoves = preview.proposedMoves.filter((m) => m.category === 'Screenshots');
      const res = quickActionsService.executeOrganize(preview);
      const response =
        res.successCount > 0
          ? `Organized ${res.successCount} screenshot(s) into the Screenshots folder.`
          : 'No screenshots found on your desktop.';
      return {
        matched: true,
        intent: 'quicktools',
        response,
        toolCalls: [
          {
            toolName: 'organize_desktop_folder',
            args: { target: 'desktop', action: 'execute', category_filter: 'Screenshots' },
            result: res,
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:undo\s+(?:desktop\s+)?organi[sz]ation|undo\s+(?:last\s+)?clean|undo\s+organi[sz]e)[?.!]?$/i.test(
        lower
      )
    ) {
      const undoRes = quickActionsService.undoLastOrganize();
      return {
        matched: true,
        intent: 'quicktools',
        response: undoRes.message,
        toolCalls: [
          {
            toolName: 'organize_desktop_folder',
            args: { action: 'undo' },
            result: undoRes,
            status: undoRes.success ? 'completed' : 'failed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:find\s+duplicate\s+files|find\s+duplicates|check\s+duplicate\s+files|check\s+duplicates)[?.!]?$/i.test(
        lower
      )
    ) {
      const dup = quickActionsService.findDuplicates();
      const wastedMb = (dup.wastedBytes / (1024 * 1024)).toFixed(1);
      const response =
        dup.duplicateGroups.length > 0
          ? `Found ${dup.duplicateGroups.length} set(s) of duplicate files wasting ${wastedMb} MB in Downloads.`
          : 'No duplicate files found in your Downloads.';
      return {
        matched: true,
        intent: 'quicktools',
        response,
        toolCalls: [
          {
            toolName: 'find_duplicate_files',
            args: { target: 'downloads' },
            result: dup,
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // 5.2 Clipboard History
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:show\s+(?:my\s+)?clipboard(?:\s+history)?|view\s+clipboard|what\s+did\s+i\s+copy(?:\s+earlier)?)[?.!]?$/i.test(
        lower
      )
    ) {
      const items = clipboardHistoryService.getItems();
      const topItems = items.slice(0, 3).map((i) => `"${i.text.slice(0, 30)}..."`).join(', ');
      const response =
        items.length > 0
          ? `You have ${items.length} items in your clipboard history. Recent: ${topItems}.`
          : 'Your clipboard history is currently empty.';
      return {
        matched: true,
        intent: 'quicktools',
        response,
        toolCalls: [
          {
            toolName: 'manage_clipboard_history',
            args: { action: 'list' },
            result: { count: items.length },
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:clear\s+(?:my\s+)?clipboard(?:\s+history)?)[?.!]?$/i.test(
        lower
      )
    ) {
      clipboardHistoryService.clearHistory();
      return {
        matched: true,
        intent: 'quicktools',
        response: 'Cleared your unpinned clipboard history.',
        toolCalls: [
          {
            toolName: 'manage_clipboard_history',
            args: { action: 'clear' },
            result: { success: true },
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // 5.3 Smart Snippets
    const insertSnippetMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:insert|expand)\s+snippet\s+(?:named\s+)?(?:;)?([a-zA-Z0-9_\-]+)[?.!]?$/i
    );
    if (insertSnippetMatch) {
      const shortcut = insertSnippetMatch[1];
      const expanded = snippetsService.expandSnippet(shortcut);
      if (expanded.success) {
        clipboardHistoryService.copyToClipboard(expanded.expandedText);
        return {
          matched: true,
          intent: 'quicktools',
          response: `Expanded snippet "${shortcut}" and copied it to your clipboard.`,
          toolCalls: [
            {
              toolName: 'manage_text_snippets',
              args: { action: 'expand', shortcut },
              result: expanded,
              status: 'completed',
            },
          ],
          executionMs: Date.now() - start,
        };
      } else {
        return {
          matched: true,
          intent: 'quicktools',
          response: `Could not find a snippet named "${shortcut}".`,
          toolCalls: [
            {
              toolName: 'manage_text_snippets',
              args: { action: 'expand', shortcut },
              result: { success: false },
              status: 'failed',
            },
          ],
          executionMs: Date.now() - start,
        };
      }
    }

    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:show\s+(?:my\s+)?snippets|list\s+(?:my\s+)?snippets)[?.!]?$/i.test(
        lower
      )
    ) {
      const list = snippetsService.getSnippets();
      const shortcuts = list.map((s) => s.shortcut).join(', ');
      return {
        matched: true,
        intent: 'quicktools',
        response: `You have ${list.length} snippet(s): ${shortcuts}.`,
        toolCalls: [
          {
            toolName: 'manage_text_snippets',
            args: { action: 'list' },
            result: { count: list.length },
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // --- QUICKTOOLS PHASE 2: WINDOW MANAGER, QUICK NOTES, BATCH RENAMER ---
    // 5.4 Window Snapping & Arrangement
    // Side by side: "put chrome on the left and vs code on the right" or "arrange chrome and notepad side by side"
    const sideBySideMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:put|snap|place|arrange)\s+(.+?)\s+on\s+the\s+left\s+and\s+(.+?)\s+on\s+the\s+right[?.!]?$/i
    ) || lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:arrange|put)\s+(.+?)\s+and\s+(.+?)\s+side\s+by\s+side[?.!]?$/i
    );

    if (sideBySideMatch) {
      const app1 = sideBySideMatch[1].trim();
      const app2 = sideBySideMatch[2].trim();
      const layoutRes = await windowManagerService.arrangeWindow({
        action: 'split_left',
        windowTarget: app1,
        secondTarget: app2,
      });

      return {
        matched: true,
        intent: 'quicktools',
        response: layoutRes.message,
        toolCalls: [
          {
            toolName: 'arrange_windows',
            args: { action: 'side_by_side', windowTarget: app1, secondTarget: app2 },
            result: layoutRes,
            status: layoutRes.success ? 'completed' : 'failed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // Single snap: "snap to left", "put chrome on the left"
    const snapLeftMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:snap\s+(?:window\s+)?(?:to\s+(?:the\s+)?)?left|put\s+(.+?)\s+on\s+(?:the\s+)?left)[?.!]?$/i
    );
    if (snapLeftMatch) {
      const target = snapLeftMatch[1]?.trim();
      const layoutRes = await windowManagerService.arrangeWindow({
        action: 'split_left',
        windowTarget: target,
      });

      return {
        matched: true,
        intent: 'quicktools',
        response: layoutRes.message,
        toolCalls: [
          {
            toolName: 'arrange_windows',
            args: { action: 'split_left', windowTarget: target },
            result: layoutRes,
            status: layoutRes.success ? 'completed' : 'failed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // Single snap: "snap to right", "put chrome on the right"
    const snapRightMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:snap\s+(?:window\s+)?(?:to\s+(?:the\s+)?)?right|put\s+(.+?)\s+on\s+(?:the\s+)?right)[?.!]?$/i
    );
    if (snapRightMatch) {
      const target = snapRightMatch[1]?.trim();
      const layoutRes = await windowManagerService.arrangeWindow({
        action: 'split_right',
        windowTarget: target,
      });

      return {
        matched: true,
        intent: 'quicktools',
        response: layoutRes.message,
        toolCalls: [
          {
            toolName: 'arrange_windows',
            args: { action: 'split_right', windowTarget: target },
            result: layoutRes,
            status: layoutRes.success ? 'completed' : 'failed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // Center window
    if (/^(?:hey\s+)?(?:friday[\s,]+)?(?:center\s+(?:the\s+)?window|center\s+screen)[?.!]?$/i.test(lower)) {
      const layoutRes = await windowManagerService.arrangeWindow({ action: 'center' });
      return {
        matched: true,
        intent: 'quicktools',
        response: layoutRes.message,
        toolCalls: [
          {
            toolName: 'arrange_windows',
            args: { action: 'center' },
            result: layoutRes,
            status: layoutRes.success ? 'completed' : 'failed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // 5.5 Quick Notes
    // Save note: "remember this note: ...", "take a note: ...", "save note: ..."
    const noteSaveMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:remember\s+this\s+note|take\s+a\s+note|save\s+note|save\s+this\s+note)[:\s]+(.+)$/i
    );
    if (noteSaveMatch) {
      const noteContent = noteSaveMatch[1].trim();
      const saved = quickNotesService.saveNote({
        title: noteContent.length > 30 ? noteContent.slice(0, 30) + '...' : noteContent,
        content: noteContent,
        category: 'General',
        tags: [],
        isPinned: false,
      });

      return {
        matched: true,
        intent: 'quicktools',
        response: `Saved note: "${saved.title}".`,
        toolCalls: [
          {
            toolName: 'manage_quick_notes',
            args: { action: 'create', content: noteContent },
            result: saved,
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // Save idea: "save this as an idea: ..." or "save this idea: ..."
    const ideaSaveMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:save\s+this\s+as\s+an?\s+idea|save\s+this\s+idea)[:\s]+(.+)$/i
    );
    if (ideaSaveMatch) {
      const ideaContent = ideaSaveMatch[1].trim();
      const saved = quickNotesService.saveNote({
        title: ideaContent.length > 30 ? ideaContent.slice(0, 30) + '...' : ideaContent,
        content: ideaContent,
        category: 'Ideas',
        tags: ['idea'],
        isPinned: false,
      });

      return {
        matched: true,
        intent: 'quicktools',
        response: `Captured idea: "${saved.title}".`,
        toolCalls: [
          {
            toolName: 'manage_quick_notes',
            args: { action: 'create', content: ideaContent, category: 'Ideas' },
            result: saved,
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // Show notes: "show my notes", "list notes"
    if (/^(?:hey\s+)?(?:friday[\s,]+)?(?:show\s+(?:my\s+)?notes|list\s+(?:my\s+)?notes)[?.!]?$/i.test(lower)) {
      const notes = quickNotesService.getNotes();
      const topTitles = notes.slice(0, 3).map((n) => `"${n.title}"`).join(', ');
      return {
        matched: true,
        intent: 'quicktools',
        response: notes.length > 0
          ? `You have ${notes.length} note(s). Recent: ${topTitles}.`
          : 'You do not have any notes saved yet.',
        toolCalls: [
          {
            toolName: 'manage_quick_notes',
            args: { action: 'list' },
            result: { count: notes.length },
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // --- QUICKTOOLS PHASE 3: WORKSPACES & FILE INTELLIGENCE ---
    // Launch workspaces: "start coding mode", "launch study workspace", "open focus mode"
    const wsLaunchMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:start|launch|open)\s+(coding\s+mode|study\s+workspace|focus\s+mode)[?.!]?$/i
    );
    if (wsLaunchMatch) {
      const wsName = wsLaunchMatch[1].trim();
      const launchRes = await workspacesService.launchWorkspace(wsName);

      return {
        matched: true,
        intent: 'quicktools',
        response: launchRes.success
          ? `Launched ${wsName} with ${launchRes.launchedCount} application(s).`
          : `Could not launch workspace "${wsName}".`,
        toolCalls: [
          {
            toolName: 'manage_workspaces',
            args: { action: 'launch', idOrName: wsName },
            result: launchRes,
            status: launchRes.success ? 'completed' : 'failed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // List workspaces
    if (/^(?:hey\s+)?(?:friday[\s,]+)?(?:show\s+(?:my\s+)?workspaces|list\s+workspaces)[?.!]?$/i.test(lower)) {
      const list = workspacesService.getWorkspaces();
      const names = list.map((w) => w.name).join(', ');
      return {
        matched: true,
        intent: 'quicktools',
        response: `Available workspaces: ${names}.`,
        toolCalls: [
          {
            toolName: 'manage_workspaces',
            args: { action: 'list' },
            result: { count: list.length },
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // Find files: "find my latest pdf", "find pdf files"
    const findFilesMatch = lower.match(
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:find|search\s+for)\s+(?:my\s+)?(?:latest\s+)?([a-z0-9_-]+)\s+files?[?.!]?$/i
    );
    if (findFilesMatch) {
      const queryOrExt = findFilesMatch[1].trim();
      const isExt = ['pdf', 'png', 'jpg', 'doc', 'docx', 'txt', 'csv', 'zip'].includes(queryOrExt.toLowerCase());
      const searchRes = fileFinderService.searchFiles({
        query: isExt ? '' : queryOrExt,
        extension: isExt ? queryOrExt : undefined,
        modifiedWithinDays: 30,
      });

      const topNames = searchRes.results.slice(0, 3).map((r) => r.fileName).join(', ');
      return {
        matched: true,
        intent: 'quicktools',
        response: searchRes.totalMatches > 0
          ? `Found ${searchRes.totalMatches} file(s) matching "${queryOrExt}": ${topNames}.`
          : `No recent files found matching "${queryOrExt}".`,
        toolCalls: [
          {
            toolName: 'search_files_nlp',
            args: { query: queryOrExt },
            result: { totalMatches: searchRes.totalMatches },
            status: 'completed',
          },
        ],
        executionMs: Date.now() - start,
      };
    }

    // 6. Window controls (Minimize / Maximize)
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:minimize\s+window|minimize|screen\s+thagginchu|minimize\s+chey)[?.!]?$/i.test(
        lower
      )
    ) {
      const psMinimize = `
Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public class WinMin {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  }
"@ -ErrorAction SilentlyContinue
[WinMin]::ShowWindowAsync([WinMin]::GetForegroundWindow(), 6)
"OK"
`;
      await runFastPowerShell(psMinimize);
      let response = 'Window minimized.';
      if (isTelugu) response = 'Window minimize chesa.';
      else if (isHindi) response = 'Window minimize kar diya.';

      return {
        matched: true,
        intent: 'window',
        response,
        executionMs: Date.now() - start,
      };
    }

    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:maximize\s+window|maximize|full\s+screen\s+chey|maximize\s+chey)[?.!]?$/i.test(
        lower
      )
    ) {
      const psMaximize = `
Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public class WinMax {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  }
"@ -ErrorAction SilentlyContinue
[WinMax]::ShowWindowAsync([WinMax]::GetForegroundWindow(), 3)
"OK"
`;
      await runFastPowerShell(psMaximize);
      let response = 'Window maximized.';
      if (isTelugu) response = 'Window maximize chesa.';
      else if (isHindi) response = 'Window maximize kar diya.';

      return {
        matched: true,
        intent: 'window',
        response,
        executionMs: Date.now() - start,
      };
    }

    // 7. App Launch (Multilingual: English, Telugu, Hinglish)
    const launchAppQuery = extractMultilingualLaunchApp(clean);
    if (launchAppQuery) {
      const appName = displayNameForAppQuery(launchAppQuery);
      const launchResult = await toolRegistry.executeTool('launch_allowed_app', { appId: launchAppQuery });

      if (launchResult?.success) {
        let response = `Opening ${appName}.`;
        if (isTelugu) response = `${appName} open chestunna.`;
        else if (isHindi) response = `${appName} open kar raha hoon.`;

        return {
          matched: true,
          intent: 'launch_app',
          response,
          toolCalls: [
            {
              toolName: 'launch_allowed_app',
              args: { appId: launchAppQuery },
              result: launchResult,
              status: 'completed',
            },
          ],
          executionMs: Date.now() - start,
        };
      } else {
        return {
          matched: true,
          intent: 'launch_app',
          response: launchResult?.error || `I couldn't find ${appName} on your computer.`,
          toolCalls: [
            {
              toolName: 'launch_allowed_app',
              args: { appId: launchAppQuery },
              result: launchResult,
              status: 'failed',
            },
          ],
          executionMs: Date.now() - start,
        };
      }
    }

    // 8. App Close (Multilingual: English, Telugu, Hinglish)
    const closeAppQuery = extractMultilingualCloseApp(clean);
    if (closeAppQuery) {
      const closeResult = await desktopControlService.closeWindow(closeAppQuery);
      if (closeResult.success) {
        let response = `Closed ${closeAppQuery}.`;
        if (isTelugu) response = `${closeAppQuery} close chesa.`;
        else if (isHindi) response = `${closeAppQuery} band kar diya.`;

        return {
          matched: true,
          intent: 'close_app',
          response,
          executionMs: Date.now() - start,
        };
      } else {
        return {
          matched: true,
          intent: 'close_app',
          response: `Could not find an open window for ${closeAppQuery}.`,
          executionMs: Date.now() - start,
        };
      }
    }

    return null;
  }
}

export const fastLocalIntentRouter = new FastLocalIntentRouter();
