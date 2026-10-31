// Compatibility wrapper: the persona lives in ./persona.ts.
// Keeping this entry point means the chat pipeline imports one function and the
// personality stays centralised.

import { buildPersonaInstruction } from './persona';

export { PERSONA_VERSION } from './persona';

export function buildSystemInstruction(
  preferredLanguageCode: string = 'te-IN',
  memoryContext: string = '',
  conversationBrief: string = ''
): string {
  return buildPersonaInstruction({
    preferredLanguage: preferredLanguageCode,
    memoryContext,
    conversationBrief,
  });
}
