import { detectLanguageFromText } from '../voice/languages';
import { PersonalityMode } from '../../shared/types';

export interface LocalResponse {
  text: string;
  detectedLanguage: string;
}

/** Answers deterministic conversational housekeeping without a model round-trip. */
export function getLocalResponse(
  text: string,
  preferredLanguage = 'en-IN',
  personalityMode: PersonalityMode = 'moderate'
): LocalResponse | null {
  const value = text.trim().toLowerCase();
  if (!value) return null;

  if (/^(hi|hey|hello|good morning|good afternoon|good evening)\b/.test(value)) {
    const greeting =
      personalityMode === 'simple'
        ? 'Hey, I’m here with you. What are we working on?'
        : personalityMode === 'roast'
          ? 'Hey. I’m here, obviously. What are we working on?'
          : 'Hey. I’m here and ready. What are we working on?';
    return {
      text: greeting,
      detectedLanguage: detectLanguageFromText(text, preferredLanguage),
    };
  }

  if (/^(are you there|are you listening|can you hear me)\??$/.test(value)) {
    const response =
      personalityMode === 'simple'
        ? 'I’m here with you and listening.'
        : personalityMode === 'roast'
          ? 'Yes, I’m here. Try not to panic.'
          : 'I’m here and listening.';
    return { text: response, detectedLanguage: preferredLanguage };
  }

  if (/^(what time is it|what is the time|current time)\??$/.test(value)) {
    const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
    return {
      text:
        personalityMode === 'simple'
          ? `It’s ${time}. Take your time today.`
          : personalityMode === 'roast'
            ? `It’s ${time}. Time keeps moving, unlike your productivity.`
            : `It’s ${time}.`,
      detectedLanguage: preferredLanguage,
    };
  }

  if (/^(what is today'?s date|what date is it|today'?s date)\??$/.test(value)) {
    const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date());
    return {
      text: personalityMode === 'roast' ? `It’s ${date}. There, mystery solved.` : `Today is ${date}.`,
      detectedLanguage: preferredLanguage,
    };
  }

  return null;
}
