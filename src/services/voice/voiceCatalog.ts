// Single source of truth for the English neural voices FRIDAY can speak with.
// The Settings UI and the synthesizer both read from here, so there is no
// duplicated voice list to drift out of sync.

export type VoiceGender = 'female' | 'male';

export interface CatalogVoice {
  id: string;
  label: string;
  gender: VoiceGender;
  tags?: string[];
}

export interface AccentGroup {
  id: 'en-US' | 'en-GB' | 'en-IN';
  label: string;
  shortLabel: string;
  defaultVoice: string;
  voices: CatalogVoice[];
}

export const ACCENTS: AccentGroup[] = [
  {
    id: 'en-US',
    label: 'American English',
    shortLabel: 'American',
    defaultVoice: 'en-US-AriaNeural',
    voices: [
      { id: 'en-US-AriaNeural', label: 'Aria — warm, expressive', gender: 'female', tags: ['expressive'] },
      { id: 'en-US-JennyNeural', label: 'Jenny — friendly, conversational', gender: 'female' },
      { id: 'en-US-AvaNeural', label: 'Ava — bright, natural', gender: 'female' },
      { id: 'en-US-EmmaNeural', label: 'Emma — lively', gender: 'female', tags: ['expressive'] },
      { id: 'en-US-MichelleNeural', label: 'Michelle — calm, clear', gender: 'female' },
      { id: 'en-US-AnaNeural', label: 'Ana — youthful', gender: 'female' },
      { id: 'en-US-AvaMultilingualNeural', label: 'Ava Multilingual', gender: 'female', tags: ['multilingual'] },
      { id: 'en-US-EmmaMultilingualNeural', label: 'Emma Multilingual', gender: 'female', tags: ['multilingual', 'expressive'] },
      { id: 'en-US-AndrewNeural', label: 'Andrew — confident', gender: 'male' },
      { id: 'en-US-BrianNeural', label: 'Brian — warm', gender: 'male' },
      { id: 'en-US-GuyNeural', label: 'Guy — classic', gender: 'male' },
      { id: 'en-US-ChristopherNeural', label: 'Christopher — clear', gender: 'male' },
      { id: 'en-US-EricNeural', label: 'Eric — steady', gender: 'male' },
      { id: 'en-US-RogerNeural', label: 'Roger — mature', gender: 'male' },
      { id: 'en-US-SteffanNeural', label: 'Steffan — news-style', gender: 'male' },
      { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew Multilingual', gender: 'male', tags: ['multilingual'] },
      { id: 'en-US-BrianMultilingualNeural', label: 'Brian Multilingual', gender: 'male', tags: ['multilingual'] },
    ],
  },
  {
    id: 'en-GB',
    label: 'British English',
    shortLabel: 'British',
    defaultVoice: 'en-GB-SoniaNeural',
    voices: [
      { id: 'en-GB-SoniaNeural', label: 'Sonia — warm, expressive', gender: 'female', tags: ['expressive'] },
      { id: 'en-GB-LibbyNeural', label: 'Libby — bright', gender: 'female' },
      { id: 'en-GB-MaisieNeural', label: 'Maisie — youthful', gender: 'female' },
      { id: 'en-GB-RyanNeural', label: 'Ryan — natural', gender: 'male' },
      { id: 'en-GB-ThomasNeural', label: 'Thomas — clear', gender: 'male' },
    ],
  },
  {
    id: 'en-IN',
    label: 'Indian English',
    shortLabel: 'Indian',
    defaultVoice: 'en-IN-NeerjaExpressiveNeural',
    voices: [
      { id: 'en-IN-NeerjaExpressiveNeural', label: 'Neerja — expressive', gender: 'female', tags: ['expressive'] },
      { id: 'en-IN-NeerjaNeural', label: 'Neerja — calm', gender: 'female' },
      { id: 'en-IN-PrabhatNeural', label: 'Prabhat — natural', gender: 'male' },
    ],
  },
];

export const ACCENT_IDS = ACCENTS.map((accent) => accent.id);

/** Voices for the non-English languages FRIDAY speaks. */
export const LANGUAGE_VOICES: Record<string, string> = {
  'te-IN': 'te-IN-ShrutiNeural',
  'hi-IN': 'hi-IN-SwaraNeural',
  'ta-IN': 'ta-IN-PallaviNeural',
  'kn-IN': 'kn-IN-SapnaNeural',
};

export const LANGUAGE_VOICE_LABELS: Record<string, string> = {
  'te-IN': 'Shruti — Telugu, female',
  'hi-IN': 'Swara — Hindi, female',
  'ta-IN': 'Pallavi — Tamil, female',
  'kn-IN': 'Sapna — Kannada, female',
};

export function isAccentSupported(language?: string): boolean {
  return Boolean(language && language.toLowerCase().startsWith('en'));
}

export function getAccent(accentId?: string): AccentGroup {
  return ACCENTS.find((accent) => accent.id === accentId) || ACCENTS[2];
}

/** Indian English → Indian accent; British/American keep their locale. */
export function accentForLanguage(language?: string): AccentGroup['id'] {
  const code = (language || '').toLowerCase();
  if (code === 'en-gb') return 'en-GB';
  if (code === 'en-us') return 'en-US';
  return 'en-IN';
}

export function defaultVoiceForAccent(accentId?: string): string {
  return getAccent(accentId).defaultVoice;
}

export function findVoice(voiceId?: string): CatalogVoice | undefined {
  if (!voiceId) return undefined;
  for (const accent of ACCENTS) {
    const match = accent.voices.find((voice) => voice.id === voiceId);
    if (match) return match;
  }
  const languageMatch = Object.values(LANGUAGE_VOICES).includes(voiceId);
  return languageMatch ? { id: voiceId, label: voiceId, gender: 'female' } : undefined;
}

export function isKnownVoiceId(voiceId?: string): boolean {
  return Boolean(findVoice(voiceId));
}

/**
 * Picks the voice to synthesize with.
 * Non-English languages always keep their native voice (an English accent choice
 * must never make Telugu speak with an American voice); for English the explicit
 * choice wins, then the accent default.
 */
export function resolveVoiceId(options: {
  voice?: string;
  accent?: string;
  language?: string;
}): string {
  const language = options.language || '';
  const nativeVoice = LANGUAGE_VOICES[language];

  if (nativeVoice) {
    const explicitIsForeignEnglish =
      Boolean(options.voice) && !String(options.voice).startsWith('en-');
    if (explicitIsForeignEnglish && isKnownVoiceId(options.voice)) {
      return options.voice as string;
    }
    return nativeVoice;
  }

  if (options.voice && isKnownVoiceId(options.voice)) {
    return options.voice;
  }

  if (isAccentSupported(language)) {
    const accent =
      options.accent && ACCENT_IDS.includes(options.accent as any)
        ? options.accent
        : accentForLanguage(language);
    return defaultVoiceForAccent(accent);
  }

  return defaultVoiceForAccent(options.accent || 'en-IN');
}
