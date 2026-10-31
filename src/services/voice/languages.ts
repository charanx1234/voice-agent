// Indian & Multilingual Language Definitions and Voice Mappings for FRIDAY

export interface LanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  scriptRegex?: RegExp;
  sampleGreeting: string;
  preferredVoices: string[];
  systemInstructionSnippet: string;
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageConfig> = {
  'te-IN': {
    code: 'te-IN',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    scriptRegex: /[\u0C00-\u0C7F]/,
    sampleGreeting: 'నమస్కారం! నేను ఫ్రైడే (FRIDAY). మీకు ఈ రోజు ఎలా సహాయపడగలను?',
    preferredVoices: ['te-IN', 'Telugu', 'Microsoft Mohan', 'Microsoft Shruti', 'Google తెలుగు'],
    systemInstructionSnippet:
      'The user prefers Telugu (తెలుగు) or Telugu-English code-switching (speaking natural conversational Telugu with common English technical/daily terms). Respond in natural, warm, conversational Telugu using the Telugu script, or in the language the user speaks.',
  },
  'en-IN': {
    code: 'en-IN',
    name: 'English (India)',
    nativeName: 'English (India)',
    sampleGreeting: "Hello! I am FRIDAY, your personal AI assistant. What are we working on?",
    preferredVoices: ['en-IN', 'English (India)', 'Microsoft Neerja', 'Microsoft Ravi', 'Google English (India)', 'en-GB', 'en-US'],
    systemInstructionSnippet:
      'The user prefers Indian English or general English. Respond in polite, friendly, helpful, conversational Indian English.',
  },
  'hi-IN': {
    code: 'hi-IN',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    scriptRegex: /[\u0900-\u097F]/,
    sampleGreeting: 'नमस्ते! मैं फ्राइडे (FRIDAY) हूँ। आज मैं आपकी क्या मदद कर सकती हूँ?',
    preferredVoices: ['hi-IN', 'Hindi', 'Microsoft Swara', 'Microsoft Madhur', 'Google हिन्दी'],
    systemInstructionSnippet:
      'The user prefers Hindi (हिन्दी) or Hinglish. Respond in warm, respectful, natural conversational Hindi using Devanagari script or natural mixed phrasing matching user style.',
  },
  'ta-IN': {
    code: 'ta-IN',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    scriptRegex: /[\u0B80-\u0BFF]/,
    sampleGreeting: 'வணக்கம்! நான் FRIDAY. இன்று உங்களுக்கு நான் எவ்வாறு உதவ முடியும்?',
    preferredVoices: ['ta-IN', 'Tamil', 'Microsoft Pallavi', 'Microsoft Valluvar', 'Google தமிழ்'],
    systemInstructionSnippet:
      'The user prefers Tamil (தமிழ்). Respond in friendly, polite, conversational Tamil using the Tamil script.',
  },
  'kn-IN': {
    code: 'kn-IN',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    scriptRegex: /[\u0C80-\u0CFF]/,
    sampleGreeting: 'ನಮಸ್ಕಾರ! ನಾನು FRIDAY. ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?',
    preferredVoices: ['kn-IN', 'Kannada', 'Microsoft Sapna', 'Microsoft Gagan', 'Google ಕನ್ನಡ'],
    systemInstructionSnippet:
      'The user prefers Kannada (ಕನ್ನಡ). Respond in warm, polite, conversational Kannada using the Kannada script.',
  },
  'en-US': {
    code: 'en-US',
    name: 'English (US)',
    nativeName: 'English (US)',
    sampleGreeting: "Hi, I'm FRIDAY. What do you need?",
    preferredVoices: ['en-US', 'Microsoft Zira', 'Microsoft David', 'Google US English'],
    systemInstructionSnippet:
      'The user prefers standard English. Respond warmly, clearly, and concisely.',
  },
};

/**
 * Automatically infers language from text by matching Unicode script blocks
 */
export function detectLanguageFromText(text: string, defaultCode = 'te-IN'): string {
  if (!text || text.trim().length === 0) return defaultCode;

  // Check Telugu
  if (SUPPORTED_LANGUAGES['te-IN'].scriptRegex?.test(text)) {
    return 'te-IN';
  }
  // Check Hindi / Devanagari
  if (SUPPORTED_LANGUAGES['hi-IN'].scriptRegex?.test(text)) {
    return 'hi-IN';
  }
  // Check Tamil
  if (SUPPORTED_LANGUAGES['ta-IN'].scriptRegex?.test(text)) {
    return 'ta-IN';
  }
  // Check Kannada
  if (SUPPORTED_LANGUAGES['kn-IN'].scriptRegex?.test(text)) {
    return 'kn-IN';
  }

  // If text is primarily Latin characters, check for typical Indian English or return user preferred
  return defaultCode;
}

