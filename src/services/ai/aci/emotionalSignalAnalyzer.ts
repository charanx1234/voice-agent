/**
 * FRIDAY Adaptive Conversational Intelligence (ACI) V1 — Emotional Signal Analyzer
 * Context-aware, multi-signal emotional cue estimation with confidence tracking,
 * explicit statement prioritization, and safety overrides.
 */

import { VoiceProsodySummary } from '../../../shared/types';
import { EmotionalSignal, EmotionAnalysisResult } from './types';

// Critical crisis / distress patterns (must never be downplayed or mocked)
const CRISIS_PATTERNS = [
  /\b(i want to die|kill myself|suicid|end my life|self[- ]?harm)\b/i,
  /\b(can't go on|cannot go on|no reason to live|hurt myself)\b/i,
  /\b(abuse|unsafe|in danger|emergency|help me now)\b/i,
];

// Explicit first-person emotion statements — strongest evidence
const EXPLICIT_FEELING_PATTERNS: Array<{
  pattern: RegExp;
  signal: EmotionalSignal;
  confidence: number;
}> = [
  // Frustration
  { pattern: /\bi(?:'m| am| feel| am feeling)\s+(?:so |really |extremely |super )?(frustrated|annoyed|furious|pissed off|irritated)\b/i, signal: 'frustration', confidence: 0.95 },
  // Stress
  { pattern: /\bi(?:'m| am| feel| am feeling)\s+(?:so |really |extremely |super )?(stressed|overwhelmed|burnt out|exhausted|under pressure)\b/i, signal: 'stress', confidence: 0.95 },
  // Sadness
  { pattern: /\bi(?:'m| am| feel| am feeling)\s+(?:so |really |extremely |super )?(sad|depressed|heartbroken|down|miserable|crying)\b/i, signal: 'sadness', confidence: 0.95 },
  // Happiness
  { pattern: /\bi(?:'m| am| feel| am feeling)\s+(?:so |really |extremely |super )?(happy|glad|delighted|thrilled|content|joyful)\b/i, signal: 'happiness', confidence: 0.95 },
  // Excitement
  { pattern: /\bi(?:'m| am| feel| am feeling)\s+(?:so |really |extremely |super )?(excited|pumped|hyped|eager)\b/i, signal: 'excitement', confidence: 0.95 },
  // Confusion
  { pattern: /\bi(?:'m| am| feel| am feeling)\s+(?:so |really |extremely |super )?(confused|lost|puzzled|baffled|stuck)\b/i, signal: 'confusion', confidence: 0.92 },
  // Uncertainty
  { pattern: /\bi(?:'m| am| feel| am feeling)\s+(?:so |really |extremely |super )?(uncertain|unsure|hesitant|doubtful|indecisive)\b/i, signal: 'uncertainty', confidence: 0.92 },
  // Curiosity
  { pattern: /\bi(?:'m| am| feel| am feeling)\s+(?:so |really |extremely |super )?(curious|wondering|intrigued|fascinated)\b/i, signal: 'curiosity', confidence: 0.92 },
];

// Inferred lexical cues
const FRUSTRATION_CUES = [
  /\b(why is this not working|it keeps failing|work avvatledu|stupid bug|hate this|annoying|ridiculous|fails again|broken again)\b/i,
  /\b(nothing works|waste of time|argh|ugh+|wt[fh]|damn it)\b/i,
  /\b(oh (great|brilliant|wonderful)|just what i needed|another (bug|crash|error|segfault)|segfault)\b/i,
];

const STRESS_CUES = [
  /\b(deadline|running out of time|so much to do|panic|panicking|freaking out|too much work|cannot handle)\b/i,
  /\b(urgent|asap|need this immediately|pressure)\b/i,
];

const CONFUSION_CUES = [
  /\b(i don't understand|i don't get it|what does this even mean|makes no sense|artham kaaledu|how is this possible)\b/i,
  /\b(wait what|what do you mean|huh\??|lost me here)\b/i,
];

const UNCERTAINTY_CUES = [
  /\b(maybe|not sure|perhaps|i guess|could be|might be|i don't know if|hard to say|is that right\??)\b/i,
  /\b(should i or should i not|conflicted)\b/i,
];

const EXCITEMENT_CUES = [
  /\b(awesome|amazing|fantastic|incredible|let's go|lets go|hell yeah|hooray|yay|wow|super excited)\b/i,
  /[!]{2,}/,
  /\b(it works!|finally worked|holy cow|game changer)\b/i,
];

const HAPPINESS_CUES = [
  /\b(thank you so much|you're the best|love this|so helpful|great job|wonderful|delighted|made my day)\b/i,
  /\b(haha|hehe|lol|rofl|chala baavundi|chala thanks)\b/i,
];

const CURIOSITY_CUES = [
  /\b(tell me more|wondering why|how does that work|why does it|what happens if|curious about|deep dive into)\b/i,
  /\b(can you explain the magic|how come)\b/i,
];

const SADNESS_CUES = [
  /\b(having a bad day|bad news|failed my|disappointed|feeling low|lost my|passed away|alone)\b/i,
  /\b(so disheartening|unhappy|upset about)\b/i,
];

export class EmotionalSignalAnalyzer {
  /**
   * Analyzes text, context history, and prosody to estimate multi-label emotional signals.
   */
  public analyze(
    text: string = '',
    historyText: string = '',
    prosody?: VoiceProsodySummary
  ): EmotionAnalysisResult {
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        signals: ['neutrality'],
        primarySignal: 'neutrality',
        confidence: 0.9,
        isExplicitStatement: false,
        cues: ['empty_or_silent_input'],
        safetyOverride: false,
      };
    }

    // 1. Safety / Crisis Check
    for (const pat of CRISIS_PATTERNS) {
      if (pat.test(trimmed)) {
        return {
          signals: ['sadness', 'stress'],
          primarySignal: 'stress',
          confidence: 0.98,
          isExplicitStatement: true,
          cues: ['critical_distress_or_safety_concern'],
          safetyOverride: true,
        };
      }
    }

    const detectedSignals = new Set<EmotionalSignal>();
    const cues: string[] = [];
    let isExplicitStatement = false;
    let highestConfidence = 0.5; // Baseline neutral confidence

    // 2. Check for explicit emotional declarations
    for (const exp of EXPLICIT_FEELING_PATTERNS) {
      if (exp.pattern.test(trimmed)) {
        detectedSignals.add(exp.signal);
        cues.push(`explicit_${exp.signal}`);
        isExplicitStatement = true;
        if (exp.confidence > highestConfidence) {
          highestConfidence = exp.confidence;
        }
      }
    }

    // 3. Contextual nuance check: ignore words like "crazy", "bad", "sick" if used in slang/praise
    const isSlangPositive = /\b(crazy (good|fast|cool|awesome)|sick (feature|code|idea)|bad ass|badass)\b/i.test(trimmed);

    // 4. Inferred pattern checks
    let frustrationScore = 0;
    for (const pat of FRUSTRATION_CUES) {
      if (pat.test(trimmed)) {
        frustrationScore++;
      }
    }
    if (frustrationScore > 0) {
      detectedSignals.add('frustration');
      cues.push('frustration_lexical_cues');
      highestConfidence = Math.max(highestConfidence, Math.min(0.88, 0.65 + frustrationScore * 0.1));
    }

    let stressScore = 0;
    for (const pat of STRESS_CUES) {
      if (pat.test(trimmed)) {
        stressScore++;
      }
    }
    if (stressScore > 0) {
      detectedSignals.add('stress');
      cues.push('stress_lexical_cues');
      highestConfidence = Math.max(highestConfidence, Math.min(0.85, 0.62 + stressScore * 0.1));
    }

    let confusionScore = 0;
    for (const pat of CONFUSION_CUES) {
      if (pat.test(trimmed)) {
        confusionScore++;
      }
    }
    if (confusionScore > 0) {
      detectedSignals.add('confusion');
      cues.push('confusion_lexical_cues');
      highestConfidence = Math.max(highestConfidence, Math.min(0.85, 0.65 + confusionScore * 0.1));
    }

    let uncertaintyScore = 0;
    for (const pat of UNCERTAINTY_CUES) {
      if (pat.test(trimmed)) {
        uncertaintyScore++;
      }
    }
    if (uncertaintyScore > 0) {
      detectedSignals.add('uncertainty');
      cues.push('uncertainty_lexical_cues');
      highestConfidence = Math.max(highestConfidence, Math.min(0.8, 0.6 + uncertaintyScore * 0.1));
    }

    let excitementScore = 0;
    for (const pat of EXCITEMENT_CUES) {
      if (pat.test(trimmed)) {
        excitementScore++;
      }
    }
    if (excitementScore > 0 || isSlangPositive) {
      detectedSignals.add('excitement');
      cues.push('excitement_lexical_cues');
      highestConfidence = Math.max(highestConfidence, Math.min(0.85, 0.65 + excitementScore * 0.1));
    }

    let happinessScore = 0;
    for (const pat of HAPPINESS_CUES) {
      if (pat.test(trimmed)) {
        happinessScore++;
      }
    }
    if (happinessScore > 0) {
      detectedSignals.add('happiness');
      cues.push('happiness_lexical_cues');
      highestConfidence = Math.max(highestConfidence, Math.min(0.88, 0.68 + happinessScore * 0.1));
    }

    let curiosityScore = 0;
    for (const pat of CURIOSITY_CUES) {
      if (pat.test(trimmed)) {
        curiosityScore++;
      }
    }
    if (curiosityScore > 0) {
      detectedSignals.add('curiosity');
      cues.push('curiosity_lexical_cues');
      highestConfidence = Math.max(highestConfidence, Math.min(0.85, 0.65 + curiosityScore * 0.1));
    }

    let sadnessScore = 0;
    for (const pat of SADNESS_CUES) {
      if (pat.test(trimmed)) {
        sadnessScore++;
      }
    }
    if (sadnessScore > 0) {
      detectedSignals.add('sadness');
      cues.push('sadness_lexical_cues');
      highestConfidence = Math.max(highestConfidence, Math.min(0.88, 0.65 + sadnessScore * 0.1));
    }

    // 5. Prosody acoustic integration
    if (prosody) {
      if (prosody.peakLevel >= 0.70 || (prosody.speechRate ?? 0) >= 3.6) {
        if (!detectedSignals.has('frustration')) {
          detectedSignals.add('excitement');
        }
        cues.push('high_energy_prosody');
        highestConfidence = Math.min(0.95, highestConfidence + 0.05);
      } else if (prosody.peakLevel <= 0.15 && (prosody.speechRate ?? 99) <= 1.5) {
        if (!detectedSignals.has('happiness')) {
          detectedSignals.add('uncertainty');
        }
        cues.push('subdued_prosody');
        highestConfidence = Math.min(0.95, highestConfidence + 0.05);
      }
    }

    // 6. Default to neutrality if no distinct signals found
    if (detectedSignals.size === 0) {
      detectedSignals.add('neutrality');
      highestConfidence = 0.85;
      cues.push('neutral_baseline');
    }

    const signalArray = Array.from(detectedSignals);
    // Determine primary signal: priority goes to explicit declarations, then distress, then highest confidence
    let primarySignal: EmotionalSignal = signalArray[0];
    if (detectedSignals.has('frustration')) primarySignal = 'frustration';
    else if (detectedSignals.has('stress')) primarySignal = 'stress';
    else if (detectedSignals.has('sadness')) primarySignal = 'sadness';
    else if (detectedSignals.has('confusion')) primarySignal = 'confusion';
    else if (detectedSignals.has('excitement')) primarySignal = 'excitement';
    else if (detectedSignals.has('happiness')) primarySignal = 'happiness';
    else if (detectedSignals.has('curiosity')) primarySignal = 'curiosity';
    else if (detectedSignals.has('uncertainty')) primarySignal = 'uncertainty';
    else primarySignal = 'neutrality';

    return {
      signals: signalArray,
      primarySignal,
      confidence: Math.round(highestConfidence * 100) / 100,
      isExplicitStatement,
      cues,
      safetyOverride: false,
    };
  }
}

export const emotionalSignalAnalyzer = new EmotionalSignalAnalyzer();
