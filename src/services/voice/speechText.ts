// Text preparation and voice selection for speech output.

/**
 * Removes presentation syntax from the speech copy while leaving the message
 * shown in the transcript untouched. Plain punctuation is intentionally kept:
 * the providers use it for natural prosody, so we do not add artificial pause
 * markers or turn commas and full stops into long silences.
 */
export function cleanForSpeech(text: string): string {
  let spoken = (text || '')
    // A fenced block is useful context, but reading its source punctuation is not.
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    // Turn list and paragraph layout into connected speech rather than saying
    // "dash" or leaving abrupt line-level gaps.
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/^\s*(?:[-*_]){3,}\s*$/gm, '')
    .replace(/[|*_#>]/g, ' ')
    .replace(/[\r\n]+/g, ' ');

  // Unicode emoji are pictographs, including joined emoji sequences and skin
  // tone modifiers. Decorative symbol ranges cover common bullets/arrows while
  // leaving useful mathematical and currency characters available to speech.
  spoken = spoken
    .replace(/[0-9#*]\uFE0F?\u20E3/gu, ' ')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Regional_Indicator}\uFE0F\u200D]/gu, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, ' ')
    .replace(/…/g, '.')
    .replace(/[\u2000-\u206F\u25A0-\u25FF\u2600-\u27BF\u2B00-\u2BFF]/gu, (symbol) =>
      /[.,!?;:'"()[\]{}%&+\-/]/.test(symbol) ? symbol : ' '
    )
    // Ellipses and repeated excitement marks cause exaggerated provider pauses.
    // Keep one meaningful punctuation mark for the displayed meaning in speech.
    .replace(/\.{2,}/g, '.')
    .replace(/!{2,}/g, '!')
    .replace(/\?{2,}/g, '?')
    .replace(/([!?])[!?]+/g, '$1')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])\s+/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();

  return spoken;
}

/**
 * Splits speech into sentence-sized chunks so the first one can start playing
 * while later ones are still being synthesized. Never splits on commas, keeping
 * clause intonation smooth and preventing artificial audio gaps.
 */
export function chunkForSpeech(text: string, maxChars = 280): string[] {
  const clean = (text || '').trim();
  if (!clean) return [];

  const sentences = clean
    .split(/(?<=[.!?…])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      pushCurrent();
      // Long sentence: split on whitespace words near maxChars, never on commas.
      let buffer = '';
      for (const word of sentence.split(/\s+/)) {
        if ((buffer + ' ' + word).trim().length > maxChars) {
          if (buffer.trim()) chunks.push(buffer.trim());
          buffer = word;
        } else {
          buffer = `${buffer} ${word}`.trim();
        }
      }
      if (buffer.trim()) chunks.push(buffer.trim());
      continue;
    }

    // Keep adjacent short sentences together whenever they fit. This allows the TTS
    // engine to naturally cadence between sentences without gap delays.
    if (current && (current + ' ' + sentence).length > maxChars) {
      pushCurrent();
    }
    current = `${current} ${sentence}`.trim();
  }

  pushCurrent();
  return chunks.filter((chunk) => chunk.length > 0);
}

/** Pulls only safe sentence-sized text from a still-arriving model stream. */
export function takeCompleteSpeechChunks(
  buffer: string,
  maxChars = 260
): { complete: string[]; remainder: string } {
  const clean = buffer || '';
  const matches = [...clean.matchAll(/(?<=[.!?…])(?:\s+|$)/g)];
  const last = matches.at(-1);
  const boundary = last?.index === undefined ? 0 : last.index + last[0].length;

  if (!boundary && clean.length <= maxChars) return { complete: [], remainder: clean };

  const splitAt = boundary || Math.max(0, clean.lastIndexOf(' ', maxChars));
  if (splitAt <= 0) return { complete: [], remainder: clean };
  return {
    complete: chunkForSpeech(clean.slice(0, splitAt), maxChars),
    remainder: clean.slice(splitAt).trimStart(),
  };
}

const FEMALE_HINTS = [
  'zira', 'aria', 'jenny', 'neerja', 'swara', 'pallavi', 'sapna', 'shruti',
  'heera', 'sonia', 'libby', 'michelle', 'ava', 'emma', 'female', 'woman',
];

const MALE_HINTS = [
  'david', 'mark', 'ravi', 'mohan', 'madhur', 'gagan', 'prabhat', 'valluvar',
  'guy', 'brian', 'christopher', 'eric', 'roger', 'steffan', 'andrew', 'male',
];

export interface SystemVoiceLike {
  name: string;
  lang: string;
  default?: boolean;
}

/**
 * Chooses the best female system voice for a language.
 * Never falls back to a male default just because it is the OS default.
 */
export function pickSystemVoice<T extends SystemVoiceLike>(
  voices: T[],
  language: string,
  preferredName?: string
): T | null {
  if (!voices || voices.length === 0) return null;

  const prefix = (language || 'en').split('-')[0].toLowerCase();
  const full = (language || '').toLowerCase();

  const score = (voice: T): number => {
    const name = voice.name.toLowerCase();
    const lang = voice.lang.toLowerCase();
    let value = 0;

    if (preferredName && voice.name === preferredName) value += 6;
    if (lang === full) value += 3;
    else if (lang.startsWith(prefix)) value += 2;

    if (FEMALE_HINTS.some((hint) => name.includes(hint))) value += 2.5;
    if (MALE_HINTS.some((hint) => name.includes(hint))) value -= 3;
    if (voice.default) value += 0.5;

    return value;
  };

  const ranked = [...voices].sort((a, b) => score(b) - score(a));
  return score(ranked[0]) > 0 ? ranked[0] : ranked[0];
}
