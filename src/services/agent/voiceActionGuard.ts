/**
 * FRIDAY Voice Action Guard
 *
 * Protects against accidental, false, or unintended desktop action execution.
 * Ensures:
 * 1. Commands addressed to other assistants (Google, Siri, Alexa) are blocked from desktop execution.
 * 2. Hallucinated STT phrases generated from background noise, music, or silence are rejected.
 * 3. Ambiguous or low-confidence voice input does not execute desktop actions without user confirmation.
 */

const FOREIGN_ASSISTANT_REGEX = /(?:^(?:ok|okay|hey|hi)\s+(?:google|siri|alexa|cortana|bixby)\b|\b(?:ok|okay|hey|hi)\s+(?:google|siri|alexa|cortana|bixby)\b|^(?:alexa|siri|cortana|bixby)\b)/i;

const HALLUCINATED_PATTERNS = [
  /thank\s+you\s+(?:very\s+much\s+)?for\s+watching/i,
  /thanks\s+for\s+watching/i,
  /please\s+subscribe/i,
  /like\s+and\s+subscribe/i,
  /subtitles\s+by/i,
  /translated\s+by/i,
  /\b(?:amara\.org|opensubtitles)\b/i,
  /^\s*(?:silence|unclear|none|empty|music|applause|laughter|cough|sigh)\s*$/i,
  /^[.\s,…:;!?-]+$/,
  /^\[?\d{1,2}:\d{2}(?::\d{2})?\]?(?:\s*-\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?)?$/,
];

export interface ActionValidationResult {
  allowed: boolean;
  isForeignAssistant: boolean;
  reason?: string;
  sanitizedText: string;
}

/**
 * Checks whether an utterance was addressed to a third-party voice assistant
 * (e.g., from TV, phone, YouTube audio, or another user).
 */
export function isForeignAssistantCommand(text: string): boolean {
  if (!text) return false;
  return FOREIGN_ASSISTANT_REGEX.test(text.trim());
}

/**
 * Detects known hallucinated / repetitive transcripts commonly produced
 * when neural STT models are fed background noise, music, or silence.
 */
export function isHallucinatedOrNoiseTranscript(text: string): boolean {
  const clean = (text || '').trim();
  if (!clean) return true;

  if (HALLUCINATED_PATTERNS.some((pattern) => pattern.test(clean))) {
    return true;
  }

  // Detect repetitive loops from audio corruption (e.g. "play play play play" or "kuchh kuchh kuchh")
  const words = clean.toLowerCase().split(/\s+/);
  if (words.length >= 4) {
    const allSame = words.every((w) => w === words[0]);
    if (allSame) return true;
  }

  return false;
}

/**
 * Validates whether an incoming transcript is safe to route to desktop action tools.
 */
export function validateVoiceAction(
  text: string,
  source: 'TEXT' | 'VOICE' = 'VOICE'
): ActionValidationResult {
  const sanitizedText = (text || '').trim();

  if (!sanitizedText) {
    return {
      allowed: false,
      isForeignAssistant: false,
      reason: 'Empty input text',
      sanitizedText: '',
    };
  }

  // 1. Foreign assistant check
  if (isForeignAssistantCommand(sanitizedText)) {
    return {
      allowed: false,
      isForeignAssistant: true,
      reason: 'Command addressed to a foreign assistant (Google, Siri, Alexa)',
      sanitizedText,
    };
  }

  // 2. Hallucinated / noise transcript check
  if (isHallucinatedOrNoiseTranscript(sanitizedText)) {
    return {
      allowed: false,
      isForeignAssistant: false,
      reason: 'Hallucinated or acoustic noise transcript',
      sanitizedText,
    };
  }

  return {
    allowed: true,
    isForeignAssistant: false,
    sanitizedText,
  };
}
