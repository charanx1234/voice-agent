import { GoogleGenAI } from '@google/genai';
import { settingsStore } from '../storage/settingsStore';
import { buildSystemInstruction } from './personality';
import { buildConversationBrief } from './conversationContext';
import { toolRegistry } from '../agent/toolRegistry';
import { displayNameForAppQuery, extractDirectLaunchApp } from '../agent/appShortcutsTool';
import { fastLocalIntentRouter } from '../agent/fastLocalIntent';
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
import { classifyFridayError } from '../error/errorHandler';

/**
 * Models tried, in order, when the configured model is unavailable.
 * Prioritizes high-quota, verified operational models with audio multimodal capability.
 */
const MODEL_FALLBACKS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-2.5-flash',
];

/** Ordered, de-duplicated list of models to attempt for a request. */
export function buildModelCandidates(configured?: string): string[] {
  let initial = configured?.trim();
  if (
    initial === 'gemini-2.5-pro' ||
    initial === 'gemini-2.0-flash' ||
    initial === 'gemini-1.5-flash' ||
    initial === 'gemini-3.1-pro-preview' ||
    initial === 'gemini-2.5-flash'
  ) {
    initial = 'gemini-3.1-flash-lite';
  }
  const ordered = [initial || 'gemini-3.1-flash-lite', ...MODEL_FALLBACKS].filter(
    (model): model is string => Boolean(model && model.length > 0)
  );
  return Array.from(new Set(ordered));
}

/** True when an API error is transient (503 unavailable, 429 rate limit, high demand). */
export function isTransientError(err: any): boolean {
  const message = String(err?.message || err || '').toLowerCase();
  const status = err?.status || err?.statusCode || (typeof err?.code === 'number' ? err.code : 0);
  return (
    status === 503 ||
    status === 429 ||
    message.includes('503') ||
    message.includes('429') ||
    message.includes('unavailable') ||
    message.includes('high demand') ||
    message.includes('overloaded') ||
    message.includes('exhausted') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('temporarily unavailable')
  );
}

/** True when an API error means "this model cannot serve requests", not "the request failed". */
export function isModelUnavailableError(err: any): boolean {
  const message = String(err?.message || err || '').toLowerCase();
  const status = err?.status || err?.statusCode || (typeof err?.code === 'number' ? err.code : 0);
  return (
    status === 404 ||
    message.includes('404') ||
    message.includes('not found') ||
    message.includes('no longer available') ||
    message.includes('not available') ||
    message.includes('is not supported') ||
    message.includes('does not exist') ||
    message.includes('unsupported model')
  );
}

