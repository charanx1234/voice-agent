import { execFile } from 'child_process';
import { toolRegistry } from './toolRegistry';
import { desktopControlService } from '../desktop/desktopControlService';
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
  intent: 'launch_app' | 'close_app' | 'media' | 'volume' | 'time' | 'date' | 'battery' | 'window';
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

    // 5. Volume controls (Up / Down / Mute)
    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:volume\s+up|increase\s+volume|sound\s+penchu|sound\s+ekkuva\s+chey|volume\s+penchu|awaz\s+badhao)[?.!]?$/i.test(
        lower
      )
    ) {
      for (let i = 0; i < 3; i++) {
        await sendMediaKeyEvent(VK_VOLUME_UP);
      }
      let response = 'Volume increased.';
      if (isTelugu) response = 'Volume pencha.';
      else if (isHindi) response = 'Awaz badha di.';

      return {
        matched: true,
        intent: 'volume',
        response,
        executionMs: Date.now() - start,
      };
    }

    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:volume\s+down|decrease\s+volume|sound\s+thagginchu|sound\s+takkuva\s+chey|volume\s+thagginchu|awaz\s+kam\s+karo)[?.!]?$/i.test(
        lower
      )
    ) {
      for (let i = 0; i < 3; i++) {
        await sendMediaKeyEvent(VK_VOLUME_DOWN);
      }
      let response = 'Volume decreased.';
      if (isTelugu) response = 'Volume thaggincha.';
      else if (isHindi) response = 'Awaz kam kar di.';

      return {
        matched: true,
        intent: 'volume',
        response,
        executionMs: Date.now() - start,
      };
    }

    if (
      /^(?:hey\s+)?(?:friday[\s,]+)?(?:mute|mute\s+chey|unmute|sound\s+bandh\s+chey|awaz\s+band\s+karo|chup\s+chey)[?.!]?$/i.test(
        lower
      )
    ) {
      await sendMediaKeyEvent(VK_VOLUME_MUTE);
      let response = 'Audio muted.';
      if (isTelugu) response = 'Mute chesa.';
      else if (isHindi) response = 'Mute kar diya.';

      return {
        matched: true,
        intent: 'volume',
        response,
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
