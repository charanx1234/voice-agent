import { GoogleGenerativeAI } from '@google/generative-ai';
import { settingsStore } from '../storage/settingsStore';
import { buildSystemInstruction } from './personality';
import { buildConversationBrief } from './conversationContext';
import { toolRegistry } from '../agent/toolRegistry';
import { memoryService } from '../memory/memoryService';
import { ChatMessage, ToolCallRecord } from '../../shared/types';
import { detectLanguageFromText } from '../voice/languages';

/**
 * Models tried, in order, when the configured model is unavailable.
 * Gemini model names churn quickly, so a configured name can start returning
 * 404 even though the key itself is perfectly valid.
 */
const MODEL_FALLBACKS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-lite-latest',
];

/** Ordered, de-duplicated list of models to attempt for a request. */
export function buildModelCandidates(configured?: string): string[] {
  const ordered = [configured?.trim(), ...MODEL_FALLBACKS].filter(
    (model): model is string => Boolean(model && model.length > 0)
  );
  return Array.from(new Set(ordered));
}

/** True when an API error means "this model cannot serve requests", not "the request failed". */
export function isModelUnavailableError(err: any): boolean {
  const message = String(err?.message || err || '').toLowerCase();
  return (
    message.includes('404') ||
    message.includes('not found') ||
    message.includes('is not supported') ||
    message.includes('does not exist') ||
    message.includes('unsupported model')
  );
}

/**
 * Gemini rejects a chat history that does not start with a user turn or that
 * repeats a role. FRIDAY's transcript starts with its own greeting, so the
 * history has to be cleaned before it is handed to the SDK.
 */
export function normalizeConversationHistory(history: ChatMessage[]): ChatMessage[] {
  const normalized: ChatMessage[] = [];

  for (const msg of history) {
    if (msg.role === 'system' || msg.isError) continue;
    if (!msg.text || !msg.text.trim()) continue;

    const last = normalized[normalized.length - 1];

    if (!last) {
      // The first turn must come from the user; drop leading greetings/errors.
      if (msg.role !== 'user') continue;
      normalized.push({ ...msg });
      continue;
    }

    if (last.role === msg.role) {
      // Merge same-role neighbours so turns strictly alternate.
      last.text = `${last.text}\n\n${msg.text}`;
      continue;
    }

    normalized.push({ ...msg });
  }

  return normalized;
}

/**
 * Builds the turn that carries tool results back to the model.
 * The Gemini API rejects the legacy "function" role, so results go back as a user turn.
 */
export function buildToolResponseTurn(functionResponses: any[]): { role: 'user'; parts: any[] } {
  return { role: 'user', parts: functionResponses };
}

export interface SendMessageParams {
  message: string;
  audioBase64?: string;
  audioMimeType?: string;
  conversationHistory: ChatMessage[];
  language?: string;
}

export interface SendMessageResult {
  text: string;
  detectedLanguage: string;
  toolCalls?: ToolCallRecord[];
  error?: string;
}

export class GeminiService {
  private getClient(apiKeyOverride?: string): GoogleGenerativeAI {
    const key = apiKeyOverride || settingsStore.getRawApiKey();
    if (!key) {
      throw new Error(
        'Gemini API key is not configured. Please enter your API key in Settings or set GEMINI_API_KEY in .env.'
      );
    }
    return new GoogleGenerativeAI(key);
  }

