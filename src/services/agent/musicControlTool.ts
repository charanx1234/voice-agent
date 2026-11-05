import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getChromeExecutablePath } from './chromeBrowserTool';
import { desktopControlService } from '../desktop/desktopControlService';

/**
 * Checks whether Spotify is installed on this Windows computer.
 */
export function getSpotifyExecutablePath(): string | null {
  const appData = process.env.APPDATA || '';
  const localAppData = process.env.LOCALAPPDATA || '';

  const candidates = [
    path.join(appData, 'Spotify', 'Spotify.exe'),
    path.join(localAppData, 'Microsoft', 'WindowsApps', 'Spotify.exe'),
    path.join(localAppData, 'Spotify', 'Spotify.exe'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
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
      'Controls music playback on Windows (Spotify, YouTube Music, or media player). Actions: "play", "pause", "toggle_play_pause", "next_song", "previous_song", "open_spotify", "play_youtube_music".',
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
            'open_spotify',
            'play_youtube_music',
          ],
          description: 'Music control action to perform.',
        },
        app: {
          type: 'STRING',
          description: 'Optional target music application: "spotify", "youtube", "media_player". Defaults to "spotify" if user mentions Spotify.',
        },
        query: {
          type: 'STRING',
          description: 'Optional song, artist, or playlist name to search/play (e.g. "classic rock", "lo-fi beats").',
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
  const action = String(args.action || 'play').toLowerCase();
  const app = String(args.app || '').toLowerCase();
  const query = String(args.query || '').trim();

  // 1. YouTube Music handling
  if (action === 'play_youtube_music' || app === 'youtube' || app === 'youtube music') {
    const chromePath = getChromeExecutablePath();
    if (!chromePath) {
      return { success: false, error: "Google Chrome is needed to play music on YouTube, but couldn't be found." };
    }
    const targetUrl = query
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      : 'https://music.youtube.com';

    spawn(chromePath, [targetUrl], { detached: true, stdio: 'ignore' }).unref();
    return {
      success: true,
      action,
      app: 'YouTube',
      message: query ? `Opened YouTube to play "${query}".` : 'Opened YouTube Music in Google Chrome.',
    };
  }

  // 2. Open Spotify
  if (action === 'open_spotify' || (action === 'play' && app === 'spotify')) {
    const isRunning = await isProcessRunning('spotify');
    if (!isRunning) {
      // Launch Spotify via protocol or executable
      const spotifyExe = getSpotifyExecutablePath();
      try {
        if (spotifyExe) {
          spawn(spotifyExe, [], { detached: true, stdio: 'ignore' }).unref();
        } else {
          spawn('cmd.exe', ['/c', 'start', 'spotify:'], { detached: true, stdio: 'ignore' }).unref();
        }
      } catch (err: any) {
        return { success: false, error: "I couldn't open Spotify." };
      }

      // Verify that Spotify process actually launched
      let verified = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isProcessRunning('spotify')) {
          verified = true;
          break;
        }
      }

      if (!verified) {
        return { success: false, error: "I couldn't find or open Spotify on your computer." };
      }
    } else {
      // Bring existing Spotify to foreground
      await desktopControlService.switchWindow('spotify');
    }

    if (action === 'play') {
      await new Promise((r) => setTimeout(r, 600));
      // Dispatch VK_MEDIA_PLAY_PAUSE (0xB3 = 179)
      await sendMediaKeyEvent(179);
      return {
        success: true,
        action: 'play',
        app: 'Spotify',
        message: 'Spotify is open and playing your music.',
      };
    }

    return {
      success: true,
      action: 'open_spotify',
      app: 'Spotify',
      message: 'Spotify is open and ready.',
    };
  }

  // 3. Playback controls via Windows Virtual Media Keys
  // 179 = VK_MEDIA_PLAY_PAUSE, 176 = VK_MEDIA_NEXT_TRACK, 177 = VK_MEDIA_PREV_TRACK, 178 = VK_MEDIA_STOP
  switch (action) {
    case 'play':
    case 'toggle_play_pause': {
      const ok = await sendMediaKeyEvent(179);
      return {
        success: ok,
        action,
        message: 'Resumed playback on your active music player.',
      };
    }
    case 'pause': {
      const ok = await sendMediaKeyEvent(179);
      return {
        success: ok,
        action,
        message: 'Paused your music.',
      };
    }
    case 'next_song': {
      const ok = await sendMediaKeyEvent(176);
      return {
        success: ok,
        action,
        message: 'Skipped to the next track.',
      };
    }
    case 'previous_song': {
      const ok = await sendMediaKeyEvent(177);
      return {
        success: ok,
        action,
        message: 'Returned to the previous track.',
      };
    }
    default:
      return {
        success: false,
        error: `Unsupported music action "${action}".`,
      };
  }
}
