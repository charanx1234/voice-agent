import { detectLanguageFromText } from '../voice/languages';
import { PersonalityMode } from '../../shared/types';

export interface LocalResponse {
  text: string;
  detectedLanguage: string;
}

// Rotating greeting pools to avoid repetitive responses
const GREETINGS_MODERATE = [
  "Hey! What are we tackling today?",
  "Hey, I’m here. What's on your mind?",
  "Hi! Ready when you are — what do you need?",
  "Hey there. What can I help you with?",
  "I’m here. What do you want to get done?",
  "Hey! Anything specific you want to work on?",
  "Hi! Tell me what you need.",
  "Hey, I’m listening. What's up?",
];

const GREETINGS_SIMPLE = [
  "Hey, I’m here with you. What are we working on?",
  "Hi! I’m here and ready to help. What do you need?",
  "Hey there! What can I do for you today?",
  "Hello! I’m here — take your time. What's going on?",
  "Hi! Happy to help. What's on your mind?",
];

const GREETINGS_ROAST = [
  "Hey. I’m here, obviously. What do you need this time?",
  "Oh look, you showed up. What do you want?",
  "Hey. Ready to be useful, unlike some people. What is it?",
  "Back again? Fine. What do you need?",
  "I’m here. Try not to make it complicated. What's up?",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Answers deterministic conversational housekeeping without a model round-trip. */
export function getLocalResponse(
  text: string,
  preferredLanguage = 'en-IN',
  personalityMode: PersonalityMode = 'moderate'
): LocalResponse | null {
  const value = text.trim().toLowerCase();
  if (!value) return null;

  if (/^(who|what)\s+(the\s+hell\s+)?are\s+you\??$/.test(value) || /^who\s+is\s+friday\??$/.test(value)) {
    const identity =
      personalityMode === 'simple'
        ? "I’m FRIDAY, your caring desktop assistant and friend. I’m here to help and keep things simple."
        : personalityMode === 'roast'
          ? "I’m FRIDAY, your desktop assistant. The competent one in this conversation—usually."
          : "I’m FRIDAY, your desktop assistant and practical friend. I help with tasks, information and everyday work.";
    return { text: identity, detectedLanguage: detectLanguageFromText(text, preferredLanguage) };
  }

  if (/^(hi|hey|hello|good morning|good afternoon|good evening)\b/.test(value)) {
    let greeting: string;
    if (personalityMode === 'simple') {
      greeting = pickRandom(GREETINGS_SIMPLE);
    } else if (personalityMode === 'roast') {
      greeting = pickRandom(GREETINGS_ROAST);
    } else {
      greeting = pickRandom(GREETINGS_MODERATE);
    }
    return {
      text: greeting,
      detectedLanguage: detectLanguageFromText(text, preferredLanguage),
    };
  }

  if (/^(are you there|are you listening|can you hear me)\??$/.test(value)) {
    const response =
      personalityMode === 'simple'
        ? "I’m here with you and listening."
        : personalityMode === 'roast'
          ? "Yes, I’m here. Try not to panic."
          : "I’m here and listening.";
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
