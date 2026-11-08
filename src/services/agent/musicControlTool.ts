import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getChromeExecutablePath } from './chromeBrowserTool';
import { desktopControlService } from '../desktop/desktopControlService';

let pendingMusicQuery = '';

export function setPendingMusicQuery(query: string): void {
  pendingMusicQuery = (query || '').trim();
}

export function getPendingMusicQuery(): string {
  return pendingMusicQuery;
}

export function clearPendingMusicQuery(): void {
  pendingMusicQuery = '';
}

/**
 * Checks whether Spotify is installed on this Windows computer.
 */
export function getSpotifyExecutablePath(): string | null {
  const appData = process.env.APPDATA || '';
  const localAppData = process.env.LOCALAPPDATA || '';

  const candidates = [
    path.join(localAppData, 'Microsoft', 'WindowsApps', 'Spotify.exe'),
    path.join(appData, 'Spotify', 'Spotify.exe'),
    path.join(localAppData, 'Spotify', 'Spotify.exe'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'Spotify.exe';
}

/**
 * Checks whether a process by name (e.g. "spotify") is currently running.
 */
export function isProcessRunning(processName: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-Process -Name "${processName}" -ErrorAction SilentlyContinue | Select-Object -First 1`,
      ],
      { timeout: 3000 },
      (err, stdout) => {
        if (err || !stdout || stdout.trim().length === 0) resolve(false);
        else resolve(true);
      }
    );
  });
}

/**
 * Dispatches a Windows multimedia keyboard event (VK_MEDIA_PLAY_PAUSE, NEXT, PREV).
 */
export function sendMediaKeyEvent(vkCode: number): Promise<boolean> {
  const psScript = `
$code = @"
  using System;
  using System.Runtime.InteropServices;
  public class WinMediaKey {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    public const int KEYEVENTF_KEYUP = 0x0002;
  }
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
[WinMediaKey]::keybd_event(${vkCode}, 0, 0, 0)
Start-Sleep -Milliseconds 50
[WinMediaKey]::keybd_event(${vkCode}, 0, [WinMediaKey]::KEYEVENTF_KEYUP, 0)
"OK"
`;
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { timeout: 3500 },
      (err, stdout) => {
        if (err || !stdout.includes('OK')) resolve(false);
        else resolve(true);
      }
    );
  });
}

export const musicControlToolDefinitions = [
  {
    name: 'control_music',
    description:
      'Controls music playback on Windows (Spotify or YouTube). Actions: "play", "pause", "toggle_play_pause", "next_song", "previous_song", "rewind_song", "play_spotify", "open_spotify", "play_youtube", "play_youtube_music", "ask_music_platform". Use ask_music_platform when the user wants to play a song/music but did not specify Spotify or YouTube.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: [
            'play',
            'pause',
            'toggle_play_pause',
            'next_song',
            'previous_song',
            'rewind_song',
            'play_spotify',
            'open_spotify',
            'play_youtube',
            'play_youtube_music',
            'ask_music_platform',
          ],
          description: 'Music control action to perform.',
        },
        app: {
          type: 'STRING',
          enum: ['spotify', 'youtube', 'auto'],
          description:
            'Target music app: "spotify" or "youtube". If not mentioned by the user, specify "auto" or use action "ask_music_platform".',
        },
        query: {
          type: 'STRING',
          description:
            'Song name, artist, or playlist to search and play (e.g. "Believer", "Starboy", "lo-fi beats").',
        },
      },
      required: ['action'],
    },
  },
];

export async function executeMusicControlTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  const rawAction = String(args.action || 'play').toLowerCase().trim();
  const rawApp = String(args.app || '').toLowerCase().trim();
  const query = String(args.query || '').trim();

  // 1. If user asks to play a song but did not specify an app:
  if (
    rawAction === 'ask_music_platform' ||
    ((rawAction === 'play' || rawAction === 'play_song') &&
      (!rawApp || rawApp === 'auto') &&
      !query.toLowerCase().includes('spotify') &&
      !query.toLowerCase().includes('youtube'))
  ) {
    if (query) {
      setPendingMusicQuery(query);
    }
    return {
      success: true,
      action: 'ask_music_platform',
      needsPlatformChoice: true,
      query,
      message: 'Which app do you prefer: Spotify or YouTube?',
    };
  }

  // 2. YouTube & YouTube Music handling
  if (
    rawAction === 'play_youtube' ||
    rawAction === 'play_youtube_music' ||
    rawApp === 'youtube' ||
    rawApp === 'youtube music' ||
    rawApp === 'yt'
  ) {
    clearPendingMusicQuery();
    const chromePath = getChromeExecutablePath();
    const targetUrl = query
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      : 'https://music.youtube.com';

    if (chromePath) {
      spawn(chromePath, [targetUrl], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('cmd.exe', ['/c', 'start', '""', targetUrl], { detached: true, stdio: 'ignore' }).unref();
    }
    return {
      success: true,
      action: 'play_youtube',
      app: 'YouTube',
      query,
      message: query ? `Searching and playing "${query}" on YouTube.` : 'Opened YouTube Music.',
    };
  }

  // 3. Spotify handling
  if (
    rawAction === 'play_spotify' ||
    rawAction === 'open_spotify' ||
    rawApp === 'spotify' ||
    (rawAction === 'play' && query)
  ) {
    clearPendingMusicQuery();
    const cleanQuery = query || getPendingMusicQuery();
    const spotifyUri = cleanQuery ? `spotify:search:${encodeURIComponent(cleanQuery)}` : 'spotify:';
    const isRunning = await isProcessRunning('spotify');

    const spotifyExe = getSpotifyExecutablePath() || 'Spotify.exe';
    try {
      if (fs.existsSync(spotifyExe) || spotifyExe === 'Spotify.exe') {
        spawn(spotifyExe, [`--uri=${spotifyUri}`], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('cmd.exe', ['/c', 'start', '""', spotifyUri], { detached: true, stdio: 'ignore' }).unref();
      }
    } catch {
      spawn('cmd.exe', ['/c', 'start', '""', spotifyUri], { detached: true, stdio: 'ignore' }).unref();
    }

    if (isRunning) {
      await desktopControlService.switchWindow('spotify');
    }

    // Trigger media play key shortly after launching search
    setTimeout(async () => {
      await sendMediaKeyEvent(179); // VK_MEDIA_PLAY_PAUSE
    }, 1500);

    return {
      success: true,
      action: 'play_spotify',
      app: 'Spotify',
      query: cleanQuery,
      message: cleanQuery
        ? `Searching and playing "${cleanQuery}" on Spotify.`
        : 'Spotify is open and playing your music.',
    };
  }

  // 4. Playback controls via Windows Virtual Media Keys
  // 179 = VK_MEDIA_PLAY_PAUSE, 176 = VK_MEDIA_NEXT_TRACK, 177 = VK_MEDIA_PREV_TRACK
  switch (rawAction) {
    case 'play':
    case 'toggle_play_pause': {
      const ok = await sendMediaKeyEvent(179);
      return {
        success: ok,
        action: 'play',
        message: 'Resumed music playback.',
      };
    }
    case 'pause': {
      const ok = await sendMediaKeyEvent(179);
      return {
        success: ok,
        action: 'pause',
        message: 'Paused your music.',
      };
    }
    case 'next_song': {
      const ok = await sendMediaKeyEvent(176);
      return {
        success: ok,
        action: 'next_song',
        message: 'Skipped to the next track.',
      };
    }
    case 'previous_song':
    case 'rewind_song': {
      const ok = await sendMediaKeyEvent(177);
      return {
        success: ok,
        action: 'rewind_song',
        message: 'Rewound song / playing previous track.',
      };
    }
    default:
      return {
        success: false,
        error: `Unsupported music action "${rawAction}".`,
      };
  }
}
