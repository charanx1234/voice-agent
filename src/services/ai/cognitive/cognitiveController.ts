/**
 * FRIDAY Cognitive Engine — Central Cognitive Controller (TypeScript)
 * The unified intelligence layer binding all AI requests across typed chat,
 * voice conversation, desktop pet, and system quicktools.
 */

import {
  AiProviderId,
  ChatMessage,
  CognitiveExecutionResult,
  ReasoningLevel,
  ResponseStreamEvent,
} from '../../../shared/types';
import { settingsStore } from '../../storage/settingsStore';
import { providerManager } from '../providers/providerManager';
import { geminiService } from '../gemini';
import { memoryService } from '../../memory/memoryService';
import { intentRouter, IntentClassificationResult } from './intentRouter';
import { complexityRouter, ComplexityEvaluationResult } from './complexityRouter';
import { modelOrchestrator } from './modelOrchestrator';
import { contextEngine } from './contextEngine';
import { responseQualityController } from './responseQuality';
import { latencyMonitor } from './latencyMonitor';
import { ProviderGenerateParams, ProviderGenerateResult } from '../providers/types';
import { fastLocalIntentRouter } from '../../agent/fastLocalIntent';
import { extractDirectLaunchApp, displayNameForAppQuery } from '../../agent/appShortcutsTool';
import { toolRegistry } from '../../agent/toolRegistry';
import { getLocalResponse } from '../localResponses';
import { analyzeMood } from '../mood';
import { isForeignAssistantCommand } from '../../agent/voiceActionGuard';

export interface ProcessCognitiveRequestParams extends ProviderGenerateParams {
  inputSource?: 'text' | 'voice' | 'pet' | 'quicktools';
  overrideReasoningLevel?: ReasoningLevel;
}

export class CognitiveController {
  private activeControllers = new Map<string, AbortController>();

