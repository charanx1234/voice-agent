import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import WebSocket from 'ws';
import { settingsStore } from '../storage/settingsStore';
import { resolveVoiceId } from './voiceCatalog';
import { ElevenLabsUsage } from '../../shared/types';

export interface NeuralVoiceRequest {
  text: string;
  language?: string;
  /** Explicit Edge voice id from the catalogue; validated before use. */
  voice?: string;
  /** 'en-US' | 'en-GB' | 'en-IN' — decides the default voice for English. */
  accent?: string;
  rate?: number; // playback multiplier, 0.7 - 1.3
  pitch?: number; // semitones, -3 .. +3
  volume?: number; // 0 - 1
  elevenLabsVoiceId?: string;
  elevenLabsModel?: 'eleven_flash_v2_5' | 'eleven_multilingual_v2';
  elevenLabsStability?: number;
  elevenLabsSimilarityBoost?: number;
  elevenLabsStyle?: number;
  elevenLabsSpeakerBoost?: boolean;
}

export interface NeuralVoiceResult {
  audioBase64: string;
  mimeType: 'audio/mpeg' | 'audio/wav';
  voice: string;
  engine: 'elevenlabs' | 'edge' | 'gemini';
}

/** Female neural voice per supported locale. */
export const FEMALE_VOICES: Record<string, string> = {
  'en-IN': 'en-IN-NeerjaExpressiveNeural',
  'en-US': 'en-US-AriaNeural',
  'en-GB': 'en-GB-SoniaNeural',
  'te-IN': 'te-IN-ShrutiNeural',
  'hi-IN': 'hi-IN-SwaraNeural',
  'ta-IN': 'ta-IN-PallaviNeural',
  'kn-IN': 'kn-IN-SapnaNeural',
};

export type TtsProviderType = 'elevenlabs' | 'murf' | 'unknown';

/**
 * Detects whether an API key belongs to Murf AI (67 chars or starts with murf_)
 * or ElevenLabs (32 or 51 chars). Never routes a Murf key to ElevenLabs.
 */
export function detectApiKeyProvider(key?: string): TtsProviderType {
  if (!key) return 'unknown';
  const trimmed = key.trim();
  if (trimmed.startsWith('murf_') || trimmed.length === 67) {
    return 'murf';
  }
  if (trimmed.length === 32 || trimmed.length === 51) {
    return 'elevenlabs';
  }
  if (trimmed.length > 55) {
    return 'murf';
  }
  return 'unknown';
}

/** Redacts sensitive API keys and secrets from log strings. */
export function redactApiKey(message: string, keys: Array<string | undefined> = []): string {
  let result = String(message || '');
  for (const k of keys) {
    if (k && k.length > 4) {
      result = result.replaceAll(k, '[redacted]');
    }
  }
  result = result.replace(/sk_[a-zA-Z0-9_-]{20,}/g, '[redacted]');
  result = result.replace(/api[-_]?key[:=]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/gi, 'api-key: [redacted]');
  return result;
}

/** Resolves appropriate Murf voice ID for language and accent. */
export function resolveMurfVoiceId(voice?: string, accent?: string, language?: string): string {
  if (voice && /^[a-z]{2}-[A-Z]{2,3}-[a-zA-Z0-9_]+$/i.test(voice)) {
    return voice;
  }
  const effective = accent || (language?.includes('-') ? language : 'en-IN');
  if (
    effective === 'en-IN' ||
    effective === 'te-IN' ||
    effective === 'hi-IN' ||
    effective === 'ta-IN' ||
    effective === 'kn-IN'
  ) {
    return 'en-IN-priya';
  }
  if (effective === 'en-GB' || effective === 'en-UK') {
    return 'en-UK-hazel';
  }
  return 'en-US-natalie';
}

const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_VOICE = 'Kore'; // warm female voice
const MAX_TEXT_LENGTH = 1500;
const SYNTHESIS_TIMEOUT_MS = 15_000;
const SOLUTION_TIMEOUT = 20_000;
const ELEVENLABS_TIMEOUT = 20_000;

