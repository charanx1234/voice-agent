import { detectLanguageFromText } from '../voice/languages';

export interface LocalResponse {
  text: string;
  detectedLanguage: string;
}

/** Answers deterministic conversational housekeeping without a model round-trip. */
export function getLocalResponse(text: string, preferredLanguage = 'en-IN'): LocalResponse | null {
  const value = text.trim().toLowerCase();
  if (!value) return null;

  if (/^(hi|hey|hello|good morning|good afternoon|good evening)\b/.test(value)) {
    return {
      text: 'Hey. I’m here and ready. What are we working on?',
      detectedLanguage: detectLanguageFromText(text, preferredLanguage),
    };
  }

  if (/^(are you there|are you listening|can you hear me)\??$/.test(value)) {
    return { text: 'I’m here and listening.', detectedLanguage: preferredLanguage };
  }

  if (/^(what time is it|what is the time|current time)\??$/.test(value)) {
    return {
      text: `It’s ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())}.`,
      detectedLanguage: preferredLanguage,
    };
  }

  if (/^(what is today'?s date|what date is it|today'?s date)\??$/.test(value)) {
    return {
      text: `Today is ${new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date())}.`,
      detectedLanguage: preferredLanguage,
    };
  }

  return null;
}