  public async testConnection(apiKeyOverride?: string): Promise<{
    success: boolean;
    message: string;
    model?: string;
  }> {
    const settings = settingsStore.getSettings();
    const candidateModels = buildModelCandidates(settings.modelName);

    let lastError: any = null;
    for (const modelCandidate of candidateModels) {
      try {
        const client = this.getClient(apiKeyOverride);
        const model = client.getGenerativeModel({ model: modelCandidate });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: 'Respond with just "OK".' }] }],
        });
        const response = await result.response;
        const text = response.text();

        // Save verified working model in settings
        settingsStore.saveSettings({ modelName: modelCandidate });

        return {
          success: true,
          message: `Connected successfully to Gemini (${modelCandidate})! Response: "${text.trim()}".`,
          model: modelCandidate,
        };
      } catch (err: any) {
        lastError = err;
      }
    }

    return {
      success: false,
      message: `Connection test failed: ${lastError?.message || 'Unknown API error'}.`,
    };
  }

  public async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const settings = settingsStore.getSettings();
    const preferredLang = params.language || settings.preferredLanguage || 'te-IN';
    const candidates = buildModelCandidates(settings.modelName);
    const userText = (params.message || '').trim();

    // Local, per-turn situation brief: mode, topic, follow-up, stated constraints.
    const conversationBrief = buildConversationBrief(params.conversationHistory, userText || 'voice message').text;

    // Long-term memory is retrieved once per turn and injected as system context.
    let memoryBlock = '';
    try {
      memoryBlock = await memoryService.buildContextBlock(userText || 'voice message');
    } catch (err: any) {
      console.warn('[GeminiService] Memory retrieval skipped:', err?.message);
    }

    let lastError: any = null;

    for (const modelName of candidates) {
      // Tracks whether this attempt already performed side effects (tool calls).
      // Switching models after a tool ran would let the tool run twice.
      const state = { toolsExecuted: false };

      try {
        const result = await this.runConversation(
          params,
          modelName,
          preferredLang,
          state,
          memoryBlock,
          conversationBrief
        );

        if (modelName !== settings.modelName) {
          // Remember the fallback that worked so the next request starts there.
          settingsStore.saveSettings({ modelName });
        }

        // Persist the exchange and let extraction run in the background.
        void memoryService.appendExchange(userText, result.text, {
          language: result.detectedLanguage,
          isVoice: Boolean(params.audioBase64),
        });
        memoryService.enqueueExtraction(userText, result.text);

        return result;
      } catch (err: any) {
        lastError = err;

        if (state.toolsExecuted) {
          console.error(
            `[GeminiService] Model "${modelName}" failed after executing tools; not retrying to avoid repeating side effects.`,
            err
          );
          break;
        }

        if (isModelUnavailableError(err)) {
          console.warn(`[GeminiService] Model "${modelName}" unavailable, trying next candidate.`);
          continue;
        }

        break;
      }
    }

    console.error('[GeminiService] Error generating response:', lastError);

    const errorText = `I could not complete that request: ${
      lastError?.message || 'please check your connection and API key.'
    }`;

    // Keep the failure in the transcript for context, but never extract memories from it.
    void memoryService.appendExchange(userText, errorText, {
      isVoice: Boolean(params.audioBase64),
      isError: true,
    });

    return {
      text: errorText,
      detectedLanguage: params.language || 'en-IN',
      error: lastError?.message || 'Unknown Gemini error',
    };
  }

  /** Runs one conversation attempt against a single model. Throws on API failure. */
  private async runConversation(
    params: SendMessageParams,
    modelName: string,
    preferredLang: string,
    state: { toolsExecuted: boolean },
    memoryBlock = '',
    conversationBrief = ''
  ): Promise<SendMessageResult> {
    const client = this.getClient();
    const systemInstruction = buildSystemInstruction(preferredLang, memoryBlock, conversationBrief);
    const toolDeclarations = toolRegistry.getGeminiToolDeclarations();

    const model = client.getGenerativeModel({
      model: modelName,
      systemInstruction: {
        role: 'system',
        parts: [{ text: systemInstruction }],
      },
      tools: toolDeclarations as any,
    });

    // Prepare conversation history (keep last 10 turns to conserve context window)
    const formattedHistory: any[] = [];
    for (const msg of normalizeConversationHistory(params.conversationHistory.slice(-10))) {
      formattedHistory.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      });
    }

    // The bundled SDK's ChatSession sends tool results with the legacy "function"
    // role, which the Gemini API now rejects (400: Role 'function' is not supported).
    // So the conversation is assembled here and tool results go back as a "user" turn.
    const contents: any[] = [...formattedHistory];

    // Prepare user parts (text and/or audio)
    const userParts: any[] = [];
    if (params.audioBase64) {
      userParts.push({
        inlineData: {
          mimeType: params.audioMimeType || 'audio/webm',
          data: params.audioBase64,
        },
      });
      userParts.push({
        text:
          params.message ||
          'Please listen to the attached audio, understand what was said (which may be in Telugu, Hindi, Tamil, Kannada, or English), and respond naturally in that language.',
      });
    } else {
      userParts.push({ text: params.message });
    }
    contents.push({ role: 'user', parts: userParts });

    let result: any = await model.generateContent({ contents });
    let response: any = await result.response;

    const toolRecords: ToolCallRecord[] = [];

    // Function-calling loop (maximum 4 tool turns)
    let turnCount = 0;
    while (turnCount < 4) {
      const calls = response.functionCalls ? response.functionCalls() : undefined;
      if (!calls || calls.length === 0) break;

      turnCount++;
      state.toolsExecuted = true;
      const functionResponses: any[] = [];

      for (const call of calls) {
        console.log(`[GeminiService] Tool call requested: ${call.name}`, call.args);
        const toolRecord: ToolCallRecord = {
          toolName: call.name,
          args: (call.args as any) || {},
          status: 'executing',
        };
        toolRecords.push(toolRecord);

        try {
          const toolResult = await toolRegistry.executeTool(call.name, (call.args as any) || {});
          toolRecord.result = toolResult;
          toolRecord.status = toolResult.rejectedByUser ? 'rejected' : 'completed';

          functionResponses.push({
            functionResponse: { name: call.name, response: toolResult },
          });
        } catch (toolErr: any) {
          toolRecord.status = 'failed';
          toolRecord.result = { error: toolErr.message };
          functionResponses.push({
            functionResponse: { name: call.name, response: { error: toolErr.message } },
          });
        }
      }

      // Echo the model's function-call turn back, then answer it as the user turn.
      const modelContent = response.candidates?.[0]?.content;
      contents.push(
        modelContent && Array.isArray(modelContent.parts)
          ? modelContent
          : { role: 'model', parts: calls.map((call: any) => ({ functionCall: call })) }
      );
      contents.push(buildToolResponseTurn(functionResponses));

      result = await model.generateContent({ contents });
      response = await result.response;
    }

    const text = response.text() || 'I have completed your request.';
    const detectedLanguage = detectLanguageFromText(text, preferredLang);

    return {
      text,
      detectedLanguage,
      toolCalls: toolRecords.length > 0 ? toolRecords : undefined,
    };
  }
}

export const geminiService = new GeminiService();