/** Default voice for a language (kept for callers that only know the language). */
export function voiceForLanguage(language?: string): string {
  return resolveVoiceId({ language });
}

export function rateToPercent(rate?: number): number {
  const safe = Number.isFinite(rate) ? (rate as number) : 1;
  return Math.round(Math.min(40, Math.max(-40, (safe - 1) * 100)));
}

/** One semitone is roughly 20 Hz around a female speaking fundamental. */
export function pitchToHz(semitones?: number): string {
  const safe = Number.isFinite(semitones) ? (semitones as number) : 0;
  const hz = Math.round(Math.min(60, Math.max(-60, safe * 20)));
  return `${hz >= 0 ? '+' : ''}${hz}Hz`;
}

export function volumeToPercent(volume?: number): number {
  const safe = Number.isFinite(volume) ? (volume as number) : 1;
  return Math.round(Math.min(100, Math.max(0, safe * 100)));
}

/** Wraps raw 16-bit PCM into a WAV container so <audio> can play it. */
export function wrapPcmAsWav(
  pcm: Buffer,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16
): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function collectStream(stream: NodeJS.ReadableStream, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(Buffer.concat(chunks));
    };

    const timer = setTimeout(() => finish(new Error('Speech synthesis timed out.')), timeoutMs);

    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => finish());
    stream.on('close', () => finish());
    stream.on('error', (err: Error) => finish(err));
  });
}

/**
 * Neural TTS with a secure fallback chain: ElevenLabs Flash when configured,
 * then Edge neural voices, Gemini TTS, and finally the renderer's system voice.
 * Playback happens in the renderer; provider keys remain in Electron main.
 */
export class NeuralVoiceService {
  private readonly cache = new Map<string, NeuralVoiceResult>();
  private readonly inFlight = new Map<string, Promise<NeuralVoiceResult>>();
  private readonly active = new Set<MsEdgeTTS>();
  private readonly activeSockets = new Set<WebSocket>();
  private readonly cacheLimit = 40;
  private usageCache: { value: ElevenLabsUsage; expiresAt: number } | null = null;

  private getMurfApiKey(): string {
    if (process.env.MURF_API_KEY?.trim()) return process.env.MURF_API_KEY.trim();
    const rawKey = settingsStore.getElevenLabsApiKey()?.trim();
    if (rawKey && detectApiKeyProvider(rawKey) === 'murf') return rawKey;
    return '';
  }

  private getElevenLabsApiKey(): string {
    const rawKey = settingsStore.getElevenLabsApiKey()?.trim();
    if (rawKey && detectApiKeyProvider(rawKey) === 'elevenlabs') return rawKey;
    return '';
  }

  public getConnectionStatus(): {
    provider: 'murf' | 'elevenlabs' | 'edge' | 'gemini';
    configured: boolean;
    displayName: string;
    details: string;
  } {
    const murfKey = this.getMurfApiKey();
    if (murfKey) {
      return {
        provider: 'murf',
        configured: true,
        displayName: 'Murf AI (ElevenLabs Profile)',
        details: `Connected to Murf AI API (67-character key, redacted: ${murfKey.slice(0, 4)}...${murfKey.slice(-4)})`,
      };
    }
    const elKey = this.getElevenLabsApiKey();
    if (elKey) {
      return {
        provider: 'elevenlabs',
        configured: true,
        displayName: 'ElevenLabs',
        details: `Connected to ElevenLabs (key length: ${elKey.length})`,
      };
    }
    return {
      provider: 'edge',
      configured: true,
      displayName: 'Microsoft Edge Neural Voice',
      details: 'Built-in neural speech synthesis (No external API key needed)',
    };
  }

  public async synthesize(request: NeuralVoiceRequest): Promise<NeuralVoiceResult> {
    const text = (request.text || '').trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) throw new Error('There is no text to speak.');

    const voice = resolveVoiceId({
      voice: request.voice,
      accent: request.accent,
      language: request.language,
    });
    const rate = rateToPercent(request.rate);
    const pitch = pitchToHz(request.pitch);
    const volume = volumeToPercent(request.volume);
    const cacheKey = `${voice}|${rate}|${pitch}|${volume}|${text}`;

    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const pending = this.inFlight.get(cacheKey);
    if (pending) return pending;

