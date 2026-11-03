import { GoogleGenAI } from '@google/genai';
import { settingsStore } from '../storage/settingsStore';
import { buildSystemInstruction } from './personality';
import { buildConversationBrief } from './conversationContext';
import { toolRegistry } from '../agent/toolRegistry';
import { memoryService } from '../memory/memoryService';
import {
  ChatMessage,
  ConversationMood,
  ResponseStreamEvent,
  ToolCallRecord,
  VoiceProsodySummary,
} from '../../shared/types';
import { detectLanguageFromText } from '../voice/languages';
import { analyzeMood, buildMoodInstruction, MoodAnalysis } from './mood';
import { getLocalResponse } from './localResponses';

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

/**
 * Reads function-call parts without projecting them onto a smaller object.
 * The part also carries Gemini 3's thoughtSignature and may carry metadata
 * added by a newer API revision, so the original part must remain intact.
 */
export function getFunctionCallParts(response: any): any[] {
  const parts = response?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.filter((part) => part?.functionCall) : [];
}

/** Returns the calls from the already assembled model response. */
export function getFunctionCalls(response: any): any[] {
  return getFunctionCallParts(response).map((part) => part.functionCall);
}

/**
 * Returns the exact model content that must be echoed before function
 * responses. Reconstructing this from `functionCalls` loses thoughtSignature.
 */
export function getModelToolCallContent(response: any): { role?: string; parts: any[] } {
  const content = response?.candidates?.[0]?.content;
  if (!content || !Array.isArray(content.parts)) {
    throw new Error('Gemini returned function calls without a model content turn.');
  }
  return content;
}

/** Builds one function response in the same order as its original call. */
export function buildToolResponsePart(call: any, result: any): { functionResponse: any } {
  const functionResponse: any = {
    name: call.name,
    response: result,
  };
  if (call.id !== undefined) functionResponse.id = call.id;
  return { functionResponse };
}

/**
 * Combines streamed response chunks while retaining every original Part.
 * Gemini's function-call metadata belongs to the Part, not the FunctionCall
 * projection, so concatenating the parts is deliberately lossless.
 */
export function assembleStreamedResponse(chunks: any[]): any {
  const parts: any[] = [];
  let role = 'model';
  let lastCandidate: any = {};

  for (const chunk of chunks) {
    const candidate = chunk?.candidates?.[0];
    if (!candidate) continue;
    lastCandidate = candidate;
    if (candidate.content?.role) role = candidate.content.role;
    if (Array.isArray(candidate.content?.parts)) parts.push(...candidate.content.parts);
  }

  const content = { role, parts };
  return {
    candidates: [{ ...lastCandidate, content }],
    text: parts
      .filter((part) => typeof part?.text === 'string' && !part.thought)
      .map((part) => part.text)
      .join(''),
    functionCalls: getFunctionCalls({ candidates: [{ content }] }),
  };
}

export interface SendMessageParams {
  message: string;
  audioBase64?: string;
  audioMimeType?: string;
  conversationHistory: ChatMessage[];
  language?: string;
  prosody?: VoiceProsodySummary;
  requestId?: string;
}

export interface SendMessageHooks {
  onStream?: (event: Omit<ResponseStreamEvent, 'requestId'>) => void;
}

export interface SendMessageResult {
  text: string;
  detectedLanguage: string;
  toolCalls?: ToolCallRecord[];
  error?: string;
  mood?: ConversationMood;
  safetyOverride?: boolean;
  cancelled?: boolean;
}

export class GeminiService {
  private cachedClient: { apiKey: string; client: GoogleGenAI } | null = null;
  private readonly activeRequests = new Map<string, AbortController>();

  private getClient(apiKeyOverride?: string): GoogleGenAI {
    const key = apiKeyOverride || settingsStore.getRawApiKey();
    if (!key) {
      throw new Error(
        'Gemini API key is not configured. Please enter your API key in Settings or set GEMINI_API_KEY in .env.'
      );
    }
    if (this.cachedClient?.apiKey === key) return this.cachedClient.client;
    const client = new GoogleGenAI({ apiKey: key });
    this.cachedClient = { apiKey: key, client };
    return client;
  }

