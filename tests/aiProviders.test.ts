import { describe, it, expect } from 'vitest';
import { providerManager } from '../src/services/ai/providers/providerManager';
import { OpenAiCompatibleProvider } from '../src/services/ai/providers/openaiCompatibleProvider';
import { AnthropicProvider } from '../src/services/ai/providers/anthropicProvider';

describe('Modular AI Providers and Fallback Architecture', () => {
  it('initializes supported AI providers', () => {
    const status = providerManager.getStatus();
    expect(status.providers.gemini).toBeDefined();
    expect(status.providers.openai).toBeDefined();
    expect(status.providers.anthropic).toBeDefined();
    expect(status.providers.openrouter).toBeDefined();
    expect(status.providers.deepseek).toBeDefined();
    expect(status.providers.groq).toBeDefined();
    expect(status.providers.mistral).toBeDefined();
    expect(status.providers.custom).toBeDefined();
  });

  it('allows setting active and fallback providers', () => {
    providerManager.setActiveProvider('gemini', 'openai');
    const status = providerManager.getStatus();
    expect(status.activeProvider).toBe('gemini');
    expect(status.fallbackProvider).toBe('openai');
  });

  it('saves provider configuration securely', () => {
    providerManager.saveConfig('groq', {
      apiKey: 'gsk_test_key_sample',
      model: 'llama-3.3-70b-versatile',
    });

    const status = providerManager.getStatus();
    expect(status.providers.groq.hasKey).toBe(true);
    expect(status.providers.groq.model).toBe('llama-3.3-70b-versatile');
  });

  it('rejects connection test when API key is missing', async () => {
    const openai = new OpenAiCompatibleProvider('openai', 'OpenAI');
    const result = await openai.testConnection('');
    expect(result.success).toBe(false);
    expect(result.message).toContain('No API key provided');
  });

  it('rejects Anthropic connection test when API key is missing', async () => {
    const claude = new AnthropicProvider();
    const result = await claude.testConnection('');
    expect(result.success).toBe(false);
    expect(result.message).toContain('No Anthropic API key provided');
  });
});
