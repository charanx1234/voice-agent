import { describe, it, expect } from 'vitest';
import { chunkForSpeech, cleanForSpeech, pickSystemVoice } from '../src/services/voice/speechText';
import {
  pitchToHz,
  rateToPercent,
  voiceForLanguage,
  volumeToPercent,
  wrapPcmAsWav,
} from '../src/services/voice/neuralVoice';

describe('Female voice selection', () => {
  it('maps every supported language to a female neural voice', () => {
    expect(voiceForLanguage('en-IN')).toBe('en-IN-NeerjaExpressiveNeural');
    expect(voiceForLanguage('en-US')).toBe('en-US-AriaNeural');
    expect(voiceForLanguage('te-IN')).toBe('te-IN-ShrutiNeural');
    expect(voiceForLanguage('hi-IN')).toBe('hi-IN-SwaraNeural');
    expect(voiceForLanguage('ta-IN')).toBe('ta-IN-PallaviNeural');
    expect(voiceForLanguage('kn-IN')).toBe('kn-IN-SapnaNeural');
  });

  it('falls back to Indian English for unknown languages', () => {
    expect(voiceForLanguage('fr-FR')).toBe('en-IN-NeerjaExpressiveNeural');
    expect(voiceForLanguage(undefined)).toBe('en-IN-NeerjaExpressiveNeural');
  });
});

describe('Prosody mapping', () => {
  it('converts speed multipliers to percentages', () => {
    expect(rateToPercent(1)).toBe(0);
    expect(rateToPercent(1.2)).toBe(20);
    expect(rateToPercent(0.8)).toBe(-20);
    expect(rateToPercent(3)).toBe(40);
  });

  it('converts semitones to Hz offsets', () => {
    expect(pitchToHz(0)).toBe('+0Hz');
    expect(pitchToHz(2)).toBe('+40Hz');
    expect(pitchToHz(-1.5)).toBe('-30Hz');
  });

  it('converts volume to a percentage', () => {
    expect(volumeToPercent(1)).toBe(100);
    expect(volumeToPercent(0.5)).toBe(50);
    expect(volumeToPercent(2)).toBe(100);
  });
});

describe('WAV wrapping', () => {
  it('produces a playable header around PCM data', () => {
    const pcm = Buffer.alloc(4800);
    const wav = wrapPcmAsWav(pcm, 24000);

    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.length).toBe(44 + pcm.length);
  });
});

describe('Speech text preparation', () => {
  it('strips markdown, code fences and URLs', () => {
    const text = '**Hello** there, see https://example.com and `code`.\n```js\nconst x = 1;\n```';
    const cleaned = cleanForSpeech(text);

    expect(cleaned).not.toContain('**');
    expect(cleaned).not.toContain('https://');
    expect(cleaned).toContain('code block');
  });

  it('splits speech into sentence chunks', () => {
    const chunks = chunkForSpeech('First sentence. Second sentence! Third one?');
    expect(chunks).toEqual(['First sentence.', 'Second sentence!', 'Third one?']);
  });

  it('merges short sentences up to the size limit', () => {
    const chunks = chunkForSpeech('Hi. Ok. Fine.', 40);
    expect(chunks.length).toBeLessThanOrEqual(1);
  });

  it('splits a long sentence without cutting words', () => {
    const long = 'word '.repeat(120).trim();
    const chunks = chunkForSpeech(long, 100);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
      expect(chunk.startsWith('word')).toBe(true);
    }
  });

  it('returns nothing for empty text', () => {
    expect(chunkForSpeech('')).toEqual([]);
    expect(chunkForSpeech('   ')).toEqual([]);
  });
});

describe('System voice fallback', () => {
  const voices = [
    { name: 'Microsoft David - English (United States)', lang: 'en-US', default: true },
    { name: 'Microsoft Zira - English (United States)', lang: 'en-US', default: false },
    { name: 'Microsoft Ravi - English (India)', lang: 'en-IN', default: false },
    { name: 'Microsoft Heera - English (India)', lang: 'en-IN', default: false },
  ];

  it('prefers a female voice over the male system default', () => {
    const picked = pickSystemVoice(voices, 'en-US');
    expect(picked?.name).toContain('Zira');
  });

  it('matches the requested language before gender', () => {
    const picked = pickSystemVoice(voices, 'en-IN');
    expect(picked?.lang).toBe('en-IN');
    expect(picked?.name).toContain('Heera');
  });

  it('returns null when no voices exist', () => {
    expect(pickSystemVoice([], 'en-US')).toBeNull();
  });
});
