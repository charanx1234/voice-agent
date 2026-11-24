/**
 * FRIDAY Adaptive Conversational Intelligence (ACI) V1 — Master Verification Suite
 * Tests all 20 required scenarios and acceptance criteria:
 * 1. Casual conversation
 * 2. Technical research
 * 3. Short factual questions
 * 4. Long-form research requests
 * 5. Learning and tutoring
 * 6. Troubleshooting
 * 7. Excitement
 * 8. Frustration
 * 9. Conflicting emotional cues
 * 10. Sarcasm and ambiguous messages
 * 11. Mixed Telugu-English conversations
 * 12. Manual personality override
 * 13. Automatic personality transitions
 * 14. Explicit verbosity instructions
 * 15. Multi-turn context continuity
 * 16. Typed and voice consistency
 * 17. Desktop pet synchronization
 * 18. Streaming and interruption
 * 19. Existing provider integrations
 * 20. Memory and settings preservation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  adaptiveConversationController,
  emotionalSignalAnalyzer,
  contextUnderstandingEngine,
  adaptivePersonalityEngine,
  adaptiveResponseDepthEngine,
  conversationalStrategyEngine,
  toneController,
  userFeedbackLearner,
  aciDiagnostics,
} from '../src/services/ai/aci';
import { cognitiveController } from '../src/services/ai/cognitive/cognitiveController';
import { responseQualityController } from '../src/services/ai/cognitive/responseQuality';
import { selectFaceExpression } from '../src/services/ai/faceExpressions';
import { buildPersonaInstruction } from '../src/services/ai/persona';
import { settingsStore } from '../src/services/storage/settingsStore';
import { ChatMessage } from '../src/shared/types';

describe('FRIDAY Adaptive Conversational Intelligence (ACI) V1 Master Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    aciDiagnostics.clear();
  });

  // 1. Casual conversation
  it('1. Casual conversation: selects natural brief response and direct answer strategy', () => {
    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'Hey Friday, how is your day going?',
      conversationHistory: [],
    });

    expect(policy.interactionMode).toBe('casual_chatting');
    expect(['D0', 'D1']).toContain(policy.response_depth);
    expect(policy.verbosity).toBe('low');
    expect(policy.strategy).toBe('direct_answer');
    expect(policy.tone).toBe('warm_friendly');
  });

  // 2. Technical research
  it('2. Technical research: selects research analysis strategy and structured depth', () => {
    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'Compare PostgreSQL and MongoDB indexing internals, tradeoffs and performance benchmarks',
      conversationHistory: [],
    });

    expect(policy.interactionMode).toBe('researching');
    expect(policy.strategy).toBe('research_analysis');
    expect(policy.response_depth).toBe('D3');
    expect(policy.verbosity).toBe('detailed');
    expect(policy.tone).toBe('analytical_objective');
  });

  // 3. Short factual questions
  it('3. Short factual questions: enforces D0 minimal depth when requested', () => {
    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'What is the capital of France in one word?',
      conversationHistory: [],
    });

    expect(policy.response_depth).toBe('D0');
    expect(policy.verbosity).toBe('minimal');
    expect(policy.strategy).toBe('direct_answer');

    // Quality controller enforcement: strips trailing sentences for D0
    const rawAnswer = 'Paris. It has been the capital since the 10th century and is located on the Seine river.';
    const sanitized = responseQualityController.validateAndSanitize(rawAnswer, false, 'moderate', policy);
    expect(sanitized.sanitizedText).toBe('Paris.');
    expect(sanitized.depthEnforced).toBe(true);
  });

  // 4. Long-form research requests
  it('4. Long-form research requests: supports deep dive D4/D3 architectural depth', () => {
    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'Provide an exhaustive deep dive into distributed Raft consensus algorithm edge cases',
      conversationHistory: [],
    });

    expect(['D3', 'D4']).toContain(policy.response_depth);
    expect(['detailed', 'high']).toContain(policy.verbosity);
    expect(policy.strategy).toBe('research_analysis');
  });

  // 5. Learning and tutoring
  it('5. Learning and tutoring: selects explanation strategy and patient tone', () => {
    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'Can you teach me how React hooks work under the hood? I am curious',
      conversationHistory: [],
    });

    expect(policy.interactionMode).toBe('learning');
    expect(policy.strategy).toBe('explanation');
    expect(policy.emotion_signals).toContain('curiosity');
    expect(policy.tone).toBe('warm_friendly');
  });

  // 6. Troubleshooting
  it('6. Troubleshooting: selects step-by-step strategy and calm supportive tone', () => {
    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'My backend keeps crashing with ECONNREFUSED error when connecting to Redis, how do I fix this bug?',
      conversationHistory: [],
    });

    expect(policy.interactionMode).toBe('troubleshooting');
    expect(policy.strategy).toBe('step_by_step');
    expect(policy.response_depth).toBe('D2');
    expect(policy.tone).toBe('calm_supportive');
  });

  // 7. Excitement
  it('7. Excitement: detects excitement cues with high confidence', () => {
    const emotion = emotionalSignalAnalyzer.analyze('Awesome!! We finally launched the release and it works perfectly!!');
    expect(emotion.signals).toContain('excitement');
    expect(emotion.confidence).toBeGreaterThanOrEqual(0.7);

    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'Awesome!! We finally launched the release and it works perfectly!!',
      defaultPersonalityPreference: 'moderate',
    });
    expect(policy.primary_emotion).toBe('excitement');
  });

  // 8. Frustration
  it('8. Frustration: detects frustration and automatically softens tone', () => {
    const emotion = emotionalSignalAnalyzer.analyze('Why is this stupid bug not working, it keeps failing again and again!');
    expect(emotion.signals).toContain('frustration');
    expect(emotion.confidence).toBeGreaterThanOrEqual(0.75);

    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'Why is this stupid bug not working, it keeps failing again and again!',
      defaultPersonalityPreference: 'roast',
    });
    // Roast is automatically softened during frustration
    expect(policy.personality).toBe('moderate');
    expect(policy.tone).toBe('calm_supportive');
  });

  // 9. Conflicting emotional cues
  it('9. Conflicting emotional cues: simultaneously tracks multiple emotion signals', () => {
    const emotion = emotionalSignalAnalyzer.analyze(
      'I am super excited about the new job offer, but I feel really stressed and overwhelmed about moving.'
    );
    expect(emotion.signals).toContain('excitement');
    expect(emotion.signals).toContain('stress');
    expect(emotion.confidence).toBeGreaterThanOrEqual(0.8);
  });

  // 10. Sarcasm and ambiguous messages
  it('10. Sarcasm and ambiguous messages: detects frustration in sarcastic complaint without mocking user', () => {
    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'Oh brilliant, another segfault in production, just what I needed today.',
      defaultPersonalityPreference: 'roast',
    });

    expect(policy.interactionMode).toBe('troubleshooting');
    expect(policy.personality).toBe('moderate');
    expect(policy.tone).toBe('calm_supportive');
  });

  // 11. Mixed Telugu-English conversations
  it('11. Mixed Telugu-English conversations: classifies context correctly while preserving bilingual register', () => {
    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'Ee React component work avvatledu, error vastundi, fix chey',
      preferredLanguage: 'te-IN',
    });

    expect(policy.interactionMode).toBe('troubleshooting');
    expect(policy.language).toBe('te-IN');
    expect(policy.strategy).toBe('step_by_step');
  });

  // 12. Manual personality override
  it('12. Manual personality override: explicit manual override takes strict priority', () => {
    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'Can you write a binary search algorithm?',
      manualPersonalityOverride: 'simple',
      defaultPersonalityPreference: 'roast',
    });

    expect(policy.personality).toBe('simple');
    expect(policy.personality_source).toBe('manual_override');
  });

  // 13. Automatic personality transitions
  it('13. Automatic personality transitions: auto-switches away from roast when user expresses sadness', () => {
    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'I feel really heartbroken and sad today, having a terrible time.',
      defaultPersonalityPreference: 'roast',
    });

    expect(policy.personality).toBe('simple');
    expect(policy.personality_source).toBe('automatic');
    expect(policy.tone).toBe('gentle_reassuring');
    expect(policy.strategy).toBe('listening_acknowledgement');
  });

  // 14. Explicit verbosity instructions
  it('14. Explicit verbosity instructions: immediately adapts depth and verbosity via feedback learner', () => {
    const feedback = userFeedbackLearner.analyzeFeedback('Too long, please make it shorter.');
    expect(feedback.detected).toBe(true);
    expect(feedback.type).toBe('verbosity_reduction');

    const basePolicy = adaptiveConversationController.evaluatePolicy({
      message: 'Explain how neural networks work',
    }).policy;

    const adaptedPolicy = userFeedbackLearner.applyFeedback(basePolicy, feedback);
    expect(adaptedPolicy.response_depth).toBe('D1');
    expect(adaptedPolicy.verbosity).toBe('low');
  });

  // 15. Multi-turn context continuity
  it('15. Multi-turn context continuity: inherits task and mode on follow-up questions', () => {
    const history: ChatMessage[] = [
      { id: '1', role: 'user', text: 'I am troubleshooting my microphone on Windows 11', timestamp: 1 },
      { id: '2', role: 'assistant', text: 'Check Windows Sound Settings and verify device permissions.', timestamp: 2 },
    ];

    const context = contextUnderstandingEngine.analyze('What about the drivers?', history);
    expect(context.interactionMode).toBe('troubleshooting');
    expect(context.isMultiTurnFollowUp).toBe(true);
    expect(context.previousRelevantReferences.length).toBeGreaterThan(0);
  });

  // 16. Typed and voice consistency
  it('16. Typed and voice consistency: produces identical conversation policy regardless of input modality', () => {
    const textQuery = 'Explain what a deadlock is in database systems';
    const textPolicy = adaptiveConversationController.evaluatePolicy({
      message: textQuery,
    }).policy;

    const voicePolicy = adaptiveConversationController.evaluatePolicy({
      message: textQuery,
      prosody: { peakLevel: 0.4, durationMs: 2200 },
    }).policy;

    expect(textPolicy.intent).toBe(voicePolicy.intent);
    expect(textPolicy.personality).toBe(voicePolicy.personality);
    expect(textPolicy.response_depth).toBe(voicePolicy.response_depth);
    expect(textPolicy.strategy).toBe(voicePolicy.strategy);
  });

  // 17. Desktop pet synchronization
  it('17. Desktop pet synchronization: maps policy emotional signals to face expressions', () => {
    const angryExpr = selectFaceExpression({
      state: 'speaking',
      conversationPolicy: { primary_emotion: 'frustration', personality: 'moderate' },
    });
    expect(angryExpr).toBe('angry');

    const happyExpr = selectFaceExpression({
      state: 'speaking',
      conversationPolicy: { primary_emotion: 'excitement', personality: 'moderate' },
    });
    expect(happyExpr).toBe('happy');

    const sadExpr = selectFaceExpression({
      state: 'speaking',
      conversationPolicy: { primary_emotion: 'sadness', personality: 'simple' },
    });
    expect(sadExpr).toBe('sad');
  });

  // 18. Streaming and interruption
  it('18. Streaming and interruption: retains cancellation support in cognitive controller', async () => {
    const streamEvents: any[] = [];
    const controllerPromise = cognitiveController.processRequest(
      {
        message: 'A very long architectural dissertation',
        requestId: 'req_cancel_test',
      },
      (ev) => streamEvents.push(ev)
    );

    // Cancel in-flight
    cognitiveController.cancelRequest('req_cancel_test');
    const result = await controllerPromise;
    expect(result.cancelled).toBe(true);
  });

  // 19. Existing provider integrations
  it('19. Existing provider integrations: builds full persona instruction with ACI policy', () => {
    const { policy } = adaptiveConversationController.evaluatePolicy({
      message: 'Write a quick python script',
    });

    const instruction = buildPersonaInstruction({
      preferredLanguage: 'en-IN',
      personalityMode: 'moderate',
      conversationPolicy: policy,
    });

    expect(instruction).toContain('ADAPTIVE CONVERSATIONAL INTELLIGENCE (ACI V1)');
    expect(instruction).toContain(policy.intent);
    expect(instruction).toContain(policy.response_depth);
    expect(instruction).toContain(policy.tone);
  });

  // 20. Memory and settings preservation
  it('20. Memory and settings preservation: persists only permanent settings, never transient emotions', () => {
    const saveSpy = vi.spyOn(settingsStore, 'saveSettings');

    // 1. Transient emotion: should NOT save permanent setting
    const transientFeedback = userFeedbackLearner.analyzeFeedback('I feel so stressed today.');
    expect(transientFeedback.persistPreference).toBe(false);

    // 2. Explicit permanent preference: "Always talk normally"
    const permanentFeedback = userFeedbackLearner.analyzeFeedback('From now on always talk normally.');
    expect(permanentFeedback.persistPreference).toBe(true);

    const basePolicy = adaptiveConversationController.evaluatePolicy({ message: 'Hello' }).policy;
    userFeedbackLearner.applyFeedback(basePolicy, permanentFeedback);
    expect(saveSpy).toHaveBeenCalledWith({ personalityMode: 'moderate' });
  });
});
