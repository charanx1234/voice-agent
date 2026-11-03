import {
  ConversationMood,
  PersonalityMode,
  VoiceProsodySummary,
} from '../../shared/types';

export interface MoodAnalysis {
  mood: ConversationMood;
  confidence: 'low' | 'medium' | 'high';
  safetyOverride: boolean;
  cues: string[];
}

export interface MoodVoiceProfile {
  rateMultiplier: number;
  pitchOffset: number;
  pauseMultiplier: number;
}

const DISTRESS_PATTERNS = [
  /\b(i want to die|kill myself|suicid|end my life|self[- ]?harm)\b/i,
  /\b(can't go on|cannot go on|no reason to live|hurt myself)\b/i,
  /\b(abuse|unsafe|in danger|help me now|emergency)\b/i,
];

const WELLBEING_OVERRIDE_PATTERNS = [
  /\b(i(?:'m| am|m)\s+)?(genuinely\s+)?(upset|hurt|overwhelmed|not okay|not ok|falling apart|crying|in pain|having a hard time)\b/i,
  /\b(please don't joke|do not joke|i need support|i need help|this is serious|i feel terrible|i feel hopeless)\b/i,
];

const FRUSTRATION_PATTERNS = /\b(angry|furious|frustrated|annoyed|stuck|useless|broken|damn|wtf|why is this not working)\b/i;
const CONFUSION_PATTERNS = /\b(confused|don't understand|do not understand|what does this mean|explain again|lost|how do i)\b/i;
const EXCITEMENT_PATTERNS = /[!]{1,}|\b(excited|amazing|awesome|great news|love it|finally|yes)\b/i;
const PLAYFUL_PATTERNS = /\b(joke|funny|roast|haha|lol|tease|kidding|playful)\b/i;
const SERIOUS_PATTERNS = /\b(serious|important|urgent|medical|legal|finance|safety|death|diagnosis|emergency)\b/i;
const MOTIVATION_PATTERNS = /\b(motivat|encourag|discourag|give up|can't do this|need confidence)\b/i;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * Estimates conversational delivery from local cues. This deliberately reports
 * a cue with confidence instead of asserting an emotion as fact.
 */
export function analyzeMood(text = '', prosody?: VoiceProsodySummary): MoodAnalysis {
  const value = text.trim();
  const distress = DISTRESS_PATTERNS.some((pattern) => pattern.test(value));
  const wellbeingOverride = distress || WELLBEING_OVERRIDE_PATTERNS.some((pattern) => pattern.test(value));
  if (wellbeingOverride) {
    return {
      mood: 'supportive',
      confidence: 'high',
      safetyOverride: true,
      cues: ['possible distress or safety concern'],
    };
  }

  const cues: string[] = [];
  let mood: ConversationMood = 'calm';
  let score = 0;

  if (FRUSTRATION_PATTERNS.test(value)) {
    mood = 'supportive';
    cues.push('frustrated wording');
    score += 2;
  }
  if (CONFUSION_PATTERNS.test(value)) {
    mood = 'patient';
    cues.push('confusion or request for clarification');
    score += 2;
  }
  if (SERIOUS_PATTERNS.test(value)) {
    mood = 'focused';
    cues.push('serious or sensitive topic');
    score += 2;
  }
  if (MOTIVATION_PATTERNS.test(value)) {
    mood = 'supportive';
    cues.push('request for encouragement');
    score += 2;
  }
  if (PLAYFUL_PATTERNS.test(value)) {
    mood = 'playful';
    cues.push('playful wording');
    score += 1;
  }
  if (EXCITEMENT_PATTERNS.test(value)) {
    mood = 'enthusiastic';
    cues.push('excited wording');
    score += 1;
  }

  if (prosody) {
    if (prosody.peakLevel >= 0.65 || (prosody.speechRate ?? 0) >= 3.2) {
      if (mood === 'calm') mood = 'enthusiastic';
      cues.push('higher energy voice cues');
      score += 1;
    } else if (prosody.peakLevel <= 0.12 && (prosody.speechRate ?? 99) <= 1.2) {
      if (mood === 'calm') mood = 'supportive';
      cues.push('quiet or slow voice cues');
      score += 1;
    }
    if ((prosody.pauseRatio ?? 0) >= 0.45) cues.push('long pauses');
  }

  const confidence: MoodAnalysis['confidence'] = score >= 3 ? 'high' : score >= 1 ? 'medium' : 'low';
  return { mood, confidence, safetyOverride: false, cues };
}

export function buildMoodInstruction(analysis: MoodAnalysis, mode: PersonalityMode): string {
  const safety = analysis.safetyOverride
    ? 'A wellbeing safety override is active. Be warm, serious and supportive. Do not roast, joke, or use unnecessary profanity.'
    : 'Treat this as a tentative conversational cue, not a diagnosis. If the user corrects your read, adapt immediately.';
  const modeRule =
    mode === 'simple'
      ? 'Simple delivery: comfort first, gentle and soft, no teasing.'
      : mode === 'roast'
        ? 'Roast delivery: sharper sarcasm and blunt banter are expected when safe.'
        : 'Moderate delivery: warm but firm, with respectful correction and no profanity.';

  return `DYNAMIC MOOD AND DELIVERY
 - Current presentation mood cue: ${analysis.mood} (confidence: ${analysis.confidence}).
 - Personality boundary: ${mode}.
 - ${modeRule}
 - ${safety}
- Adjust wording, pacing and warmth to the moment while keeping the same facts, tools, actions and decisions.
- Never announce or label the user's emotion as certain unless they explicitly state it.`;
}

/** Maps mood to small TTS changes while preserving the user's voice/accent. */
export function moodVoiceProfile(mood: ConversationMood): MoodVoiceProfile {
  switch (mood) {
    case 'enthusiastic':
      return { rateMultiplier: 1.06, pitchOffset: 0.5, pauseMultiplier: 0.9 };
    case 'patient':
      return { rateMultiplier: 0.92, pitchOffset: 0, pauseMultiplier: 1.15 };
    case 'supportive':
      return { rateMultiplier: 0.94, pitchOffset: -0.25, pauseMultiplier: 1.12 };
    case 'focused':
      return { rateMultiplier: 0.96, pitchOffset: -0.1, pauseMultiplier: 1.05 };
    case 'playful':
      return { rateMultiplier: 1.02, pitchOffset: 0.35, pauseMultiplier: 0.95 };
    default:
      return { rateMultiplier: 1, pitchOffset: 0, pauseMultiplier: 1 };
  }
}

export function applyMoodToSpeech(
  rate: number,
  pitch: number,
  mood: ConversationMood,
  personalityMode: PersonalityMode = 'moderate'
): { rate: number; pitch: number } {
  const profile = moodVoiceProfile(mood);
  const modeRate = personalityMode === 'simple' ? 0.94 : personalityMode === 'roast' ? 1.06 : 1;
  const modePitch = personalityMode === 'simple' ? -0.15 : personalityMode === 'roast' ? 0.25 : 0;
  return {
    rate: clamp(rate * profile.rateMultiplier * modeRate, 0.7, 1.5),
    pitch: clamp(pitch + profile.pitchOffset + modePitch, -3, 3),
  };
}