  /**
   * Primary entry point for AI inference requests in FRIDAY.
   */
  public async processRequest(
    params: ProcessCognitiveRequestParams,
    onStream?: (event: Omit<ResponseStreamEvent, 'requestId'>) => void
  ): Promise<CognitiveExecutionResult> {
    const requestId = params.requestId || `req_${Date.now()}`;
    const userText = (params.message || '').trim();
    const settings = settingsStore.getSettings();
    const preferredLang = params.language || settings.preferredLanguage || 'en-IN';
    const rawHistory = Array.isArray(params.conversationHistory) ? params.conversationHistory : [];
    const inputSource = params.inputSource || (params.audioBase64 ? 'voice' : 'text');

    // 1. Initialize performance timing
    latencyMonitor.startRequest(requestId);

    const abortController = new AbortController();
    this.activeControllers.set(requestId, abortController);
    abortController.signal.addEventListener('abort', () => {
      geminiService.cancelRequest(requestId);
    });

    // Track stream timing
    let firstTokenRecorded = false;
    const instrumentedStream = (event: Omit<ResponseStreamEvent, 'requestId'>) => {
      if (abortController.signal.aborted) return;
      if (event.type === 'delta' && event.text && !firstTokenRecorded) {
        firstTokenRecorded = true;
        latencyMonitor.recordFirstToken(requestId);
      }
      onStream?.(event);
    };

    try {
      // 2. Empty / silence check
      if (!userText && !params.audioBase64) {
        const errMessage = preferredLang.startsWith('te')
          ? 'మీరు చెప్పింది నాకు వినిపించలేదు. దయచేసి మళ్ళీ చెప్పండి లేదా టైప్ చేయండి.'
          : "I didn't catch that. Please speak or type your request.";
        instrumentedStream({ type: 'delta', text: errMessage });
        instrumentedStream({ type: 'complete' });

        const timing = latencyMonitor.finishRequest(requestId);
        return {
          text: errMessage,
          detectedLanguage: preferredLang,
          reasoningLevel: 'L0',
          intentCategory: 'general_conversation',
          providerUsed: 'local_fast',
          modelUsed: 'empty_input',
          error: 'EMPTY_USER_MESSAGE',
          timing,
        };
      }

      // 3. Mood Analysis & Foreign Command Check
      const moodAnalysis = analyzeMood(userText, params.prosody);
      if (isForeignAssistantCommand(userText)) {
        const response = preferredLang.startsWith('te')
          ? 'ఆ కమాండ్ వేరే అసిస్టెంట్‌కి (Google/Siri/Alexa) ఉద్దేశించినది కాబట్టి నేను ఎటువంటి డెస్క్‌టాప్ యాక్షన్ చేయలేదు.'
          : 'That command was addressed to another assistant (Google/Siri/Alexa). Desktop actions were blocked for security.';
        instrumentedStream({ type: 'delta', text: response });
        instrumentedStream({ type: 'complete' });
        void memoryService.appendExchange(userText, response, { language: preferredLang });

        const timing = latencyMonitor.finishRequest(requestId);
        return {
          text: response,
          detectedLanguage: preferredLang,
          reasoningLevel: 'L0',
          intentCategory: 'desktop_automation',
          providerUsed: 'local_fast',
          modelUsed: 'security_guard',
          mood: moodAnalysis.mood,
          safetyOverride: moodAnalysis.safetyOverride,
          timing,
        };
      }

      // 4. Intent Classification
      latencyMonitor.startPhase(requestId, 'intent_routing');
      const intentResult: IntentClassificationResult = intentRouter.classify(
        userText,
        rawHistory
      );
      latencyMonitor.endPhase(requestId, 'intent_routing');

      // 5. Adaptive Complexity Routing
      latencyMonitor.startPhase(requestId, 'complexity_routing');
      let complexityResult: ComplexityEvaluationResult;
      if (params.overrideReasoningLevel) {
        complexityResult = {
          level: params.overrideReasoningLevel,
          score: 0.5,
          reason: 'Explicitly requested override',
          detectedFactors: ['override'],
          requiresTools: false,
          requiresDeepContext: params.overrideReasoningLevel === 'L2' || params.overrideReasoningLevel === 'L3',
        };
      } else if (settings.adaptiveThinkingEnabled === false) {
        const defaultTier = (settings.defaultReasoningLevel as ReasoningLevel) || 'L1';
        complexityResult = {
          level: defaultTier === ('adaptive' as any) ? 'L1' : defaultTier,
          score: 0.5,
          reason: 'Adaptive thinking disabled; using user default level',
          detectedFactors: ['adaptive_disabled'],
          requiresTools: false,
          requiresDeepContext: false,
        };
      } else {
        complexityResult = complexityRouter.evaluate(userText, intentResult, rawHistory);
      }
      latencyMonitor.endPhase(requestId, 'complexity_routing');

      // 6. FAST PATH: Level 0 (Instant) Local Execution (<50ms)
      if (complexityResult.level === 'L0' && !params.audioBase64) {
        // A. Fast Local Intent (volume, brightness, weather, time, media, battery)
        const fastResult = await fastLocalIntentRouter.tryRoute(
          userText,
          preferredLang,
          settings.personalityMode
        );
        if (fastResult?.matched) {
          instrumentedStream({ type: 'delta', text: fastResult.response });
          instrumentedStream({ type: 'complete' });
          void memoryService.appendExchange(userText, fastResult.response, {
            language: preferredLang,
          });

          const timing = latencyMonitor.finishRequest(requestId);
          latencyMonitor.logSummary(timing, {
            source: inputSource,
            level: 'L0',
            intent: intentResult.category,
            model: 'fast_local_intent',
          });

          return {
            text: fastResult.response,
            detectedLanguage: preferredLang,
            reasoningLevel: 'L0',
            intentCategory: intentResult.category,
            providerUsed: 'local_fast',
            modelUsed: 'fast_local_intent',
            toolCalls: fastResult.toolCalls as any,
            mood: moodAnalysis.mood,
            safetyOverride: moodAnalysis.safetyOverride,
            timing,
          };
        }

        // B. Direct Application Launch (e.g. "open Spotify")
        const directLaunch = extractDirectLaunchApp(userText);
        if (directLaunch) {
          const appName = displayNameForAppQuery(directLaunch);
          const needsConfirmation = settings.requireToolConfirmations.launchApps;
          if (!needsConfirmation) instrumentedStream({ type: 'delta', text: `Opening ${appName}.` });

          const launchResult = await toolRegistry.executeTool('launch_allowed_app', {
            appId: directLaunch,
          });
          const success = launchResult?.success;
          const replyText = success ? `${appName} is ready.` : (launchResult?.error || `I couldn't open ${appName}.`);

          if (needsConfirmation && success) instrumentedStream({ type: 'delta', text: `Opening ${appName}.` });
          instrumentedStream({ type: 'delta', text: success ? ` ${appName} is ready.` : replyText });
          instrumentedStream({ type: 'complete' });

          const timing = latencyMonitor.finishRequest(requestId);
          return {
            text: replyText,
            detectedLanguage: preferredLang,
            reasoningLevel: 'L0',
            intentCategory: 'desktop_automation',
            providerUsed: 'local_fast',
            modelUsed: 'direct_app_launch',
            toolCalls: [
              {
                toolName: 'launch_allowed_app',
                args: { appId: directLaunch },
                result: launchResult,
                status: success ? 'completed' : 'failed',
              },
            ],
            mood: moodAnalysis.mood,
            safetyOverride: moodAnalysis.safetyOverride,
            timing,
          };
        }

        // C. Canned Greetings / Local Responses
        const localResponse = getLocalResponse(userText, preferredLang, settings.personalityMode);
        if (localResponse) {
          instrumentedStream({ type: 'delta', text: localResponse.text });
          instrumentedStream({ type: 'complete' });
          void memoryService.appendExchange(userText, localResponse.text, {
            language: localResponse.detectedLanguage,
          });

          const timing = latencyMonitor.finishRequest(requestId);
          return {
            text: localResponse.text,
            detectedLanguage: localResponse.detectedLanguage,
            reasoningLevel: 'L0',
            intentCategory: 'general_conversation',
            providerUsed: 'local_fast',
            modelUsed: 'local_response',
            mood: moodAnalysis.mood,
            safetyOverride: moodAnalysis.safetyOverride,
            timing,
          };
        }
      }

      // 7. Model Selection
      const modelDecision = modelOrchestrator.selectModel(
        complexityResult.level,
        settings.aiProvider,
        settings.modelName
      );

      // 8. Context Assembly (Layers 1, 2, 3)
      latencyMonitor.startPhase(requestId, 'context_retrieval');
      const contextBundle = await contextEngine.assemble(
        userText,
        'You are FRIDAY, an intelligent and helpful desktop companion.',
        rawHistory,
        {
          reasoningLevel: complexityResult.level,
          personalityMode: settings.personalityMode,
          budgetTokensOverride: settings.maxContextBudgetTokens,
        }
      );
      latencyMonitor.endPhase(requestId, 'context_retrieval');

      // 9. Model Execution with Provider Manager
      latencyMonitor.startPhase(requestId, 'model_execution');

      const executePayload: ProviderGenerateParams = {
        ...params,
        requestId,
        // Forward reasoning level and selected model
        conversationHistory: contextBundle.immediateMessages,
      };

      // Temporarily set active model in settings if reasoning level warrants it
      let restoreModel: string | undefined = undefined;
      if (modelDecision.model && modelDecision.model !== settings.modelName) {
        restoreModel = settings.modelName;
        settingsStore.saveSettings({ modelName: modelDecision.model });
      }

      if (abortController.signal.aborted) {
        instrumentedStream({ type: 'cancelled' });
        const timing = latencyMonitor.finishRequest(requestId);
        return {
          text: '',
          detectedLanguage: preferredLang,
          reasoningLevel: complexityResult.level,
          intentCategory: intentResult.category,
          providerUsed: 'none',
          modelUsed: 'none',
          cancelled: true,
          timing,
        };
      }

      let genResult: ProviderGenerateResult;
      try {
        genResult = await providerManager.generate(executePayload, instrumentedStream);
      } finally {
        if (restoreModel) {
          settingsStore.saveSettings({ modelName: restoreModel });
        }
      }

      latencyMonitor.endPhase(requestId, 'model_execution');

      // 10. Quality Control Sanitization
      const toolSuccess = Array.isArray(genResult.toolCalls) && genResult.toolCalls.length > 0;
      const sanitized = responseQualityController.validateAndSanitize(
        genResult.text,
        toolSuccess,
        settings.personalityMode
      );

      const timing = latencyMonitor.finishRequest(requestId);
      latencyMonitor.logSummary(timing, {
        source: inputSource,
        level: complexityResult.level,
        intent: intentResult.category,
        model: `${genResult.providerUsed}:${modelDecision.model}`,
      });

      return {
        text: sanitized.sanitizedText,
        detectedLanguage: genResult.detectedLanguage || preferredLang,
        reasoningLevel: complexityResult.level,
        intentCategory: intentResult.category,
        providerUsed: genResult.providerUsed || modelDecision.provider,
        modelUsed: modelDecision.model,
        toolCalls: genResult.toolCalls,
        mood: genResult.mood || moodAnalysis.mood,
        safetyOverride: genResult.safetyOverride || moodAnalysis.safetyOverride,
        cancelled: abortController.signal.aborted,
        error: genResult.error,
        timing,
      };
    } catch (err: any) {
      if (abortController.signal.aborted) {
        instrumentedStream({ type: 'cancelled' });
        const timing = latencyMonitor.finishRequest(requestId);
        return {
          text: '',
          detectedLanguage: preferredLang,
          reasoningLevel: 'L1',
          intentCategory: 'general_conversation',
          providerUsed: 'none',
          modelUsed: 'none',
          cancelled: true,
          timing,
        };
      }

      console.error('[CognitiveController] Execution failed:', err);
      const errMsg = err?.message || 'Processing error';
      instrumentedStream({ type: 'error', error: errMsg });

      const timing = latencyMonitor.finishRequest(requestId);
      return {
        text: "I ran into a brief hiccup while processing that. I'm right here though -- what can I do for you?",
        detectedLanguage: preferredLang,
        reasoningLevel: 'L1',
        intentCategory: 'general_conversation',
        providerUsed: 'fallback',
        modelUsed: 'error_handler',
        error: errMsg,
        timing,
      };
    } finally {
      this.activeControllers.delete(requestId);
    }
  }

  /**
   * Cancels an active in-flight request.
   */
  public cancelRequest(requestId?: string): void {
    if (requestId) {
      this.activeControllers.get(requestId)?.abort();
      this.activeControllers.delete(requestId);
      geminiService.cancelRequest(requestId);
      return;
    }
    for (const ctrl of this.activeControllers.values()) {
      try {
        ctrl.abort();
      } catch {}
    }
    this.activeControllers.clear();
    geminiService.cancelAll();
  }
}

export const cognitiveController = new CognitiveController();
