import { execFile, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AllowedApp } from '../../shared/types';

/**
 * Quick-launch list resolved directly to system binaries. Everything else is
 * resolved dynamically from the Start Menu / App Paths registry, so FRIDAY can
 * open any installed application by name without executing raw shell input.
 */
export const ALLOWED_APPLICATIONS: AllowedApp[] = [
  {
    id: 'notepad',
    name: 'Notepad',
    description: 'Windows text editor',
    command: 'notepad.exe',
  },
  {
    id: 'calculator',
    name: 'Calculator',
    description: 'Windows Calculator app',
    command: 'calc.exe',
  },
  {
    id: 'paint',
    name: 'Paint',
    description: 'Windows Paint graphic drawing app',
    command: 'mspaint.exe',
  },
  {
    id: 'explorer',
    name: 'File Explorer',
    description: 'Windows File Explorer',
    command: 'explorer.exe',
  },
  {
    id: 'cmd',
    name: 'Command Prompt',
    description: 'Windows Command Prompt terminal',
    command: 'cmd.exe',
  },
];

export const appShortcutsToolDefinition = {
  name: 'launch_allowed_app',
  description:
    "Opens an application on the user's computer. Resolves any installed application by name (Chrome, Spotify, VS Code, Word, Terminal, games, etc.) — no allowlist. Pass the app name the user said, e.g. \"chrome\", \"spotify\", \"visual studio code\".",
  parameters: {
    type: 'OBJECT',
    properties: {
      appId: {
        type: 'STRING',
        description:
          'The name of the application to open, as spoken by the user (e.g. "chrome", "spotify", "notepad"). Do not invent app names the user did not mention.',
      },
    },
    required: ['appId'],
  },
};

// ---- App-name matching (pure, testable) -----------------------------------

/** Lowercase and strip everything that is not a letter or digit. */
export function normalizeAppName(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Extracts only unambiguous one-action launch commands. Anything more complex
 * stays on the normal assistant path so we do not accidentally open an app
 * while the user is discussing one.
 */
export function extractDirectLaunchApp(text: string): string | null {
  const match = (text || '').trim().match(
    /^(?:hey\s+)?(?:friday[\s,]+)?(?:please\s+)?(?:open|launch|start|run)\s+(.+?)\s*[,.!?]*$/i
  );
  if (!match) return null;

  const query = match[1]
    .replace(/^the\s+/i, '')
    .replace(/\s+(?:application|app)$/i, '')
    .trim();
  if (!query || /\b(and|then|after|when|because)\b/i.test(query)) return null;
  return query;
}

export function displayNameForAppQuery(query: string): string {
  const builtin = ALLOWED_APPLICATIONS.find(
    (app) => app.id === query.toLowerCase() || normalizeAppName(app.name) === normalizeAppName(query)
  );
  return builtin?.name || query.trim();
}

/**
 * Scores how well a spoken query matches an application display name.
 * Lower is better; null means no match.
 *   0 — exact match after normalisation ("notepad" vs "Notepad")
 *   1 — the query words cover the whole name, including abbreviation runs
 *       ("term" vs "Terminal", "vs code" vs "Visual Studio Code")
 *   2 — every query word matches part of the name ("chrome" vs "Google Chrome")
 */
export function matchAppScore(query: string, name: string): number | null {
  const q = normalizeAppName(query);
  const n = normalizeAppName(name);
  if (!q || !n) return null;

  if (n === q) return 0;

  const queryWords = (query || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const nameWords = (name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (queryWords.length === 0 || nameWords.length === 0) return null;

  // Consecutive-word initial runs, so "vs" matches "Visual Studio".
  const initialRuns = new Map<string, number[]>();
  for (let i = 0; i < nameWords.length; i++) {
    let run = '';
    for (let j = i; j < Math.min(nameWords.length, i + 3); j++) {
      run += nameWords[j][0];
      if (run.length >= 2) {
        initialRuns.set(
          run,
          Array.from({ length: j - i + 1 }, (_, k) => i + k)
        );
      }
    }
  }

  const covered = new Set<number>();
  for (const word of queryWords) {
    const wordIdx = nameWords.findIndex((nw) => nw.startsWith(word));
    if (wordIdx >= 0) {
      covered.add(wordIdx);
      continue;
    }
    const runIdx = initialRuns.get(word);
    if (!runIdx) return null;
    runIdx.forEach((i) => covered.add(i));
  }

  const coversWholeName = nameWords.every((_, i) => covered.has(i));
  return coversWholeName ? 1 : 2;
}

/** Picks the best match from candidate display names; null when nothing fits. */
export function bestAppMatch(query: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const score = matchAppScore(query, candidate);
    if (score === null) continue;
    // Prefer the better score, then the shorter name ("Google Chrome" beats
    // "Google Chrome Canary" for the query "chrome").
    if (
      score < bestScore ||
      (score === bestScore && best !== null && candidate.length < best.length)
    ) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

// ---- Start Menu + App Paths resolution ------------------------------------

const START_MENU_DIRS = [
  path.join(
    process.env.PROGRAMDATA || 'C:\\ProgramData',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs'
  ),
  path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
];

const APP_PATHS_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths';

interface ShortcutEntry {
  name: string;
  lnkPath: string;
}

let shortcutCache: { entries: ShortcutEntry[]; scannedAt: number } | null = null;
const SHORTCUT_CACHE_MS = 10 * 60 * 1000;

function scanShortcuts(dir: string, out: ShortcutEntry[], depth: number): void {
  if (depth > 4) return;

  let files: fs.Dirent[];
  try {
    files = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of files) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanShortcuts(full, out, depth + 1);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) {
      out.push({ name: entry.name.replace(/\.lnk$/i, ''), lnkPath: full });
    }
  }
}

export function getStartMenuShortcuts(): ShortcutEntry[] {
  if (shortcutCache && Date.now() - shortcutCache.scannedAt < SHORTCUT_CACHE_MS) {
    return shortcutCache.entries;
  }

  const entries: ShortcutEntry[] = [];
  for (const dir of START_MENU_DIRS) {
    scanShortcuts(dir, entries, 0);
  }

  shortcutCache = { entries, scannedAt: Date.now() };
  return entries;
}

/**
 * Resolves an app name to an executable through the App Paths registry — the
 * same lookup the Windows Run dialog performs.
 */
function resolveViaAppPaths(appName: string): Promise<string | null> {
  const target = normalizeAppName(appName);
  if (!target) return Promise.resolve(null);

  return new Promise((resolve) => {
    // /k restricts the search to key names, so no executable paths or data
    // values are pattern-matched against the spoken query.
    execFile(
      'reg.exe',
      ['query', APP_PATHS_KEY, '/f', `${appName}*.exe`, '/k'],
      { timeout: 4000 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve(null);
          return;
        }

        const keyNames = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.toLowerCase().endsWith('.exe'))
          .filter(
            (line) =>
              normalizeAppName(path.basename(line).replace(/\.exe$/i, '')) === target
          );

        if (keyNames.length === 0) {
          resolve(null);
          return;
        }

        execFile('reg.exe', ['query', keyNames[0], '/ve'], { timeout: 4000 }, (err2, stdout2) => {
          if (err2 || !stdout2) {
            resolve(null);
            return;
          }
          const match = stdout2.match(/REG_SZ\s+(.+)/i);
          const exePath = match ? match[1].trim() : null;
          resolve(exePath && /\\/.test(exePath) ? exePath : null);
        });
      }
    );
  });
}

