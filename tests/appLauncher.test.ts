import { describe, it, expect } from 'vitest';
import {
  normalizeAppName,
  matchAppScore,
  bestAppMatch,
  extractDirectLaunchApp,
} from '../src/services/agent/appShortcutsTool';

describe('App launcher - name matching', () => {
  it('normalizes names by lowercasing and stripping separators', () => {
    expect(normalizeAppName('Visual Studio Code')).toBe('visualstudiocode');
    expect(normalizeAppName('  Google-Chrome  ')).toBe('googlechrome');
    expect(normalizeAppName('')).toBe('');
  });

  it('scores exact matches best regardless of case', () => {
    expect(matchAppScore('notepad', 'Notepad')).toBe(0);
    expect(matchAppScore('CHROME', 'Chrome')).toBe(0);
  });

  it('matches by prefix when the query fully covers the name', () => {
    expect(matchAppScore('term', 'Terminal')).toBe(1);
    expect(matchAppScore('goo', 'Google Chrome')).toBe(2);
  });

  it('matches when every query word starts a word in the name', () => {
    expect(matchAppScore('code', 'Visual Studio Code')).toBe(2);
    expect(matchAppScore('vs code', 'Visual Studio Code')).toBe(1);
    expect(matchAppScore('chrome', 'Google Chrome')).toBe(2);
  });

  it('rejects unrelated names', () => {
    expect(matchAppScore('spotify', 'Visual Studio Code')).toBeNull();
    expect(matchAppScore('xyzzy', 'Notepad')).toBeNull();
    expect(matchAppScore('word', 'Google Chrome')).toBeNull();
  });

  it('picks the best candidate and prefers shorter names on ties', () => {
    const candidates = [
      'Google Chrome Canary',
      'Google Chrome',
      'Chromecast Setup',
      'Spotify',
    ];

    expect(bestAppMatch('chrome', candidates)).toBe('Google Chrome');
    expect(bestAppMatch('spotify', candidates)).toBe('Spotify');
    expect(bestAppMatch('code', candidates)).toBeNull();
  });

  it('returns null for empty queries or candidate lists', () => {
    expect(bestAppMatch('', ['Notepad'])).toBeNull();
    expect(bestAppMatch('notepad', [])).toBeNull();
  });

  it('extracts only simple one-app commands for the fast path', () => {
    expect(extractDirectLaunchApp('Friday, open Notepad')).toBe('Notepad');
    expect(extractDirectLaunchApp('launch Calculator app')).toBe('Calculator');
    expect(extractDirectLaunchApp('open Notepad and then Calculator')).toBeNull();
    expect(extractDirectLaunchApp('tell me about Notepad')).toBeNull();
  });
});