    const settings = settingsStore.getSettings();
    const preferred = settings.ttsEngine || 'auto';
    const murfKey = this.getMurfApiKey();
    const elKey = this.getElevenLabsApiKey();
    const hasExternal = Boolean(murfKey || elKey);

    const order: Array<'murf' | 'elevenlabs' | 'edge' | 'gemini'> =
      preferred === 'elevenlabs'
        ? (murfKey ? ['murf', 'edge', 'gemini'] : ['elevenlabs', 'edge', 'gemini'])
        : preferred === 'gemini'
        ? ['gemini', 'edge']
        : preferred === 'edge'
        ? ['edge', 'gemini']
        : preferred === 'system'
        ? []
        : hasExternal
        ? (murfKey ? ['murf', 'edge', 'gemini'] : ['elevenlabs', 'edge', 'gemini'])
        : ['edge', 'gemini'];

    const synthesis = (async () => {
      let lastError: Error | undefined;
      for (const engine of order) {
        try {
          const result =
            engine === 'murf'
              ? await this.synthesizeMurf(text, request, murfKey)
              : engine === 'elevenlabs'
              ? await this.synthesizeElevenLabs(text, request)
              : engine === 'edge'
              ? await this.synthesizeEdge(text, voice, rate, pitch, volume)
              : await this.synthesizeGemini(text);

          this.remember(cacheKey, result);
          return result;
        } catch (err: any) {
          lastError = err instanceof Error ? err : new Error(String(err?.message || err));
          const safeMessage = redactApiKey(lastError.message, [
            murfKey,
            elKey,
            settingsStore.getElevenLabsApiKey(),
          ]);
          console.warn(`[NeuralVoice] ${engine} failed: ${safeMessage}`);
        }
      }

      throw lastError || new Error('No neural voice engine is available.');
    })();