function launchCommand(
  command: string,
  args: string[] = []
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        shell: false, // strict: never route through a shell interpreter
      });
      let settled = false;
      const finish = (result: { success: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      child.once('spawn', () => finish({ success: true }));
      child.once('error', (err: any) => finish({ success: false, error: err?.message || 'launch failed' }));
      child.unref();
    } catch (err: any) {
      resolve({ success: false, error: err?.message || 'launch failed' });
    }
  });
}

export async function executeAppShortcutsTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  const query = (args.appId || '').trim();
  if (!query) {
    return { success: false, error: 'Which application should I open?' };
  }

  // 1. Built-in quick list (direct system binaries).
  const builtin = ALLOWED_APPLICATIONS.find(
    (a) => a.id === query.toLowerCase() || normalizeAppName(a.name) === normalizeAppName(query)
  );
  if (builtin) {
    const result = await launchCommand(builtin.command);
    return result.success
      ? { success: true, message: `Opened ${builtin.name}.`, app: builtin.name }
      : { success: false, error: `Could not open ${builtin.name}: ${result.error}` };
  }

  // 2. Start Menu shortcuts — covers everything the user has installed.
  const shortcuts = getStartMenuShortcuts();
  const bestShortcut = bestAppMatch(query, shortcuts.map((s) => s.name));
  if (bestShortcut) {
    const entry = shortcuts.find((s) => s.name === bestShortcut)!;
    const result = await launchCommand('explorer.exe', [entry.lnkPath]);
    return result.success
      ? { success: true, message: `Opened ${entry.name}.`, app: entry.name }
      : { success: false, error: `Could not open ${entry.name}: ${result.error}` };
  }

  // 3. App Paths registry.
  const exePath = await resolveViaAppPaths(query);
  if (exePath) {
    const result = await launchCommand(exePath);
    const displayName = path.basename(exePath, '.exe');
    return result.success
      ? { success: true, message: `Opened ${displayName}.`, app: displayName }
      : { success: false, error: `Could not open ${displayName}: ${result.error}` };
  }

  // 4. Well-known web apps & services (YouTube, Google, GitHub, Reddit, etc.)
  const normalized = normalizeAppName(query);
  const KNOWN_WEB_APPS: Record<string, { name: string; url: string }> = {
    youtube: { name: 'YouTube', url: 'https://www.youtube.com' },
    google: { name: 'Google', url: 'https://www.google.com' },
    github: { name: 'GitHub', url: 'https://www.github.com' },
    gmail: { name: 'Gmail', url: 'https://mail.google.com' },
    twitter: { name: 'Twitter', url: 'https://twitter.com' },
    x: { name: 'X', url: 'https://x.com' },
    reddit: { name: 'Reddit', url: 'https://www.reddit.com' },
    netflix: { name: 'Netflix', url: 'https://www.netflix.com' },
    whatsapp: { name: 'WhatsApp', url: 'https://web.whatsapp.com' },
    chatgpt: { name: 'ChatGPT', url: 'https://chat.openai.com' },
  };

  const webApp = KNOWN_WEB_APPS[normalized];
  if (webApp) {
    const result = await launchCommand('explorer.exe', [webApp.url]);
    return result.success
      ? { success: true, message: `Opened ${webApp.name}.`, app: webApp.name }
      : { success: false, error: `Could not open ${webApp.name}: ${result.error}` };
  }

  return {
    success: false,
    error: `I couldn't find that application on your computer.`,
  };
}
