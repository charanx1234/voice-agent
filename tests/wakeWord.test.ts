import { describe, expect, it } from 'vitest';
import { detectLocalWakePhrase, parseWakeReply, stripWakePhrase, WAKE_WORD_DISPLAY } from '../src/services/voice/wakeWord';

describe('Wake word parsing', () => {
  it('exposes the display phrase', () => {
    expect(WAKE_WORD_DISPLAY).toBe('Hey Friday');
  });

  it('parses WAKE| transcript form', () => {
    const result = parseWakeReply('WAKE|what is the weather today');
    expect(result.wake).toBe(true);
    expect(result.command).toBe('what is the weather today');
  });

  it('parses WAKE: transcript form', () => {
    const result = parseWakeReply('WAKE: tell me a joke');
    expect(result.wake).toBe(true);
    expect(result.command).toBe('tell me a joke');
  });

  it('treats NONE as no wake', () => {
    expect(parseWakeReply('NONE')).toEqual({ wake: false, command: '' });
    expect(parseWakeReply('none')).toEqual({ wake: false, command: '' });
  });

  it('strips leading hey/ok friday prefixes', () => {
    expect(stripWakePhrase('Hey Friday what time is it')).toBe('what time is it');
    expect(stripWakePhrase('ok friday play music')).toBe('play music');
    expect(stripWakePhrase('Friday remind me')).toBe('remind me');
  });

  it('handles multilingual filler prefixes', () => {
    expect(stripWakePhrase('హాయ్ Friday turn on lights')).toBe('turn on lights');
    expect(stripWakePhrase('ఎందుకు Friday')).toBe('ఎందుకు');
  });

  it('returns empty command when only wake phrase spoken', () => {
    const result = parseWakeReply('WAKE|Hey Friday');
    expect(result.wake).toBe(true);
    expect(result.command).toBe('');
  });

  it('detects the wake phrase locally from a live transcript', () => {
    expect(detectLocalWakePhrase('Hey Friday remind me at six')).toEqual({
      wake: true,
      command: 'remind me at six',
    });
    expect(detectLocalWakePhrase('hello there')).toEqual({ wake: false, command: '' });
  });
});
