import { describe, it, expect } from 'vitest';
import {
  ACCENTS,
  LANGUAGE_VOICES,
  accentForLanguage,
  defaultVoiceForAccent,
  getAccent,
  isKnownVoiceId,
  resolveVoiceId,
} from '../src/services/voice/voiceCatalog';

describe('Voice catalogue', () => {
  it('offers American, British and Indian English', () => {
    expect(ACCENTS.map((accent) => accent.id)).toEqual(['en-US', 'en-GB', 'en-IN']);
  });

  it('has female and male voices for every accent', () => {
    for (const accent of ACCENTS) {
      expect(accent.voices.some((voice) => voice.gender === 'female')).toBe(true);
      expect(accent.voices.some((voice) => voice.gender === 'male')).toBe(true);
    }
  });

  it('keeps a female voice as each accent default', () => {
    for (const accent of ACCENTS) {
      const defaultVoice = accent.voices.find((voice) => voice.id === accent.defaultVoice);
      expect(defaultVoice?.gender).toBe('female');
    }
  });

  it('uses unique, well-formed Edge voice ids', () => {
    const ids = ACCENTS.flatMap((accent) => accent.voices.map((voice) => voice.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^en-(US|GB|IN)-[A-Za-z]+Neural$/);
  });
});

describe('Voice resolution', () => {
  it('honours an explicit valid voice', () => {
    expect(
      resolveVoiceId({ voice: 'en-GB-RyanNeural', accent: 'en-US', language: 'en-US' })
    ).toBe('en-GB-RyanNeural');
  });

  it('ignores an unknown voice and falls back to the accent default', () => {
    expect(
      resolveVoiceId({ voice: 'not-a-real-voice', accent: 'en-GB', language: 'en-GB' })
    ).toBe('en-GB-SoniaNeural');
  });

  it('picks the accent default when no voice is given', () => {
    expect(resolveVoiceId({ accent: 'en-US', language: 'en-US' })).toBe('en-US-AriaNeural');
    expect(resolveVoiceId({ accent: 'en-GB', language: 'en-GB' })).toBe('en-GB-SoniaNeural');
    expect(resolveVoiceId({ accent: 'en-IN', language: 'en-IN' })).toBe(
      'en-IN-NeerjaExpressiveNeural'
    );
  });

  it('keeps the native voice for Indian languages', () => {
    expect(resolveVoiceId({ language: 'te-IN', voice: 'en-US-AriaNeural' })).toBe(
      LANGUAGE_VOICES['te-IN']
    );
    expect(resolveVoiceId({ language: 'hi-IN' })).toBe('hi-IN-SwaraNeural');
  });

  it('maps languages to the right accent', () => {
    expect(accentForLanguage('en-US')).toBe('en-US');
    expect(accentForLanguage('en-GB')).toBe('en-GB');
    expect(accentForLanguage('en-IN')).toBe('en-IN');
    expect(accentForLanguage('te-IN')).toBe('en-IN');
  });

  it('exposes helper lookups used by the UI', () => {
    expect(getAccent('en-GB').shortLabel).toBe('British');
    expect(isKnownVoiceId('en-US-JennyNeural')).toBe(true);
    expect(isKnownVoiceId('bogus')).toBe(false);
    expect(defaultVoiceForAccent('en-US')).toBe('en-US-AriaNeural');
  });
});
