import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let logDir: string;
let readRecentLogLines: (limit?: number) => string[];
let getLogFilePath: () => string;

beforeAll(async () => {
  logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-logs-'));
  const logger = await import('../src/main/backend/logger');
  logger.initLogger({ keepConsole: false, scope: 'test', directory: logDir });
  readRecentLogLines = logger.readRecentLogLines;
  getLogFilePath = logger.getLogFilePath;

  console.log('service started');
  console.warn('a warning');
  console.error('a failure', { code: 42 });
});

describe('File logging', () => {
  it('creates the log file inside the configured directory', () => {
    expect(fs.existsSync(getLogFilePath())).toBe(true);
    expect(path.dirname(getLogFilePath())).toBe(logDir);
  });

  it('records stdout, warnings and errors with levels', () => {
    const content = fs.readFileSync(getLogFilePath(), 'utf-8');
    expect(content).toContain('[INFO] [test] service started');
    expect(content).toContain('[WARN] [test] a warning');
    expect(content).toContain('[ERROR] [test] a failure');
  });

  it('serialises non-string values instead of dropping them', () => {
    const content = fs.readFileSync(getLogFilePath(), 'utf-8');
    expect(content).toContain('code: 42');
  });

  it('reads recent lines newest-last', () => {
    const lines = readRecentLogLines(10);
    expect(lines.length).toBeGreaterThan(0);
    // Oldest entry first, newest last.
    expect(lines[0]).toContain('Logger initialised');
    expect(lines[lines.length - 1]).toContain('a failure');
  });

  it('keeps writing after the initial setup line', () => {
    console.log('second phase');
    const lines = readRecentLogLines(5);
    expect(lines[lines.length - 1]).toContain('second phase');
  });
});
