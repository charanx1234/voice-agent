/**
 * FRIDAY Cognitive Engine — Comprehensive Test Suite
 * Tests Adaptive Reasoning (L0-L3), Intent Routing, Context Engine,
 * Model Orchestration, Quality Sanitization, and Latency Monitoring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { intentRouter } from '../src/services/ai/cognitive/intentRouter';
import { complexityRouter } from '../src/services/ai/cognitive/complexityRouter';
import { contextEngine } from '../src/services/ai/cognitive/contextEngine';
import { modelOrchestrator } from '../src/services/ai/cognitive/modelOrchestrator';
import { responseQualityController } from '../src/services/ai/cognitive/responseQuality';
import { latencyMonitor } from '../src/services/ai/cognitive/latencyMonitor';
import { cognitiveController } from '../src/services/ai/cognitive/cognitiveController';
import { providerManager } from '../src/services/ai/providers/providerManager';
import { ChatMessage, ResponseStreamEvent } from '../src/shared/types';

describe('FRIDAY Cognitive Engine V1 Suite', () => {

  describe('1. Intent Router', () => {
    it('classifies simple conversational greeting', () => {
      const res = intentRouter.classify('Hello Friday, good morning!');
      expect(res.category).toBe('general_conversation');
      expect(res.isContextualFollowUp).toBe(false);
    });

    it('classifies desktop automation command', () => {
      const res = intentRouter.classify('Open Chrome and launch Spotify');
      expect(res.category).toBe('desktop_automation');
      expect(res.suggestedTools).toContain('launch_allowed_app');
    });

    it('classifies screen understanding command', () => {
      const res = intentRouter.classify('Analyze my screen and see this error');
      expect(res.category).toBe('screen_understanding');
      expect(res.suggestedTools).toContain('capture_screen');
    });

    it('classifies debugging and error diagnosis', () => {
      const res = intentRouter.classify('I have a nullpointer exception crash in this function');
      expect(res.category).toBe('debugging');
    });

    it('classifies mathematical reasoning query', () => {
      const res = intentRouter.classify('Calculate the derivative of 3x^2 + 4x');
      expect(res.category).toBe('mathematical_reasoning');
    });

    it('recognizes contextual follow-up based on history', () => {
      const history: ChatMessage[] = [
        { id: '1', role: 'user', text: 'My Python script crashes with IndexError' },
        { id: '2', role: 'assistant', text: 'That happens when accessing an element outside list bounds.' }
      ];
      const res = intentRouter.classify('Why is it happening?', history);
      expect(res.isContextualFollowUp).toBe(true);
      expect(res.underlyingIntent).toBe('debugging');
    });
  });

  describe('2. Complexity Router (Adaptive L0-L3)', () => {
    it('evaluates simple greeting as Level 0 (Instant)', () => {
      const intent = intentRouter.classify('Hey Friday');
      const comp = complexityRouter.evaluate('Hey Friday', intent);
      expect(comp.level).toBe('L0');
      expect(comp.requiresDeepContext).toBe(false);
    });

    it('evaluates everyday question as Level 1 (Standard)', () => {
      const intent = intentRouter.classify('What is a REST API?');
      const comp = complexityRouter.evaluate('What is a REST API?', intent);
      expect(comp.level).toBe('L1');
    });

    it('evaluates comparison or debugging as Level 2 (Advanced)', () => {
      const query = 'Compare React state management tradeoffs between Redux Toolkit and Zustand';
      const intent = intentRouter.classify(query);
      const comp = complexityRouter.evaluate(query, intent);
      expect(['L2', 'L3']).toContain(comp.level);
    });

    it('evaluates short but deep distributed architecture problem as Level 3 (Deep Reasoning)', () => {
      const shortDeep = 'Resolve this distributed consensus split-brain race condition in Raft';
      const intent = intentRouter.classify(shortDeep);
      const comp = complexityRouter.evaluate(shortDeep, intent);
      expect(comp.level).toBe('L3');
      expect(comp.requiresDeepContext).toBe(true);
    });

    it('does not classify long but simple message as L3', () => {
      const longSimple = 'Good morning Friday, hope you are having a wonderful day, could you please tell me what time it is?';
      const intent = intentRouter.classify(longSimple);
      const comp = complexityRouter.evaluate(longSimple, intent);
      expect(['L0', 'L1']).toContain(comp.level);
    });
  });

  describe('3. Model Orchestrator', () => {
    it('selects fast model for Level 0 (Instant)', () => {
      const decision = modelOrchestrator.selectModel('L0', 'gemini');
      expect(decision.model).toBe('gemini-3.5-flash-lite');
      expect(decision.reasoningLevel).toBe('L0');
    });

    it('selects high-capability model for Level 3 (Deep Reasoning)', () => {
      const decision = modelOrchestrator.selectModel('L3', 'gemini');
      expect(decision.model).toBe('gemini-3.1-pro-preview');
      expect(decision.reasoningLevel).toBe('L3');
    });

    it('selects balanced model for Level 2 (Advanced)', () => {
      const decision = modelOrchestrator.selectModel('L2', 'gemini');
      expect(decision.model).toBe('gemini-3.5-flash');
      expect(decision.reasoningLevel).toBe('L2');
    });
  });

  describe('4. Context Engine', () => {
    it('assembles immediate messages, situation brief, and memory', async () => {
      const bundle = await contextEngine.assemble(
        'How do I configure Vite?',
        'You are FRIDAY.',
        [
          { id: '1', role: 'user', text: 'I am building an Electron React app.' },
          { id: '2', role: 'assistant', text: 'Vite is great for fast HMR.' }
        ],
        { reasoningLevel: 'L1' }
      );

      expect(bundle.immediateMessages.length).toBe(2);
      expect(bundle.situationBrief).toContain('asking about');
      expect(bundle.estimatedTokens).toBeGreaterThan(0);
      expect(bundle.truncated).toBe(false);
    });

    it('enforces token budget and truncates oldest turns when limit exceeded', async () => {
      const longHistory: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
        id: `h_${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `This is a long turn message number ${i} containing technical text to fill the context buffer.`,
      }));

      const bundle = await contextEngine.assemble(
        'Current question requiring space',
        'You are FRIDAY.',
        longHistory,
        { reasoningLevel: 'L1', budgetTokensOverride: 120 }
      );

      expect(bundle.truncated).toBe(true);
      expect(bundle.immediateMessages.length).toBeLessThan(longHistory.length);
    });
  });

  describe('5. Response Quality Controller', () => {
    it('strips redundant robotic preambles in moderate mode', () => {
      const verbose = 'Sure, I can help with that. The answer is 42.';
      const res = responseQualityController.validateAndSanitize(verbose, false, 'moderate');
      expect(res.sanitizedText).toBe('The answer is 42.');
      expect(res.reasons).toContain('stripped_redundant_preamble');
    });

    it('repairs unclosed code fences automatically', () => {
      const broken = 'Here is your function:\n```typescript\nconst x = 10;';
      const res = responseQualityController.validateAndSanitize(broken, false, 'moderate');
      expect(res.sanitizedText.endsWith('```')).toBe(true);
      expect(res.reasons).toContain('closed_unclosed_code_fence');
    });

    it('flags unverified action claims when no tool ran', () => {
      const claim = 'I have opened Spotify for you.';
      const res = responseQualityController.validateAndSanitize(claim, false, 'moderate');
      expect(res.hasUnverifiedActionClaim).toBe(true);
      expect(res.sanitizedText).toContain('Please verify that the intended desktop action completed');
    });

    it('passes verified action claims when tool succeeded', () => {
      const claim = 'I have opened Spotify for you.';
      const res = responseQualityController.validateAndSanitize(claim, true, 'moderate');
      expect(res.hasUnverifiedActionClaim).toBe(false);
      expect(res.sanitizedText).not.toContain('Please verify');
    });
  });

  describe('6. Latency Monitor', () => {
    it('records phase timings and computes total duration accurately', () => {
      const reqId = 'req_test_metrics';
      latencyMonitor.startRequest(reqId);
      latencyMonitor.startPhase(reqId, 'context_retrieval');
      latencyMonitor.endPhase(reqId, 'context_retrieval');
      const metrics = latencyMonitor.finishRequest(reqId);

      expect(metrics.requestId).toBe(reqId);
      expect(metrics.totalDurationMs).toBeGreaterThan(0);
    });
  });

  describe('7. Unified Cognitive Controller E2E', () => {
    it('handles empty input gracefully with friendly message', async () => {
      const streamEvents: ResponseStreamEvent[] = [];
      const res = await cognitiveController.processRequest(
        { message: '   ', requestId: 'req_empty_test' },
        (ev) => streamEvents.push({ ...ev, requestId: 'req_empty_test' })
      );

      expect(res.error).toBe('EMPTY_USER_MESSAGE');
      expect(res.reasoningLevel).toBe('L0');
      expect(streamEvents.some((e) => e.type === 'complete')).toBe(true);
    });

    it('executes L0 fast local greeting instantly with zero API overhead', async () => {
      const streamEvents: ResponseStreamEvent[] = [];
      const res = await cognitiveController.processRequest(
        { message: 'Good morning Friday!', requestId: 'req_greeting_test' },
        (ev) => streamEvents.push({ ...ev, requestId: 'req_greeting_test' })
      );

      expect(res.reasoningLevel).toBe('L0');
      expect(res.providerUsed).toBe('local_fast');
      expect(res.timing).toBeDefined();
      expect(res.timing?.totalDurationMs).toBeLessThan(100);
      expect(streamEvents.some((e) => e.type === 'complete')).toBe(true);
    });

    it('executes direct desktop app launch via L0 fast path', async () => {
      const res = await cognitiveController.processRequest({
        message: 'open Spotify',
        requestId: 'req_app_launch_test',
      });

      expect(res.reasoningLevel).toBe('L0');
      expect(res.providerUsed).toBe('local_fast');
      expect(res.toolCalls?.length).toBeGreaterThan(0);
    });

    it('cancels active in-flight request on cancelRequest', async () => {
      const reqId = 'req_cancel_test';
      const spy = vi.spyOn(providerManager, 'generate').mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ text: 'done', detectedLanguage: 'en-IN', providerUsed: 'gemini' }), 5000))
      );

      const promise = cognitiveController.processRequest({
        message: 'Explain quantum computing in detail',
        requestId: reqId,
      });

      cognitiveController.cancelRequest(reqId);
      const res = await promise;
      expect(res.cancelled).toBe(true);
      spy.mockRestore();
    });
  });
});
