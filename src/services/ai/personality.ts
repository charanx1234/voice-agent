// Compatibility wrapper: the persona lives in ./persona.ts.
// Keeping this entry point means the chat pipeline imports one function and the
// personality stays centralised.

import { buildPersonaInstruction } from './persona';
import { ConversationMood, PersonalityMode } from '../../shared/types';

export { PERSONA_VERSION } from './persona';

export function buildSystemInstruction(
  preferredLanguageCode: string = 'te-IN',
  memoryContext: string = '',
  conversationBrief: string = '',
  personalityMode: PersonalityMode = 'moderate',
  mood?: ConversationMood,
  moodInstruction?: string
): string {
  return buildPersonaInstruction({
    preferredLanguage: preferredLanguageCode,
    memoryContext,
    conversationBrief,
    personalityMode,
    mood,
    moodInstruction,
  });
}
