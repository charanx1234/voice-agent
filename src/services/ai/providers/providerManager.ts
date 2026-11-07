import {
  AiProviderConfig,
  AiProviderId,
  AiProviderStatus,
  ResponseStreamEvent,
} from '../../../shared/types';
import { settingsStore } from '../../storage/settingsStore';
import { OpenAiCompatibleProvider } from './openaiCompatibleProvider';
import { AnthropicProvider } from './anthropicProvider';
import { IAiProvider, ProviderConnectionTestResult, ProviderGenerateParams, ProviderGenerateResult } from './types';
import { geminiService } from '../gemini';
import { classifyFridayError } from '../../error/errorHandler';
import { fastLocalIntentRouter } from '../../agent/fastLocalIntent';

const DEFAULT_MODELS: Record<AiProviderId, string[]> = {
  gemini: ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1-mini'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  openrouter: ['google/gemini-3.1-pro-preview', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  mistral: ['mistral-large-latest', 'codestral-latest'],
  custom: ['gpt-4o', 'default'],
};

export class ProviderManager {
  private providers = new Map<AiProviderId, IAiProvider>();

  constructor() {
    this.providers.set('openai', new OpenAiCompatibleProvider('openai', 'OpenAI'));
    this.providers.set('openrouter', new OpenAiCompatibleProvider('openrouter', 'OpenRouter'));
    this.providers.set('deepseek', new OpenAiCompatibleProvider('deepseek', 'DeepSeek'));
    this.providers.set('groq', new OpenAiCompatibleProvider('groq', 'Groq'));
    this.providers.set('mistral', new OpenAiCompatibleProvider('mistral', 'Mistral'));
    this.providers.set('custom', new OpenAiCompatibleProvider('custom', 'Custom Endpoint'));
    this.providers.set('anthropic', new AnthropicProvider());
  }

  public getStatus(): AiProviderStatus {
    const settings = settingsStore.getSettings();
    const activeProvider = (settings.aiProvider as AiProviderId) || 'gemini';
    const fallbackProvider = settings.fallbackAiProvider as AiProviderId | undefined;

    const savedConfigs = settings.providerConfigs || {};

    const providersRecord: Record<AiProviderId, AiProviderConfig> = {
      gemini: {
        id: 'gemini',
        name: 'Google Gemini',
        apiKey: settings.apiKey || '',
        hasKey: Boolean(settings.apiKey || process.env.GEMINI_API_KEY),
        model: settings.modelName || 'gemini-3.1-pro-preview',
        availableModels: DEFAULT_MODELS.gemini,
        enabled: true,
        status: settings.apiKey ? 'connected' : 'disconnected',
      },
      openai: this.buildConfig('openai', 'OpenAI', savedConfigs.openai),
      anthropic: this.buildConfig('anthropic', 'Anthropic Claude', savedConfigs.anthropic),
      openrouter: this.buildConfig('openrouter', 'OpenRouter', savedConfigs.openrouter),
      deepseek: this.buildConfig('deepseek', 'DeepSeek', savedConfigs.deepseek),
      groq: this.buildConfig('groq', 'Groq', savedConfigs.groq),
      mistral: this.buildConfig('mistral', 'Mistral', savedConfigs.mistral),
      custom: this.buildConfig('custom', 'Custom Endpoint', savedConfigs.custom),
    };

    return {
      activeProvider,
      fallbackProvider,
      providers: providersRecord,
    };
  }

  private buildConfig(
    id: AiProviderId,
    name: string,
    saved?: Partial<AiProviderConfig>
  ): AiProviderConfig {
    const defaultModel = DEFAULT_MODELS[id]?.[0] || 'default';
    const apiKey = saved?.apiKey || '';
    return {
      id,
      name,
      apiKey,
      hasKey: Boolean(apiKey),
      model: saved?.model || defaultModel,
      availableModels: DEFAULT_MODELS[id] || [defaultModel],
      baseUrl: saved?.baseUrl,
      enabled: saved?.enabled !== false,
      status: apiKey ? 'connected' : 'disconnected',
      lastError: saved?.lastError,
    };
  }

  public saveConfig(id: AiProviderId, patch: Partial<AiProviderConfig>): boolean {
    const settings = settingsStore.getSettings();
    const current = settings.providerConfigs || {};
    const existing = current[id] || {};

    const updated = {
      ...current,
      [id]: {
        ...existing,
        ...patch,
      },
    };

    if (id === 'gemini') {
      if (patch.apiKey !== undefined) settingsStore.saveSettings({ apiKey: patch.apiKey });
      if (patch.model !== undefined) settingsStore.saveSettings({ modelName: patch.model });
    }

    settingsStore.saveSettings({ providerConfigs: updated });
    return true;
  }

  public setActiveProvider(provider: AiProviderId, fallback?: AiProviderId): boolean {
    settingsStore.saveSettings({
      aiProvider: provider,
      fallbackAiProvider: fallback,
    });
    return true;
  }