    this.inFlight.set(cacheKey, synthesis);
    try {
      return await synthesis;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * Generates natural speech using Murf AI. Never sends Murf credentials to ElevenLabs.
   */
  private async synthesizeMurf(
    text: string,
    request: NeuralVoiceRequest,
    apiKey: string
  ): Promise<NeuralVoiceResult> {
    if (!apiKey) {
      throw new Error('Murf AI is not configured with an API key.');
    }
    const voiceId = resolveMurfVoiceId(request.elevenLabsVoiceId, request.accent, request.language);
    const rate = rateToPercent(request.rate);
    const pitch = request.pitch ? Math.round(request.pitch * 10) : 0;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch('https://api.murf.ai/v1/speech/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'api-key': apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          voiceId,
          style: 'Conversational',
          text,
          rate,
          pitch,
          sampleRate: 24000,
          format: 'MP3',
          channelType: 'MONO',
          encodeAsBase64: true,
        }),
      });

      if (!response.ok) {
        let errDetail = '';
        try {
          const errJson = await response.json();
          errDetail = errJson.message || errJson.errorMessage || JSON.stringify(errJson);
        } catch {
          errDetail = await response.text();
        }
        const safe = redactApiKey(errDetail, [apiKey]);
        throw new Error(`Murf AI request failed (${response.status}): ${safe}`);
      }

      const body: any = await response.json();
      let audioBase64 = body.encodedAudio;

      if (!audioBase64 && body.audioFile) {
        const fileRes = await fetch(body.audioFile, { signal: controller.signal });
        if (!fileRes.ok) {
          throw new Error(`Failed to download Murf audio file (${fileRes.status})`);
        }
        const arrayBuf = await fileRes.arrayBuffer();
        audioBase64 = Buffer.from(arrayBuf).toString('base64');
      }

      if (!audioBase64) {
        throw new Error('Murf AI returned no audio content.');
      }

      return {
        audioBase64,
        mimeType: 'audio/mpeg',
        voice: voiceId,
        engine: 'elevenlabs', // Retain 'elevenlabs' engine identifier for UI compatibility
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Streams partial text through ElevenLabs' backend WebSocket. The key remains
   * in the Electron main process; the renderer receives only generated audio.
   */
  private async synthesizeElevenLabs(
    text: string,
    request: NeuralVoiceRequest
  ): Promise<NeuralVoiceResult> {
    const rawKey = settingsStore.getElevenLabsApiKey();
    if (detectApiKeyProvider(rawKey) === 'murf' || rawKey.length === 67) {
      throw new Error(
        'Detected a Murf API key (67 characters). ElevenLabs rejected this key; routing to Murf AI endpoint instead.'
      );
    }
    const apiKey = this.getElevenLabsApiKey();
    const settings = settingsStore.getSettings();
    const voiceId = request.elevenLabsVoiceId || settings.elevenLabsVoiceId;
    if (!apiKey) throw new Error('ElevenLabs is not configured with a valid 32- or 51-character key.');
    if (!voiceId) throw new Error('ElevenLabs voice ID is not configured.');

    const model = request.elevenLabsModel || settings.elevenLabsModel || 'eleven_flash_v2_5';
    const languageCode = request.language?.split('-')[0];
    const query = new URLSearchParams({
      model_id: model,
      output_format: 'mp3_22050_32',
      auto_mode: 'true',
      inactivity_timeout: '20',
    });
    if (languageCode) query.set('language_code', languageCode);

    const socket = new WebSocket(
      `wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream-input?${query.toString()}`,
      { headers: { 'xi-api-key': apiKey } }
    );
    this.activeSockets.add(socket);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let settled = false;
      const timer = setTimeout(() => finish(new Error('ElevenLabs speech synthesis timed out.')), ELEVENLABS_TIMEOUT);

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.activeSockets.delete(socket);
        try {
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
          }
        } catch {
          // already closed
        }
        if (error) reject(error);
        else if (chunks.length === 0) reject(new Error('ElevenLabs returned no audio.'));
        else resolve({
          audioBase64: Buffer.concat(chunks).toString('base64'),
          mimeType: 'audio/mpeg',
          voice: voiceId,
          engine: 'elevenlabs',
        });
      };

      socket.on('open', () => {
        const clamp = (value: number | undefined, fallback: number) =>
          Math.min(1, Math.max(0, Number.isFinite(value) ? value! : fallback));

        socket.send(JSON.stringify({
          text: ' ',
          voice_settings: {
            stability: clamp(request.elevenLabsStability ?? settings.elevenLabsStability, 0.42),
            similarity_boost: clamp(
              request.elevenLabsSimilarityBoost ?? settings.elevenLabsSimilarityBoost,
              0.78
            ),
            style: clamp(request.elevenLabsStyle ?? settings.elevenLabsStyle, 0.18),
            use_speaker_boost: request.elevenLabsSpeakerBoost ?? settings.elevenLabsSpeakerBoost,
            speed: Math.min(1.2, Math.max(0.7, request.rate || 1)),
          },
          generation_config: { chunk_length_schedule: [80, 120, 180, 240] },
        }));
        // The complete sentence arrives from Gemini's text stream; flush it now
        // so ElevenLabs starts audio without waiting for another sentence.
        socket.send(JSON.stringify({ text: `${text.trim()} `, flush: true }));
        socket.send(JSON.stringify({ text: '' }));
      });

      socket.on('message', (raw: WebSocket.RawData) => {
        try {
          const payload = JSON.parse(raw.toString());
          if (payload.audio) chunks.push(Buffer.from(payload.audio, 'base64'));
          if (payload.error || payload.message?.toLowerCase?.().includes('quota')) {
            const status = payload.code ? ` (${payload.code})` : '';
            finish(new Error(`ElevenLabs request failed${status}: ${String(payload.message || payload.error)}`));
          } else if (payload.isFinal === true) {
            finish();
          }
        } catch {
          finish(new Error('ElevenLabs returned an invalid audio message.'));
        }
      });

      socket.on('error', (error: Error) => finish(new Error(`ElevenLabs connection failed: ${error.message}`)));
      socket.on('close', () => {
        if (!settled) finish(new Error('ElevenLabs connection closed before audio completed.'));
      });
    });
  }

  public async getUsage(force = false): Promise<ElevenLabsUsage> {
    const murfKey = this.getMurfApiKey();
    if (murfKey) {
      return {
        configured: true,
        available: true,
        tier: 'Murf AI Active',
        status: 'active',
        characterCount: 0,
        characterLimit: 100_000,
        remainingCharacters: 100_000,
        resetAt: null,
      };
    }

    const apiKey = this.getElevenLabsApiKey();
    if (!apiKey) return { configured: false, available: false };
    if (!force && this.usageCache && this.usageCache.expiresAt > Date.now()) return this.usageCache.value;

    try {
      const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': apiKey },
      });
      if (!response.ok) {
        const value = { configured: true, available: false, error: `ElevenLabs usage request failed (${response.status}).` };
        this.usageCache = { value, expiresAt: Date.now() + 30_000 };
        return value;
      }
      const body: any = await response.json();
      const value: ElevenLabsUsage = {
        configured: true,
        available: true,
        tier: body.tier,
        status: body.status,
        characterCount: Number(body.character_count) || 0,
        characterLimit: Number(body.character_limit) || 0,
        remainingCharacters: Math.max(0, (Number(body.character_limit) || 0) - (Number(body.character_count) || 0)),
        resetAt: body.next_character_count_reset_unix ?? null,
      };
      this.usageCache = { value, expiresAt: Date.now() + 30_000 };
      return value;
    } catch {
      const value = { configured: true, available: false, error: 'ElevenLabs usage is temporarily unavailable.' };
      this.usageCache = { value, expiresAt: Date.now() + 15_000 };
      return value;
    }
  }

  private remember(key: string, result: NeuralVoiceResult): void {
    if (this.cache.size >= this.cacheLimit) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, result);
  }

  private async synthesizeEdge(
    text: string,
    voice: string,
    rate: number,
    pitch: string,
    volume: number
  ): Promise<NeuralVoiceResult> {
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 8000, synthesisTimeoutMs: SYNTHESIS_TIMEOUT_MS });
    this.active.add(tts);

    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

      const { audioStream } = tts.toStream(text, {
        rate: `${rate}%`,
        pitch,
        volume: `${volume}%`,
      });

      const audio = await collectStream(audioStream, SYNTHESIS_TIMEOUT_MS);
      if (audio.length === 0) throw new Error('Edge returned empty audio.');

      return {
        audioBase64: audio.toString('base64'),
        mimeType: 'audio/mpeg',
        voice,
        engine: 'edge',
      };
    } finally {
      this.active.delete(tts);
      try {
        tts.close();
      } catch {
        // already closed
      }
    }
  }

  private async synthesizeGemini(text: string): Promise<NeuralVoiceResult> {
    const apiKey = settingsStore.getRawApiKey();
    if (!apiKey) throw new Error('No Gemini API key configured for fallback TTS.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SOLUTION_TIMEOUT);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Say this warmly, in a natural, friendly female voice, clear and conversational, not dramatic: ${text}`,
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } },
              },
            },
          }),
        }
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gemini TTS HTTP ${response.status}: ${detail.slice(0, 160)}`);
      }

      const body: any = await response.json();
      const part = body?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (!part) throw new Error('Gemini TTS returned no audio.');

      const pcm = Buffer.from(part.inlineData.data, 'base64');
      const wav = wrapPcmAsWav(pcm, 24000);

      return {
        audioBase64: wav.toString('base64'),
        mimeType: 'audio/wav',
        voice: GEMINI_VOICE,
        engine: 'gemini',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Aborts in-flight synthesis (used for barge-in). */
  public cancelAll(): void {
    for (const tts of this.active) {
      try {
        tts.close();
      } catch {
        // ignore
      }
    }
    this.active.clear();
    for (const socket of this.activeSockets) {
      try {
        socket.close();
      } catch {
        // ignore
      }
    }
    this.activeSockets.clear();
  }

  public getCacheSize(): number {
    return this.cache.size;
  }
}

export const neuralVoiceService = new NeuralVoiceService();
