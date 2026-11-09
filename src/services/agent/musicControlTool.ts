import { execFile, spawn } from 'child_process';
import fs from 'fs';
import https from 'https';
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

/**
 * Uses PowerShell to bring Spotify window to focus and press Enter/Space 
 * to auto-play the first search result.
 */
function spotifyAutoPlayFirstResult(): Promise<void> {
  return new Promise((resolve) => {
    const psScript = `
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinUser {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
  public const int KEYEVENTF_KEYUP = 0x0002;
}
"@ -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 2200
$spotify = Get-Process -Name "Spotify" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($spotify) {
  $hwnd = $spotify.MainWindowHandle
  if ($hwnd -ne 0) {
    [WinUser]::SetForegroundWindow($hwnd)
    Start-Sleep -Milliseconds 400
    # Press Tab to focus first song result, then Enter to play
    [Microsoft.VisualBasic.Interaction]::AppActivate($spotify.Id)
    Start-Sleep -Milliseconds 300
    [WinUser]::keybd_event(0x09, 0, 0, 0)
    Start-Sleep -Milliseconds 100
    [WinUser]::keybd_event(0x09, 0, [WinUser]::KEYEVENTF_KEYUP, 0)
    Start-Sleep -Milliseconds 200
    [WinUser]::keybd_event(0x0D, 0, 0, 0)
    Start-Sleep -Milliseconds 80
    [WinUser]::keybd_event(0x0D, 0, [WinUser]::KEYEVENTF_KEYUP, 0)
  }
}
"done"
`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { timeout: 6000 },
      () => resolve()
    );
  });
}

/**
 * Fetches the first YouTube video ID for a given search query by scraping
 * YouTube's search results page (no API key needed).
 */
function fetchFirstYouTubeVideoId(query: string): Promise<string | null> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let resolved = false;
    const done = (id: string | null) => {
      if (!resolved) {
        resolved = true;
        resolve(id);
      }
    };

    const timer = setTimeout(() => done(null), 3500);

    try {
      const req = https.get(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
            const match = data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
            if (match && match[1]) {
              clearTimeout(timer);
              done(match[1]);
              try { res.destroy(); } catch (_) {}
            }
          });
          res.on('end', () => {
            clearTimeout(timer);
            const match = data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
            done(match ? match[1] : null);
          });
          res.on('error', () => {
            clearTimeout(timer);
            done(null);
          });
        }
      );

      req.on('error', () => {
        clearTimeout(timer);
        done(null);
      });
      req.on('timeout', () => {
        clearTimeout(timer);
        try { req.destroy(); } catch (_) {}
        done(null);
      });
      req.setTimeout(3500);
    } catch {
      clearTimeout(timer);
      done(null);
    }
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

  // 2. YouTube & YouTube Music handling — fetch first video and auto-play
  if (
    rawAction === 'play_youtube' ||
    rawAction === 'play_youtube_music' ||
    rawApp === 'youtube' ||
    rawApp === 'youtube music' ||
    rawApp === 'yt'
  ) {
    clearPendingMusicQuery();
    const chromePath = getChromeExecutablePath();

    let targetUrl = 'https://music.youtube.com';
    if (query) {
      // Try to fetch the first video ID so we can auto-play it
      const videoId = await fetchFirstYouTubeVideoId(query);
      if (videoId) {
        targetUrl = `https://www.youtube.com/watch?v=${videoId}&autoplay=1`;
      } else {
        // Fallback: open search results (user will need to click manually)
        targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      }
    }

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
      message: query ? `Playing "${query}" on YouTube.` : 'Opened YouTube Music.',
    };
  }

  // 3. Spotify handling — open search then auto-click first result
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

    // Auto-play first result: bring Spotify to front and press Enter on first result
    if (cleanQuery) {
      spotifyAutoPlayFirstResult().catch(() => {});
    }

    return {
      success: true,
      action: 'play_spotify',
      app: 'Spotify',
      query: cleanQuery,
      message: cleanQuery
        ? `Playing "${cleanQuery}" on Spotify.`
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