  public cancelRequest(requestId?: string): void {
    if (requestId) {
      this.activeRequests.get(requestId)?.abort();
      return;
    }
    for (const controller of this.activeRequests.values()) controller.abort();
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
        const result = await client.models.generateContent({
          model: modelCandidate,
          contents: [{ role: 'user', parts: [{ text: 'Respond with just "OK".' }] }],
        });
        const text = result.text || '';

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

  /**
   * Wake-word gate for hands-free standby mode. One cheap audio call, no
   * persona, tools, history or memory side effects: it only decides whether
   * the clip mentions "Friday" and returns what was said.
   */
  public async transcribeUtterance(
    audioBase64: string,
    audioMimeType?: string
  ): Promise<string> {
    const settings = settingsStore.getSettings();
    const client = this.getClient();
    const result = await client.models.generateContent({
      model: settings.modelName,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: audioMimeType || 'audio/webm',
                data: audioBase64,
              },
            },
            {
              text: 'Wake-word gate. Listen to the audio. If the speaker says the wake word "Friday" (for example "Hey Friday" or "Friday"), reply exactly in the form WAKE|<everything they said, verbatim, in the language spoken>. If the audio does not mention "Friday", reply exactly NONE. No other text, no explanations.',
            },
          ],
        },
      ],
    });

    return (result.text || '').trim();
  }

  public async sendMessage(
    params: SendMessageParams,
    hooks: SendMessageHooks = {}
  ): Promise<SendMessageResult> {
    const settings = settingsStore.getSettings();
    const preferredLang = params.language || settings.preferredLanguage || 'te-IN';
    const candidates = buildModelCandidates(settings.modelName);
    const userText = (params.message || '').trim();
    const moodAnalysis = analyzeMood(userText, params.prosody);

    const localResponse = !params.audioBase64
      ? getLocalResponse(userText, preferredLang, settings.personalityMode)
      : null;
    if (localResponse) {
      void memoryService.appendExchange(userText, localResponse.text, {
        language: localResponse.detectedLanguage,
      });
      hooks.onStream?.({ type: 'delta', text: localResponse.text });
      hooks.onStream?.({ type: 'complete' });
      return { ...localResponse, mood: moodAnalysis.mood, safetyOverride: moodAnalysis.safetyOverride };
    }

    const controller = new AbortController();
    if (params.requestId) this.activeRequests.set(params.requestId, controller);

    const startedAt = Date.now();
    let firstTokenAt = 0;
    const streamHook = (event: Omit<ResponseStreamEvent, 'requestId'>) => {
      if (event.type === 'delta' && event.text && !firstTokenAt) {
        firstTokenAt = Date.now();
        console.info(`[GeminiTiming] first-token=${firstTokenAt - startedAt}ms`);
      }
      hooks.onStream?.(event);
    };

    try {
    // Local, per-turn situation brief: mode, topic, follow-up, stated constraints.
    const conversationBrief = buildConversationBrief(params.conversationHistory, userText || 'voice message').text;

    // Long-term memory is retrieved once per turn and injected as system context.
    let memoryBlock = '';
    try {
      memoryBlock = await memoryService.buildContextBlock(userText || 'voice message');
      console.info(`[GeminiTiming] memory=${Date.now() - startedAt}ms`);
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
          conversationBrief,
          moodAnalysis,
          controller.signal,
          streamHook
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

        console.info(`[GeminiTiming] total=${Date.now() - startedAt}ms`);
        streamHook({ type: 'complete' });
        return result;
      } catch (err: any) {
        lastError = err;

        if (controller.signal.aborted || isAbortError(err)) {
          streamHook({ type: 'cancelled' });
          return { text: '', detectedLanguage: preferredLang, cancelled: true };
        }

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
    streamHook({ type: 'error', error: lastError?.message || 'Unknown Gemini error' });

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
    } finally {
    if (params.requestId) this.activeRequests.delete(params.requestId);
    }
  }

  /** Runs one conversation attempt against a single model. Throws on API failure. */
  private async runConversation(
    params: SendMessageParams,
    modelName: string,
    preferredLang: string,
    state: { toolsExecuted: boolean },
    memoryBlock = '',
    conversationBrief = '',
    moodAnalysis: MoodAnalysis = analyzeMood('', undefined),
    signal?: AbortSignal,
    onStream?: (event: Omit<ResponseStreamEvent, 'requestId'>) => void
  ): Promise<SendMessageResult> {
    const client = this.getClient();
    const currentSettings = settingsStore.getSettings();
    const toolDeclarations = toolRegistry.getGeminiToolDeclarations();

    const createModel = (personalityMode: typeof currentSettings.personalityMode) => ({
      model: modelName,
      config: {
        systemInstruction: buildSystemInstruction(
          preferredLang,
          memoryBlock,
          conversationBrief,
          personalityMode,
          moodAnalysis.mood,
          buildMoodInstruction(moodAnalysis, personalityMode)
        ),
        tools: toolDeclarations as any,
      },
    });

    let model = createModel(currentSettings.personalityMode);

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

    let response: any = await this.generateStream(model, contents, signal, onStream);

    const toolRecords: ToolCallRecord[] = [];

    // Function-calling loop (maximum 4 tool turns)
    let turnCount = 0;
    while (turnCount < 4) {
      const calls = getFunctionCalls(response);
      if (!calls || calls.length === 0) break;

      turnCount++;
      state.toolsExecuted = true;
      const functionResponses: any[] = [];

      for (const call of calls) {
        if (!call?.name) throw new Error('Gemini returned a function call without a name.');
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

          functionResponses.push(buildToolResponsePart(call, toolResult));
        } catch (toolErr: any) {
          toolRecord.status = 'failed';
          toolRecord.result = { error: toolErr.message };
          functionResponses.push(buildToolResponsePart(call, { error: toolErr.message }));
        }
      }

      // Echo the exact model function-call turn back. This preserves each
      // thoughtSignature and any other metadata on the original Part.
      contents.push(getModelToolCallContent(response));
      contents.push(buildToolResponseTurn(functionResponses));

      // Apply presentation-only settings immediately to the next model turn;
      // tool declarations, memory and execution logic remain unchanged.
      if (calls.some((call: any) => call.name === 'set_personality_mode')) {
        model = createModel(settingsStore.getSettings().personalityMode);
      }

      response = await this.generateStream(model, contents, signal, onStream);
    }

    const text = getResponseText(response) || 'I have completed your request.';
    const detectedLanguage = detectLanguageFromText(text, preferredLang);

    return {
      text,
      detectedLanguage,
      toolCalls: toolRecords.length > 0 ? toolRecords : undefined,
      mood: moodAnalysis.mood,
      safetyOverride: moodAnalysis.safetyOverride,
    };
  }

  private async generateStream(
    model: { model: string; config: Record<string, any> },
    contents: any[],
    signal?: AbortSignal,
    onStream?: (event: Omit<ResponseStreamEvent, 'requestId'>) => void
  ): Promise<any> {
    const stream = await this.getClient().models.generateContentStream({
      model: model.model,
      contents,
      config: { ...model.config, abortSignal: signal },
    });
    const chunks: any[] = [];

    for await (const chunk of stream) {
      if (signal?.aborted) throw new Error('Response cancelled.');
      chunks.push(chunk);
      try {
        // Read text parts directly so the SDK does not warn when a chunk is
        // intentionally function-call-only.
        const delta = getChunkText(chunk);
        if (delta) {
          onStream?.({ type: 'delta', text: delta });
        }
      } catch {
        // Function-call chunks do not have text; the final response still carries the call.
      }
    }

    return assembleStreamedResponse(chunks);
  }
}

function getResponseText(response: any): string {
  if (typeof response?.text === 'string') return response.text;
  if (typeof response?.text === 'function') return String(response.text() || '');
  return '';
}

function getChunkText(chunk: any): string {
  const parts = chunk?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((part) => typeof part?.text === 'string' && !part.thought)
    .map((part) => part.text)
    .join('');
}

function isAbortError(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('abort') || message.includes('cancel');
}

export const geminiService = new GeminiService();
