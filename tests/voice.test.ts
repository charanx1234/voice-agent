import { describe, it, expect } from 'vitest';
import {
  SILENCE_THRESHOLD,
  describeMicError,
  formatRecordingDuration,
  isLikelySilence,
} from '../src/services/voice/micErrors';

describe('Microphone error messages', () => {
  it('tells the user how to unblock a denied microphone', () => {
    const message = describeMicError({ name: 'NotAllowedError' });
    expect(message).toMatch(/Privacy & security/);
    expect(message).toMatch(/desktop apps/);
  });

  it('explains a missing microphone', () => {
    expect(describeMicError({ name: 'NotFoundError' })).toMatch(/No microphone/);
  });

  it('explains a microphone held by another app', () => {
    expect(describeMicError({ name: 'NotReadableError' })).toMatch(/busy/);
  });

  it('falls back to the underlying error message', () => {
    expect(describeMicError({ name: 'WeirdError', message: 'boom' })).toContain('boom');
    expect(describeMicError({})).toContain('Could not start the microphone');
  });
});

describe('Silence detection', () => {
  it('flags recordings with no audible signal', () => {
    expect(isLikelySilence(0)).toBe(true);
    expect(isLikelySilence(SILENCE_THRESHOLD / 2)).toBe(true);
  });

  it('accepts recordings with real audio', () => {
    expect(isLikelySilence(0.25)).toBe(false);
  });

  it('never blocks a send when the level is unknown', () => {
    expect(isLikelySilence(Number.NaN)).toBe(false);
  });
});

describe('Recording duration formatting', () => {
  it('formats seconds as minutes and seconds', () => {
    expect(formatRecordingDuration(0)).toBe('0:00');
    expect(formatRecordingDuration(7)).toBe('0:07');
    expect(formatRecordingDuration(59)).toBe('0:59');
    expect(formatRecordingDuration(75)).toBe('1:15');
  });

  it('ignores negative values', () => {
    expect(formatRecordingDuration(-5)).toBe('0:00');
  });
});
