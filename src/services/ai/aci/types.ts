/**
 * FRIDAY Adaptive Conversational Intelligence (ACI) V1 — Shared Types
 * Master interfaces for Context Understanding, Emotional Signal Analysis,
 * Adaptive Personality, Response Depth, Tone, and Conversational Strategy.
 */

import { PersonalityMode } from '../../../shared/types';

export type InteractionMode =
  | 'casual_chatting'
  | 'learning'
  | 'researching'
  | 'troubleshooting'
  | 'brainstorming'
  | 'executing_tasks';

export type EmotionalSignal =
  | 'neutrality'
  | 'excitement'
  | 'happiness'
  | 'frustration'
  | 'confusion'
  | 'sadness'
  | 'stress'
  | 'curiosity'
  | 'uncertainty';

export type ResponseDepthLevel = 'D0' | 'D1' | 'D2' | 'D3' | 'D4';

export type ConversationalStrategy =
  | 'direct_answer'
  | 'explanation'
  | 'step_by_step'
  | 'clarification'
  | 'listening_acknowledgement'
  | 'brainstorming'
  | 'research_analysis'
  | 'task_execution'
  | 'follow_up_assistance';

export type ConversationTone =
  | 'warm_friendly'
  | 'calm_supportive'
  | 'direct_concise'
  | 'playful_witty'
  | 'patient_encouraging'
  | 'analytical_objective'
  | 'gentle_reassuring'
  | 'respectful_serious';

export type PersonalitySource =
  | 'manual_override'
  | 'conversation_instruction'
  | 'automatic'
  | 'default_preference';

export type VerbosityLevel = 'minimal' | 'low' | 'normal' | 'detailed' | 'high';

export interface EmotionAnalysisResult {
  signals: EmotionalSignal[];
  primarySignal: EmotionalSignal;
  confidence: number; // 0.0 to 1.0
  isExplicitStatement: boolean;
  cues: string[];
  safetyOverride: boolean;
}

export interface ContextUnderstandingResult {
  intent: string;
  currentTask: string;
  category: string;
  requestedDepth?: ResponseDepthLevel;
  ongoingProjectContext?: string;
  previousRelevantReferences: string[];
  interactionMode: InteractionMode;
  isMultiTurnFollowUp: boolean;
  confidence: number;
}

export interface ConversationPolicy {
  intent: string;
  context: string;
  task: string;
  category: string;
  interactionMode: InteractionMode;
  emotion_signals: EmotionalSignal[];
  emotion_confidence: number;
  primary_emotion: EmotionalSignal;
  personality: PersonalityMode;
  personality_source: PersonalitySource;
  tone: ConversationTone;
  response_depth: ResponseDepthLevel;
  strategy: ConversationalStrategy;
  language: string;
  verbosity: VerbosityLevel;
  safety_override: boolean;
  cues?: string[];
}

export interface FeedbackAdjustment {
  detected: boolean;
  type?: 'verbosity_reduction' | 'verbosity_increase' | 'simplicity' | 'disable_roast' | 'serious_tone' | 'normal_tone' | 'give_examples';
  appliedPolicyAdjustments?: Partial<ConversationPolicy>;
  userFeedbackText?: string;
  persistPreference?: boolean;
}

export interface AciDiagnosticsRecord {
  requestId: string;
  timestamp: number;
  intent: string;
  context: string;
  task: string;
  interactionMode: InteractionMode;
  emotionSignals: EmotionalSignal[];
  emotionConfidence: number;
  personality: PersonalityMode;
  personalitySource: PersonalitySource;
  responseDepth: ResponseDepthLevel;
  tone: ConversationTone;
  strategy: ConversationalStrategy;
  classificationLatencyMs: number;
  generationLatencyMs?: number;
  feedbackAdjustmentApplied?: string;
}
