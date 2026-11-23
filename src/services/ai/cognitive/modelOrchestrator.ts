/**
 * FRIDAY Cognitive Engine — Model Orchestrator (TypeScript)
 * Maps reasoning tiers (L0-L3) to models configured in FRIDAY's existing AI providers.
 */

import { AiProviderId, ReasoningLevel } from '../../../shared/types';
import { settingsStore } from '../../storage/settingsStore';
import { providerManager } from '../providers/providerManager';

export interface ModelSelectionDecision {
  provider: AiProviderId;
  model: string;
  reasoningLevel: ReasoningLevel;
  reason: string;
}

export class ModelOrchestrator {
  public selectModel(
    reasoningLevel: ReasoningLevel,
    overrideProvider?: AiProviderId,
    overrideModel?: string
  ): ModelSelectionDecision {
    const status = providerManager.getStatus();
    const activeProvider = overrideProvider || status.activeProvider || 'gemini';
    const activeConfig = status.providers[activeProvider];
    const configuredModel = overrideModel || activeConfig?.model || 'default';

    // Level 0: Instant -> fastest model
    if (reasoningLevel === 'L0') {
      let chosen = configuredModel;
      if (activeProvider === 'gemini') {
        chosen = 'gemini-3.5-flash-lite';
      } else if (activeProvider === 'openai') {
        chosen = 'gpt-4o-mini';
      } else if (activeProvider === 'anthropic') {
        chosen = 'claude-3-5-haiku-20241022';
      }

      return {
        provider: activeProvider,
        model: chosen,
        reasoningLevel,
        reason: 'Fastest model tier selected for instant conversational turn',
      };
    }

    // Level 3: Deep Reasoning -> highest capability model
    if (reasoningLevel === 'L3') {
      let chosen = configuredModel;
      if (activeProvider === 'gemini') {
        chosen = 'gemini-3.1-pro-preview';
      } else if (activeProvider === 'openai') {
        chosen = 'gpt-4o';
      } else if (activeProvider === 'anthropic') {
        chosen = 'claude-3-5-sonnet-20241022';
      } else if (activeProvider === 'deepseek') {
        chosen = 'deepseek-reasoner';
      }

      return {
        provider: activeProvider,
        model: chosen,
        reasoningLevel,
        reason: 'Deepest reasoning model selected for multi-step / architecture task',
      };
    }

    // Level 2: Advanced -> capable balanced model
    if (reasoningLevel === 'L2') {
      let chosen = configuredModel;
      if (activeProvider === 'gemini') {
        chosen = 'gemini-3.5-flash';
      } else if (activeProvider === 'openai') {
        chosen = 'gpt-4o';
      } else if (activeProvider === 'anthropic') {
        chosen = 'claude-3-5-sonnet-20241022';
      }

      return {
        provider: activeProvider,
        model: chosen,
        reasoningLevel,
        reason: 'Balanced high-performance model selected for technical problem solving',
      };
    }

    // Level 1: Standard -> default configured model
    return {
      provider: activeProvider,
      model: configuredModel,
      reasoningLevel,
      reason: 'Standard configured model selected for everyday conversational task',
    };
  }
}

export const modelOrchestrator = new ModelOrchestrator();
