import { ConversationMood, FaceExpression, PersonalityMode, RobotState } from '../../shared/types';

export interface FaceExpressionInput {
  state: RobotState;
  mood?: ConversationMood;
  personalityMode?: PersonalityMode;
  text?: string;
}

/**
 * Normalizes aliases and states into one of the 9 core expressions:
 * 'happy' | 'sad' | 'crying' | 'angry' | 'satisfied' | 'sarcastic' | 'laugh' | 'smile' | 'not-happy'
 */
export function normalizeFaceExpression(expr: FaceExpression): FaceExpression {
  if (expr === 'laughing') return 'laugh';
  if (expr === 'not_happy') return 'not-happy';
  if (expr === 'excited') return 'happy';
  if (expr === 'curious' || expr === 'thinking') return 'smile';
  if (expr === 'surprised') return 'happy';
  if (expr === 'confused') return 'not-happy';
  if (expr === 'sleepy') return 'satisfied';
  if (expr === 'neutral') return 'smile';
  return expr;
}

/**
 * Chooses a visual delivery from conversational cues, sentiment, and personality mode.
 * Deterministic and context-driven: visual expression reacts naturally without random jumping.
 * Purely visual — never alters conversational text, tool choices, or logic.
 */
export function selectFaceExpression({
  state,
  mood = 'calm',
  personalityMode = 'moderate',
  text = '',
}: FaceExpressionInput): FaceExpression {
  const value = text.toLowerCase();

  // State-based foundational expressions
  if (state === 'sleeping') return 'sleepy';
  if (state === 'interrupted') return 'surprised';
  if (state === 'error') return 'sad';
  if (state === 'laughing') return 'laughing';

  // 1. Crying (strong distress, crying cues)
  if (/\b(cry|crying|tears|sob|sobbing|heartbroken|devastated|bawling|cried|tearful|sniffl)\w*/.test(value)) {
    return 'crying';
  }

  // 2. Laugh (humour, laughter cues, playful jokes)
  if (/\b(lol|lmao|haha|hahaha|hehe|hehehe|giggle|chuckle|hilarious|funny|joke|rofl|crack up|😂|🤣)\w*/.test(value)) {
    return 'laughing';
  }

  // 3. Angry (frustration, anger cues)
  if (/\b(angry|mad|furious|irritated|annoyed|rage|hate it|unfair|ridiculous|infuriating|aggravat)\w*/.test(value)) {
    return 'angry';
  }

  // 4. Sarcastic (irony, mocking or roast mode cues)
  if (/\b(sarcastic|yeah right|oh really|genius|obviously|no kidding|sure thing|as if|duh)\b/.test(value)) {
    return 'sarcastic';
  }

  // 5. Not Happy (unimpressed, disappointment, flat rejection)
  if (/\b(not happy|unhappy|disappointed|displeased|boring|meh|lame|frustrat|bad service|fail|sigh|unimpressed)\w*/.test(value)) {
    return 'not-happy';
  }

  // 6. Sad (general sadness, empathy, stress)
  if (/\b(sorry|sad|upset|hurt|worried|stress|stressed|overwhelmed|bad day|grief|depressed|down|bummed|pity)\w*/.test(value)) {
    return 'sad';
  }

  // 7. Satisfied (accomplishment, completion, gentle relief)
  if (/\b(satisfied|perfect|solved|finished|done|all set|relief|pleased|great job|well done|thank you|thanks|sorted)\w*/.test(value)) {
    return 'satisfied';
  }

  // 8. Smile (friendly greetings, polite welcome)
  if (/\b(hello|hi|hey|good morning|good evening|welcome|namaste|pleasure|howdy|smile|smiling|friendly)\w*/.test(value)) {
    return 'smile';
  }

  // 9. Happy & Excited (celebration, wins, joyful remarks)
  if (/\b(congrats|congratulations|won|win|great news|good news|proud|success|worked|awesome|hooray|yay|happy|delighted)\w*/.test(value)) {
    return mood === 'enthusiastic' ? 'excited' : 'happy';
  }

  // Inquisitive / Confusion cues
  if (/\b(confus|don't understand|do not understand|unclear|what do you mean)\w*/.test(value)) {
    return 'confused';
  }
  if (/\b(why|how|what|which|can you explain|tell me)\b/.test(value)) {
    return 'curious';
  }

  // In-flight processing states
  if (state === 'thinking') return 'thinking';
  if (state === 'listening') return 'curious';

  // Real-time speaking animation: Personality mode integration
  if (state === 'speaking') {
    // Distress or empathy takes precedence across all modes
    if (mood === 'supportive' || mood === 'patient') {
      return personalityMode === 'simple' ? 'smile' : 'sad';
    }

    if (personalityMode === 'simple') {
      // Simple Mode: warm, friendly, reassuring
      if (mood === 'enthusiastic') return 'happy';
      if (mood === 'playful') return 'smile';
      return 'satisfied';
    }

    if (personalityMode === 'roast') {
      // Roast Mode: sarcastic, confident smirk, laughing at user
      if (mood === 'playful' || mood === 'enthusiastic') return 'sarcastic';
      return 'sarcastic';
    }

    // Moderate Mode: balanced, natural transitions
    if (mood === 'enthusiastic') return 'happy';
    if (mood === 'playful') return 'smile';
    return 'happy';
  }

  // Idle / Ambient state by personality mode
  if (personalityMode === 'simple') {
    return 'smile';
  }

  if (personalityMode === 'roast') {
    if (mood === 'playful' || /\b(sure|right|obvious|really)\b/.test(value)) {
      return 'sarcastic';
    }
    return 'not-happy';
  }

  // Moderate Mode default mood mapping
  switch (mood) {
    case 'enthusiastic':
      return 'excited';
    case 'supportive':
    case 'patient':
      return 'sad';
    case 'playful':
      return 'smile';
    default:
      return 'neutral';
  }
}
