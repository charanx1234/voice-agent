import { ConversationMood, FaceExpression, PersonalityMode, RobotState } from '../../shared/types';

export interface FaceExpressionInput {
  state: RobotState;
  mood?: ConversationMood;
  personalityMode?: PersonalityMode;
  text?: string;
}

/**
 * Chooses a visual delivery from the same local cues already used by FRIDAY's
 * conversation system. It is intentionally deterministic: facial animation
 * may be lively, but the expression itself should never jump randomly.
 */
export function selectFaceExpression({
  state,
  mood = 'calm',
  personalityMode = 'moderate',
  text = '',
}: FaceExpressionInput): FaceExpression {
  const value = text.toLowerCase();

  if (state === 'sleeping') return 'sleepy';
  if (state === 'interrupted') return 'surprised';
  if (state === 'error') return 'sad';
  if (state === 'laughing') return 'laughing';

  if (/\b(sorry|sad|upset|angry|hurt|worried|stress|stressed|overwhelmed|bad day|cry)\b/.test(value)) {
    return 'sad';
  }
  if (/\b(lol|lmao|haha|hilarious|funny|joke|😂|🤣)\b/.test(value)) return 'laughing';
  if (/\b(congrats|congratulations|won|win|great news|good news|proud|success|worked)\b/.test(value)) {
    return mood === 'enthusiastic' ? 'excited' : 'happy';
  }
  if (/\b(confus|don't understand|do not understand|unclear|what do you mean)\w*/.test(value)) return 'confused';
  if (/\b(why|how|what|which|can you explain|tell me)\b/.test(value)) return 'curious';

  if (state === 'thinking') return 'thinking';
  if (state === 'listening') return 'curious';

  if (personalityMode === 'roast' && (mood === 'playful' || /\b(sure|right|obvious|really)\b/.test(value))) {
    return 'sarcastic';
  }

  switch (mood) {
    case 'enthusiastic':
      return 'excited';
    case 'supportive':
    case 'patient':
      return 'sad';
    case 'playful':
      return personalityMode === 'roast' ? 'sarcastic' : 'happy';
    default:
      return 'neutral';
  }
}
