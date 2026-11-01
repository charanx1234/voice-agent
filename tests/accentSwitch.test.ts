import { describe, it, expect, afterAll } from 'vitest';
import { accentIdFromName } from '../src/services/voice/voiceCatalog';
import {
  executeVoiceAccentTool,
  voiceAccentToolDefinition,
} from '../src/services/agent/toolRegistry';
import { settingsStore } from '../src/services/storage/settingsStore';

const original = settingsStore.getSettings();
afterAll(() => {
  settingsStore.saveSettings({
    voiceAccent: original.voiceAccent,
    ttsVoice: original.ttsVoice,
  });
});

describe('Accent switching', () => {
  it('maps spoken accent names to accent ids', () => {
    expect(accentIdFromName('American')).toBe('en-US');
    expect(accentIdFromName('US')).toBe('en-US');
    expect(accentIdFromName('speak american english')).toBe('en-US');
    expect(accentIdFromName('British')).toBe('en-GB');
    expect(accentIdFromName('UK')).toBe('en-GB');
    expect(accentIdFromName('british accent')).toBe('en-GB');
    expect(accentIdFromName('Indian')).toBe('en-IN');
    expect(accentIdFromName('India')).toBe('en-IN');
    expect(accentIdFromName('en-US')).toBe('en-US');
    expect(accentIdFromName('en-GB')).toBe('en-GB');
    expect(accentIdFromName('en-IN')).toBe('en-IN');
  });

  it('rejects unsupported accents', () => {
    expect(accentIdFromName('Australian')).toBeNull();
    expect(accentIdFromName('')).toBeNull();
    expect(accentIdFromName(undefined)).toBeNull();
  });

  it('switches the saved accent and picks the accent default voice', () => {
    const result = executeVoiceAccentTool({ accent: 'British' });

    expect(result.success).toBe(true);
    expect(result.accent).toBe('en-GB');
    expect(result.voice).toBe('en-GB-SoniaNeural');

    const settings = settingsStore.getSettings();
    expect(settings.voiceAccent).toBe('en-GB');
    expect(settings.ttsVoice).toBe('en-GB-SoniaNeural');
  });

  it('returns a helpful error for unknown accents without changing settings', () => {
    const before = settingsStore.getSettings();
    const result = executeVoiceAccentTool({ accent: 'Azerbaijani' });

    expect(result.success).toBe(false);
    expect(settingsStore.getSettings().voiceAccent).toBe(before.voiceAccent);
  });

  it('registers as a Gemini tool declaration', () => {
    expect(voiceAccentToolDefinition.name).toBe('set_voice_accent');
    expect(voiceAccentToolDefinition.parameters.required).toEqual(['accent']);
  });
});
