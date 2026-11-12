// Parsing for the wake-word gate. The Gemini transcribe call answers in a
// strict mini-format; these helpers turn that reply into a decision and keep
// the pure logic out of the React hooks so it can be tested.

/** Wake phrases the UI can display; matching itself is done by the model. */
export const WAKE_WORD_DISPLAY = 'Hey Friday';

const WAKE_WORD_PATTERN = /\b(?:hey|hi|okay|ok)?\s*friday\b/i;

export interface WakeResult {
  wake: boolean;
  /** Everything the user said, with the wake phrase stripped. May be empty. */
  command: string;
}

/** Local transcript gate used by the persistent microphone listener. */
export function detectLocalWakePhrase(transcript: string | undefined | null): WakeResult {
  const text = (transcript || '').replace(/\s+/g, ' ').trim();
  const match = text.match(WAKE_WORD_PATTERN);
  if (!match || match.index === undefined) return { wake: false, command: '' };

  const command = text
    .slice(match.index + match[0].length)
    .replace(/^[\s,.:;!?-]+/, '')
    .trim();
  return { wake: true, command };
}

/**
 * Parses the wake-gate model reply.
 * Accepted forms: "WAKE|<transcript>", "WAKE: <transcript>", "WAKE", "NONE".
 * Tolerates casing, stray punctuation and model chatter around the keyword.
 */
export function parseWakeReply(reply: string | undefined | null): WakeResult {
  const text = (reply || '').trim();
  if (!text) return { wake: false, command: '' };

  const upper = text.toUpperCase();
  const marker = upper.indexOf('WAKE');
  if (marker === -1 || upper.includes('NONE')) {
    return { wake: false, command: '' };
  }

  const rest = text
    .slice(marker + 4)
    .replace(/^[\s|:\-–—.,]+/, '')
    .trim();

  return { wake: true, command: stripWakePhrase(rest) };
}

/** Removes leading "hey/ok/hi … Friday" style prefixes from a command. */
export function stripWakePhrase(text: string): string {
  let out = (text || '').trim();
  let changed = true;

  const fillers = /^(hey|ok|okay|hi|hello|yo|oi|ayyo|ఏది|హాయ్)\b[\s,.!]*$/i;

  while (changed && out) {
    changed = false;
    const words = out.split(/\s+/);
    if (words.length === 0) break;
    const first = words[0]?.toLowerCase().replace(/[^a-z]/g, '') || '';

    if (first === 'friday') {
      words.shift();
      out = words.join(' ').replace(/^[\s,.!:-]+/, '');
      changed = true;
    } else if (words.length >= 2) {
      const second = words[1]?.toLowerCase().replace(/[^a-z]/g, '') || '';
      if (second === 'friday') {
        // Strip if first is English filler OR if it's a non-ASCII/multilingual filler (and there's more content after)
        if (fillers.test(words[0]) || (/[^\x00-\x7F]/.test(words[0]) && words.length > 2)) {
          words.splice(0, 2);
          out = words.join(' ').replace(/^[\s,.!:-]+/, '');
          changed = true;
        } else if (/[^\x00-\x7F]/.test(words[0]) && words.length === 2) {
          // For non-ASCII word followed by Friday alone, strip just Friday and keep the word as command
          words.splice(1, 1); // remove Friday
          out = words.join(' ').replace(/^[\s,.!:-]+/, '');
          changed = true;
        } else if (fillers.test(words[0]) || words.length === 2) {
          // Default case
          words.splice(0, 2);
          out = words.join(' ').replace(/^[\s,.!:-]+/, '');
          changed = true;
        }
      }
    }
  }

  return out.trim();
}

/**
 * Natural language activation pattern for VoiceFlow dictation.
 * Matches: "Friday, type this", "Friday type this", "Hey Friday, type this",
 * "type this", "dictate this", or "write this".
 */
export const VOICEFLOW_TRIGGER_PATTERN =
  /^(?:(?:hey|hi|okay|ok)?\s*friday[\s,.:;!?-]+)?(?:type\s+this|dictate\s+this|write\s+this)\b/i;

export interface VoiceFlowPhraseResult {
  isVoiceFlow: boolean;
  /** Any direct text that immediately followed the trigger phrase */
  immediateText: string;
}

/**
 * Distinguishes FRIDAY VoiceFlow activation from normal conversational commands.
 */
export function detectVoiceFlowActivationPhrase(transcript: string | undefined | null): VoiceFlowPhraseResult {
  const text = (transcript || '').replace(/\s+/g, ' ').trim();
  const match = text.match(VOICEFLOW_TRIGGER_PATTERN);
  if (!match || match.index === undefined) {
    return { isVoiceFlow: false, immediateText: '' };
  }

  const immediateText = text
    .slice(match.index + match[0].length)
    .replace(/^[\s,.:;!?-]+/, '')
    .trim();

  return { isVoiceFlow: true, immediateText };
}
