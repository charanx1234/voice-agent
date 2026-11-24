/**
 * FRIDAY Adaptive Conversational Intelligence (ACI) V1 — Central Adaptive Controller
 * Synthesizes Context Understanding, Emotional Signal Analysis, Adaptive Personality,
 * Response Depth, Tone, and Conversational Strategy into a per-turn ConversationPolicy.
 */

import { ChatMessage, PersonalityMode, ReasoningLevel, VoiceProsodySummary } from '../../../shared/types';
import { contextUnderstandingEngine } from './contextUnderstandingEngine';
import { emotionalSignalAnalyzer } from './emotionalSignalAnalyzer';
import { adaptivePersonalityEngine } from './adaptivePersonalityEngine';
import { adaptiveResponseDepthEngine } from './adaptiveResponseDepthEngine';
import { conversationalStrategyEngine } from './conversationalStrategyEngine';
import { toneController } from './toneController';
import { aciDiagnostics } from './aciDiagnostics';
import { ConversationPolicy } from './types';

export interface EvaluatePolicyParams {
  requestId?: string;
  message: string;
  conversationHistory?: ChatMessage[];
  retrievedContext?: string;
  manualPersonalityOverride?: PersonalityMode;
  defaultPersonalityPreference?: PersonalityMode;
  reasoningLevel?: ReasoningLevel;
  preferredLanguage?: string;
  prosody?: VoiceProsodySummary;
  hasToolsToExecute?: boolean;
}

export class AdaptiveConversationController {
  /**
   * Generates a comprehensive, context-aware ConversationPolicy for the current turn.
   */
  public evaluatePolicy(params: EvaluatePolicyParams): {
    policy: ConversationPolicy;
    classificationLatencyMs: number;
  } {
    const startTime = performance.now();
    const userText = (params.message || '').trim();
    const history = params.conversationHistory || [];
    const requestId = params.requestId || `aci_${Date.now()}`;

    // 1. Context Understanding (Multi-turn)
    const contextResult = contextUnderstandingEngine.analyze(
      userText,
      history,
      params.retrievedContext
    );

    // 2. Emotional Signal Analysis (Multi-label, confidence-aware)
    const historySummary = history.slice(-2).map((m) => m.text).join(' ');
    const emotionResult = emotionalSignalAnalyzer.analyze(userText, historySummary, params.prosody);

    // 3. Adaptive Personality Resolution (Priority hierarchy)
    const personalityDecision = adaptivePersonalityEngine.resolvePersonality(
      userText,
      emotionResult,
      {
        manualOverride: params.manualPersonalityOverride,
        defaultPreference: params.defaultPersonalityPreference,
        interactionMode: contextResult.interactionMode,
      }
    );

    // 4. Adaptive Response Depth Evaluation (D0-D4)
    const depthDecision = adaptiveResponseDepthEngine.evaluate(
      userText,
      contextResult,
      params.reasoningLevel || 'L1'
    );

    // 5. Conversational Strategy Selection
    const strategy = conversationalStrategyEngine.selectStrategy(
      contextResult,
      emotionResult,
      params.hasToolsToExecute
    );

    // 6. Tone Synthesis
    const tone = toneController.determineTone(
      emotionResult,
      personalityDecision.mode,
      strategy
    );

    const classificationLatencyMs = Math.round((performance.now() - startTime) * 100) / 100;

    const policy: ConversationPolicy = {
      intent: contextResult.intent,
      context: contextResult.currentTask,
      task: contextResult.currentTask,
      category: contextResult.category,
      interactionMode: contextResult.interactionMode,
      emotion_signals: emotionResult.signals,
      emotion_confidence: emotionResult.confidence,
      primary_emotion: emotionResult.primarySignal,
      personality: personalityDecision.mode,
      personality_source: personalityDecision.source,
      tone,
      response_depth: depthDecision.depth,
      strategy,
      language: params.preferredLanguage || 'auto',
      verbosity: depthDecision.verbosity,
      safety_override: emotionResult.safetyOverride || personalityDecision.isSafetySuspended,
      cues: emotionResult.cues,
    };

    // Record developer diagnostics
    aciDiagnostics.record({
      requestId,
      timestamp: Date.now(),
      intent: policy.intent,
      context: policy.context,
      task: policy.task,
      interactionMode: policy.interactionMode,
      emotionSignals: policy.emotion_signals,
      emotionConfidence: policy.emotion_confidence,
      personality: policy.personality,
      personalitySource: policy.personality_source,
      responseDepth: policy.response_depth,
      tone: policy.tone,
      strategy: policy.strategy,
      classificationLatencyMs,
    });

    return { policy, classificationLatencyMs };
  }
}

export const adaptiveConversationController = new AdaptiveConversationController();
