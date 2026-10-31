import fs from 'fs';
import path from 'path';
import util from 'util';
import { app } from 'electron';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 7;

let logDirectory = '';
let currentFile = '';
let initialized = false;
let consolePatched = false;
let originalConsole: Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'> | null = null;

function resolveLogDirectory(): string {
  try {
    if (app && typeof (app as any).getPath === 'function') {
      return path.join(app.getPath('userData'), 'logs');
    }
  } catch {
    // not running under Electron
  }
  return path.join(process.cwd(), '.data', 'logs');
}

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

function dateStamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function rotateIfNeeded(): void {
  try {
    if (!currentFile || !fs.existsSync(currentFile)) return;
    const size = fs.statSync(currentFile).size;
    if (size < MAX_FILE_BYTES) return;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotated = path.join(logDirectory, `friday-${stamp}.log`);
    fs.renameSync(currentFile, rotated);
    pruneOldFiles();
  } catch {
    // rotation must never break logging
  }
}

function pruneOldFiles(): void {
  try {
    const files = fs
      .readdirSync(logDirectory)
      .filter((name) => name.startsWith('friday-') && name.endsWith('.log'))
      .map((name) => {
        const fullPath = path.join(logDirectory, name);
        return { fullPath, time: fs.statSync(fullPath).mtimeMs };
      })
      .sort((a, b) => b.time - a.time);

    for (const file of files.slice(MAX_FILES)) {
      fs.unlinkSync(file.fullPath);
    }
  } catch {
    // best effort
  }
}

function serialize(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  return util.inspect(value, { depth: 3, breakLength: 120, maxArrayLength: 20 });
}

/** Appends one line to today's log file. Never throws. */
export function log(level: LogLevel, scope: string, ...parts: unknown[]): void {
  if (!initialized) return;

  const message = parts.map(serialize).join(' ');
  const line = `${timestamp()} [${level}] [${scope}] ${message}`;

  try {
    rotateIfNeeded();
    fs.appendFileSync(currentFile, `${line}\n`, 'utf-8');
  } catch {
    // if the file cannot be written, fall back to the console only
    originalConsole?.error(line);
  }

  return;
}

/**
 * Starts file logging and optionally silences stdout.
 * In packaged builds nothing is written to a terminal, so launching the app from
 * PowerShell/CMD no longer prints backend chatter.
 */
export function initLogger(options: { keepConsole: boolean; scope?: string; directory?: string }): void {
  if (initialized) return;

  logDirectory = options.directory || resolveLogDirectory();
  ensureDirectory(logDirectory);

  currentFile = path.join(logDirectory, `friday-${dateStamp()}.log`);
  initialized = true;
  pruneOldFiles();

  const scope = options.scope || 'main';

  if (!consolePatched) {
    consolePatched = true;
    originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console),
    };

    console.log = (...args: unknown[]) => {
      log('INFO', scope, ...args);
      if (options.keepConsole) originalConsole?.log(...args);
    };
    console.info = (...args: unknown[]) => {
      log('INFO', scope, ...args);
      if (options.keepConsole) originalConsole?.info(...args);
    };
    console.warn = (...args: unknown[]) => {
      log('WARN', scope, ...args);
      if (options.keepConsole) originalConsole?.warn(...args);
    };
    console.error = (...args: unknown[]) => {
      log('ERROR', scope, ...args);
      if (options.keepConsole) originalConsole?.error(...args);
    };
    console.debug = (...args: unknown[]) => {
      log('DEBUG', scope, ...args);
      if (options.keepConsole) originalConsole?.debug(...args);
    };
  } else if (!options.keepConsole) {
    // Already patched in dev mode; silence stdout for this run.
    console.log = (...args: unknown[]) => log('INFO', scope, ...args);
    console.info = (...args: unknown[]) => log('INFO', scope, ...args);
    console.warn = (...args: unknown[]) => log('WARN', scope, ...args);
    console.error = (...args: unknown[]) => log('ERROR', scope, ...args);
    console.debug = (...args: unknown[]) => log('DEBUG', scope, ...args);
  }

  log('INFO', scope, `Logger initialised at ${currentFile}`);
}

export function getLogDirectory(): string {
  if (!logDirectory) {
    logDirectory = resolveLogDirectory();
  }
  return logDirectory;
}

export function getLogFilePath(): string {
  return currentFile;
}

/** Returns the most recent log lines across files (newest file first). */
export function readRecentLogLines(limit = 200): string[] {
  try {
    const dir = getLogDirectory();
    if (!fs.existsSync(dir)) return [];

    const files = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith('friday-') && name.endsWith('.log'))
      .map((name) => path.join(dir, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    const lines: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8').trimEnd().split('\n');
      lines.unshift(...content);
      if (lines.length >= limit) break;
    }

    return lines.slice(-limit);
  } catch {
    return [];
  }
}

/** Flushes nothing today (appendFileSync writes synchronously) but kept for symmetry. */
export function flushLogs(): void {
  // synchronous writes mean there is no buffer to flush
}