/** Retries an asynchronous operation using exponential backoff with random jitter. */
export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    signal?: AbortSignal;
    onRetry?: (attempt: number, delay: number, error: any) => void;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 4000;
  const signal = options.signal;

  let attempt = 0;
  while (true) {
    if (signal?.aborted) {
      throw new Error('Operation cancelled by user.');
    }
    try {
      return await operation(attempt);
    } catch (err: any) {
      if (signal?.aborted || isAbortError(err)) {
        throw err;
      }
      if (attempt >= maxRetries || !isTransientError(err)) {
        throw err;
      }
      attempt++;
      const exponential = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 200);
      const delay = Math.min(exponential + jitter, maxDelayMs);

      console.warn(
        `[GeminiService] Transient error (attempt ${attempt}/${maxRetries}): ${err?.message || err}. Retrying in ${delay}ms...`
      );
      options.onRetry?.(attempt, delay, err);

      await new Promise<void>((resolve, reject) => {
        let timer: any = null;
        const abortHandler = () => {
          if (timer) clearTimeout(timer);
          signal?.removeEventListener('abort', abortHandler);
          reject(new Error('Operation cancelled by user.'));
        };
        timer = setTimeout(() => {
          signal?.removeEventListener('abort', abortHandler);
          resolve();
        }, delay);
        if (signal) {
          signal.addEventListener('abort', abortHandler, { once: true });
        }
      });
    }
  }
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
      this.activeRequests.delete(requestId);
      return;
    }
    for (const controller of this.activeRequests.values()) {
      try {
        controller.abort();
      } catch {
        // ignore
      }
    }
    this.activeRequests.clear();
  }

  public cancelAll(): void {
    this.cancelRequest();
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
    const cleanMime = (audioMimeType || 'audio/webm').split(';')[0].trim();
    const candidates = buildModelCandidates(settings.modelName);

    for (const modelCandidate of candidates) {
      try {
        const result = await retryWithBackoff(
          async () => {
            return await client.models.generateContent({
              model: modelCandidate,
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      inlineData: {
                        mimeType: cleanMime,
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
          },
          { maxRetries: 1, baseDelayMs: 250 }
        );

        const text = (result.text || '').trim();
        if (text) return text;
      } catch (err: any) {
        console.warn(`[Gemini] transcribeUtterance attempt with ${modelCandidate} failed:`, err?.message || err);
      }
    }

    return 'NONE';
  }

  /**
   * Transcribes microphone audio speech verbatim into text.
   * Handles mixed Telugu, English, Hinglish, Tamil, and Kannada accurately.
   * Preserves code-switched phrases, colloquial verbs, and technical terms.
   */
  public async transcribeAudio(
    audioBase64: string,
    audioMimeType?: string
  ): Promise<string> {
    const settings = settingsStore.getSettings();
    const client = this.getClient();
    const cleanMime = (audioMimeType || 'audio/webm').split(';')[0].trim();
    const candidates = buildModelCandidates(settings.modelName);

    let lastError: any = null;

    for (const modelCandidate of candidates) {
      try {
        const result = await retryWithBackoff(
          async () => {
            return await client.models.generateContent({
              model: modelCandidate,
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      inlineData: {
                        mimeType: cleanMime,
                        data: audioBase64,
                      },
                    },
                    {
                      text: `Transcribe this microphone speech verbatim in the exact words and languages spoken.
CRITICAL TRANSCRIPTION RULES:
1. FOREGROUND SPEECH ISOLATION: Prioritize the primary foreground speaker nearest to the microphone. Completely ignore background chatter, television sound, fan drone, music, typing/mouse clicks, or secondary background voices.
2. NATURAL CODE-SWITCHING: The user speaks natural mixed Telugu-English (Tenglish) and Hinglish. Support mixed language in a single sentence:
   - "Chrome open chey and Java tutorials search chey"
   - "Spotify lo music play chey"
   - "Naaku tomorrow college ki vellali"
   - "Ee error enti, can you explain?"
   - "Can you open Chrome and search for Java tutorials?"
   - "Notepad open karo aur notes save karo"
3. PRESERVE TECHNICAL & APP WORDS: Always preserve English technical words, application names, websites, and programming keywords exactly in English: "Chrome", "Spotify", "GitHub", "Java", "Python", "Notepad", "VS Code", "Terminal", "YouTube", "Google", "WhatsApp", "Discord", "Settings".
4. PRESERVE COLLOQUIAL VOCABULARY: Preserve colloquial words without translating or altering:
   - Telugu: "chey", "chudu", "pettandi", "vellali", "raayi", "teeyi", "entha", "cheppu", "aapu", "chalu", "lo", "ki", "naaku", "kani", "mariyu", "tarwatha", "enti".
   - Hindi: "karo", "kholo", "chalao", "band karo", "batao", "aur", "pe", "kaise", "kya".
5. NEVER INVENT WORDS: Do not guess or fabricate words to compensate for audio corruption or pauses.
6. INCOMPLETE SPEECH: If the user paused or was cut off mid-sentence (e.g. "Friday, open..." or "search for..."), transcribe what was spoken and append "..." at the end.
7. NO SPEECH OR UNINTELLIGIBLE:
   - If the audio contains only ambient room noise, fan hum, keyboard clicks, coughing, breathing, or silence: return exactly: SILENCE
   - If human speech is completely muffled, unintelligible, or overwhelmed by noise such that words cannot be discerned: return exactly: UNCLEAR
8. Output ONLY the verbatim transcript text. No quotes, no markdown, no conversational commentary.`,
                    },
                  ],
                },
              ],
            });
          },
          { maxRetries: 2, baseDelayMs: 300 }
        );

        let text = (result.text || '').trim();
        text = text.replace(/^["'`]+|["'`]+$/g, '').trim();

        // Check if output is silence or timestamp artifacts (e.g. 00:00, [00:00:00])
        if (
          !text ||
          text.toUpperCase() === 'SILENCE' ||
          text.toUpperCase() === 'NONE' ||
          text.toUpperCase() === 'EMPTY' ||
          /^\[?\d{1,2}:\d{2}(?::\d{2})?\]?(?:\s*-\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?)?$/.test(text)
        ) {
          return '';
        }
        return text;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini] transcribeAudio attempt with ${modelCandidate} failed:`, err?.message || err);
      }
    }

    if (lastError) {
      console.error('[Gemini] All transcription model candidates failed:', lastError?.message || lastError);
    }
    return '';
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

    // Fast local intent execution (<100ms) for app controls, media, volume, time, date, battery
    if (!params.audioBase64) {
      const fastResult = await fastLocalIntentRouter.tryRoute(
        userText,
        preferredLang,
        settings.personalityMode
      );
      if (fastResult?.matched) {
        hooks.onStream?.({ type: 'delta', text: fastResult.response });
        hooks.onStream?.({ type: 'complete' });
        void memoryService.appendExchange(userText, fastResult.response, {
          language: preferredLang,
        });
        return {
          text: fastResult.response,
          detectedLanguage: preferredLang,
          toolCalls: (fastResult.toolCalls as ToolCallRecord[]) || [],
          mood: moodAnalysis.mood,
          safetyOverride: moodAnalysis.safetyOverride,
        };
      }
    }

    const directLaunch = !params.audioBase64 ? extractDirectLaunchApp(userText) : null;

    // A one-app desktop command does not need Gemini, memory retrieval or a
    // tool-call round trip. Start it immediately and report the real spawn
    // result so the renderer can speak a short, accurate acknowledgement.
    if (directLaunch) {
      const appName = displayNameForAppQuery(directLaunch);
      const needsConfirmation = settings.requireToolConfirmations.launchApps;
      if (!needsConfirmation) hooks.onStream?.({ type: 'delta', text: `Opening ${appName}.` });
      const launchResult = await toolRegistry.executeTool('launch_allowed_app', { appId: directLaunch });
      if (launchResult?.success) {
        if (needsConfirmation) hooks.onStream?.({ type: 'delta', text: `Opening ${appName}.` });
        hooks.onStream?.({ type: 'delta', text: ` ${appName} is ready.` });
        return {
          text: `${appName} is ready.`,
          detectedLanguage: preferredLang,
          toolCalls: [{ toolName: 'launch_allowed_app', args: { appId: directLaunch }, result: launchResult, status: 'completed' }],
          mood: moodAnalysis.mood,
          safetyOverride: moodAnalysis.safetyOverride,
        };
      }
      return {
        text: launchResult?.error || `I couldn't open ${appName}.`,
        detectedLanguage: preferredLang,
        toolCalls: [{ toolName: 'launch_allowed_app', args: { appId: directLaunch }, result: launchResult, status: 'failed' }],
        error: launchResult?.error || `Could not open ${appName}.`,
        mood: moodAnalysis.mood,
        safetyOverride: moodAnalysis.safetyOverride,
      };
    }

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

        if (isModelUnavailableError(err) || (isTransientError(err) && !state.toolsExecuted)) {
          console.warn(`[GeminiService] Model "${modelName}" unavailable or overloaded (503), trying next candidate.`);
          continue;
        }

        break;
      }
    }

    const errorResult = classifyFridayError(lastError, { query: userText, provider: 'gemini' });
    const rawApiKey = settingsStore.getRawApiKey();
    const rawErrMsg = lastError?.message || 'Unknown Gemini error';
    const safeErrorMsg = rawApiKey ? rawErrMsg.replaceAll(rawApiKey, '[redacted]') : rawErrMsg;
    streamHook({ type: 'error', error: errorResult.userMessage });

    const errorText = errorResult.userMessage;

    // Keep the failure in the transcript for context, but never extract memories from it.
    void memoryService.appendExchange(userText, errorText, {
      isVoice: Boolean(params.audioBase64),
      isError: true,
    });

    return {
      text: errorText,
      detectedLanguage: params.language || 'en-IN',
      error: safeErrorMsg,
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
          const classified = classifyFridayError(toolErr, { toolName: call.name });
          toolRecord.status = 'failed';
          toolRecord.result = { error: classified.userMessage, technicalError: toolErr?.message };
          functionResponses.push(buildToolResponsePart(call, { error: classified.userMessage }));
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
    const client = this.getClient();
    const stream = await retryWithBackoff(
      async () => {
        return await client.models.generateContentStream({
          model: model.model,
          contents,
          config: { ...model.config, abortSignal: signal },
        });
      },
      {
        maxRetries: 3,
        baseDelayMs: 500,
        signal,
      }
    );
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
