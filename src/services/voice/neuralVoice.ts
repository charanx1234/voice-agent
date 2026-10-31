import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { settingsStore } from '../storage/settingsStore';
import { resolveVoiceId } from './voiceCatalog';

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
}

export interface NeuralVoiceResult {
  audioBase64: string;
  mimeType: 'audio/mpeg' | 'audio/wav';
  voice: string;
  engine: 'edge' | 'gemini';
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

const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_VOICE = 'Kore'; // warm female voice
const MAX_TEXT_LENGTH = 1500;
const SYNTHESIS_TIMEOUT_MS = 15_000;
const SOLUTION_TIMEOUT = 20_000;

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
 * Neural TTS with a fallback chain: Edge neural voices (free, no key) followed by
 * Gemini TTS (existing key). Playback happens in the renderer.
 */
export class NeuralVoiceService {
  private readonly cache = new Map<string, NeuralVoiceResult>();
  private readonly active = new Set<MsEdgeTTS>();
  private readonly cacheLimit = 40;

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

    const preferred = settingsStore.getSettings().ttsEngine || 'auto';
    const order: Array<'edge' | 'gemini'> =
      preferred === 'gemini' ? ['gemini', 'edge'] : preferred === 'system' ? [] : ['edge', 'gemini'];

    let lastError: Error | undefined;
    for (const engine of order) {
      try {
        const result =
          engine === 'edge'
            ? await this.synthesizeEdge(text, voice, rate, pitch, volume)
            : await this.synthesizeGemini(text);

        this.remember(cacheKey, result);
        return result;
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err?.message || err));
        console.warn(`[NeuralVoice] ${engine} failed: ${lastError.message}`);
      }
    }

    throw lastError || new Error('No neural voice engine is available.');
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
  }

  public getCacheSize(): number {
    return this.cache.size;
  }
}

export const neuralVoiceService = new NeuralVoiceService();