  public async testConnection(id: AiProviderId): Promise<ProviderConnectionTestResult> {
    const status = this.getStatus();
    const config = status.providers[id];

    if (id === 'gemini') {
      const res = await geminiService.testConnection(config?.apiKey);
      return { success: res.success, message: res.message, model: res.model };
    }

    const providerImpl = this.providers.get(id);
    if (!providerImpl) {
      return { success: false, message: `Unsupported provider: ${id}` };
    }

    return await providerImpl.testConnection(config?.apiKey, config?.model, config?.baseUrl);
  }

  public async generate(
    params: ProviderGenerateParams,
    onStream?: (event: Omit<ResponseStreamEvent, 'requestId'>) => void
  ): Promise<ProviderGenerateResult> {
    const userText = (params?.message || '').trim();

    // Prevent empty or whitespace-only queries from generating requests to AI providers
    if (!userText && !params?.audioBase64) {
      const settings = settingsStore.getSettings();
      const preferredLang = params?.language || settings.preferredLanguage || 'en-IN';
      const errMessage = preferredLang.startsWith('te')
        ? 'మీరు చెప్పింది నాకు వినిపించలేదు. దయచేసి మళ్ళీ చెప్పండి లేదా టైప్ చేయండి.'
        : "I didn't catch that. Please speak or type your request.";
      onStream?.({ type: 'delta', text: errMessage });
      onStream?.({ type: 'complete' });
      return {
        text: errMessage,
        detectedLanguage: preferredLang,
        providerUsed: 'local_fast',
        error: 'EMPTY_USER_MESSAGE',
      };
    }

    // Fast local intent execution (<50ms) for app controls, media, volume, time, date, window
    if (!params.audioBase64 && userText) {
      const settings = settingsStore.getSettings();
      const preferredLang = params.language || settings.preferredLanguage || 'en-IN';
      const fastResult = await fastLocalIntentRouter.tryRoute(
        userText,
        preferredLang,
        settings.personalityMode
      );
      if (fastResult?.matched) {
        onStream?.({ type: 'delta', text: fastResult.response });
        onStream?.({ type: 'complete' });
        return {
          text: fastResult.response,
          detectedLanguage: preferredLang,
          toolCalls: fastResult.toolCalls as any,
          providerUsed: 'local_fast',
        };
      }
    }

    const status = this.getStatus();
    const primaryId = status.activeProvider;
    const fallbackId = status.fallbackProvider;

    try {
      return await this.dispatchProvider(primaryId, params, onStream);
    } catch (primaryErr: any) {
      console.warn(`[ProviderManager] Primary provider "${primaryId}" failed:`, primaryErr?.message);

      // Determine fallback provider: explicit fallback or any configured provider with an active key
      let targetFallbackId = (fallbackId && fallbackId !== primaryId) ? fallbackId : undefined;
      if (!targetFallbackId) {
        const candidate = (Object.keys(status.providers) as AiProviderId[]).find(
          (pId) => pId !== primaryId && status.providers[pId]?.hasKey && status.providers[pId]?.enabled
        );
        if (candidate) {
          targetFallbackId = candidate;
        }
      }

      if (targetFallbackId) {
        const fallbackConfig = status.providers[targetFallbackId];
        if (fallbackConfig && fallbackConfig.hasKey) {
          onStream?.({
            type: 'delta',
            text: `[Primary provider ${primaryId} unavailable; falling back to ${fallbackConfig.name}...]\n`,
          });
          console.info(`[ProviderManager] Switching to fallback provider "${targetFallbackId}".`);
          return await this.dispatchProvider(targetFallbackId, params, onStream);
        }
      }

      const classified = classifyFridayError(primaryErr, { provider: primaryId, query: params.message });
      return {
        text: classified.userMessage,
        detectedLanguage: params.language || 'en-IN',
        providerUsed: primaryId,
        error: primaryErr?.message,
      };
    }
  }

  private async dispatchProvider(
    id: AiProviderId,
    params: ProviderGenerateParams,
    onStream?: (event: Omit<ResponseStreamEvent, 'requestId'>) => void
  ): Promise<ProviderGenerateResult> {
    if (id === 'gemini') {
      const result = await geminiService.sendMessage(
        {
          message: params.message,
          audioBase64: params.audioBase64,
          audioMimeType: params.audioMimeType,
          conversationHistory: params.conversationHistory,
          language: params.language,
          prosody: params.prosody,
          requestId: params.requestId,
        },
        { onStream }
      );
      return {
        text: result.text,
        detectedLanguage: result.detectedLanguage,
        toolCalls: result.toolCalls,
        mood: result.mood,
        safetyOverride: result.safetyOverride,
        providerUsed: 'gemini',
      };
    }

    const providerImpl = this.providers.get(id);
    if (!providerImpl) {
      throw new Error(`AI provider "${id}" is not supported.`);
    }

    const config = this.getStatus().providers[id];
    return await providerImpl.generate(params, config, onStream);
  }
}

export const providerManager = new ProviderManager();
