// Text preparation and voice selection for speech output.

/** Removes markdown and symbols that sound wrong when read aloud. */
export function cleanForSpeech(text: string): string {
  return (text || '')
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[•\-*]\s+/gm, '')
    .replace(/[*_#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits speech into sentence-sized chunks so the first one can start playing
 * while later ones are still being synthesized.
 */
export function chunkForSpeech(text: string, maxChars = 220): string[] {
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
      // Long sentence: split on commas, then on word boundaries.
      const pieces = sentence.split(/(?<=,)\s+/);
      for (const piece of pieces) {
        if (piece.length <= maxChars) {
          chunks.push(piece.trim());
          continue;
        }
        let buffer = '';
        for (const word of piece.split(/\s+/)) {
          if ((buffer + ' ' + word).trim().length > maxChars) {
            if (buffer.trim()) chunks.push(buffer.trim());
            buffer = word;
          } else {
            buffer = `${buffer} ${word}`.trim();
          }
        }
        if (buffer.trim()) chunks.push(buffer.trim());
      }
      continue;
    }

    // Keep sentences separate so the first one starts playing quickly; only glue
    // very short fragments ("Hi.", "Ok.") together to avoid choppy delivery.
    if (current && (current.length >= 15 || (current + ' ' + sentence).length > maxChars)) {
      pushCurrent();
    }
    current = `${current} ${sentence}`.trim();
  }

  pushCurrent();
  return chunks.filter((chunk) => chunk.length > 0);
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
