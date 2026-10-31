import { SqlValue } from './sqliteDatabase';

export type EmbeddingRole = 'query' | 'document';

export interface EmbeddingVector {
  vector: number[];
  model: string;
  /** True when the Gemini call failed and the local hashed embedding was used. */
  usedFallback: boolean;
}

export const GEMINI_EMBEDDING_MODELS = ['gemini-embedding-001', 'gemini-embedding-2'];
export const LOCAL_EMBEDDING_MODEL = 'local-hash-256';
const LOCAL_DIMENSIONS = 256;
const GEMINI_DIMENSIONS = 768;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'so', 'to', 'of', 'in', 'on',
  'at', 'for', 'with', 'about', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'am', 'do', 'does', 'did', 'have', 'has', 'had', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'me', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this',
  'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'how', 'why', 'when',
  'where', 'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might',
  'please', 'just', 'very', 'really', 'also', 'from', 'by', 'not', 'no', 'yes',
]);

/** Lowercases and splits text into meaningful tokens, keeping non-Latin scripts intact. */
export function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Crude English suffix stripping so "replies"/"reply" and "projects"/"project" match. */
export function stem(token: string): string {
  if (token.length <= 4) return token;

  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (/(?:ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  if (token.endsWith('ing') && token.length > 6) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 5) return token.slice(0, -2);

  return token;
}

function normalizeVector(vector: number[]): number[] {
  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  magnitude = Math.sqrt(magnitude);
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

/**
 * Deterministic hashed bag-of-words + character trigrams.
 * Used when the Gemini embedding API is unavailable, so semantic-ish search keeps
 * working offline instead of failing closed.
 */
export function localEmbedding(text: string, dimensions = LOCAL_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const add = (feature: string, weight: number) => {
    const hash = fnv1a(feature);
    const index = hash % dimensions;
    const sign = (hash >>> 16) & 1 ? 1 : -1;
    vector[index] += sign * weight;
  };

  const tokens = tokenize(text);
  for (const token of tokens) {
    add(`w:${token}`, 1);
    // A stemmed feature lets "replies" and "reply" land in the same bucket.
    add(`s:${stem(token)}`, 0.6);
  }

  // Character trigrams give partial credit for morphological variants and typos.
  const compact = tokens.join(' ');
  for (let i = 0; i + 3 <= compact.length; i++) {
    add(`c:${compact.slice(i, i + 3)}`, 0.3);
  }

  return normalizeVector(vector);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Fraction of query tokens found in the target text, with prefix matching. */
export function keywordOverlap(query: string, target: string): number {
  const queryTokens = Array.from(new Set(tokenize(query)));
  if (queryTokens.length === 0) return 0;

  const targetTokens = Array.from(new Set(tokenize(target).map(stem)));
  if (targetTokens.length === 0) return 0;

  let hits = 0;
  for (const queryToken of queryTokens) {
    const queryStem = stem(queryToken);
    const found = targetTokens.some(
      (targetToken) =>
        targetToken === queryToken ||
        targetToken === queryStem ||
        (queryStem.length >= 4 &&
          (targetToken.startsWith(queryStem) || queryStem.startsWith(targetToken)))
    );
    if (found) hits++;
  }

  return hits / queryTokens.length;
}

export interface EmbeddingServiceOptions {
  getApiKey: () => string;
  logger?: (message: string) => void;
  timeoutMs?: number;
}

export class EmbeddingService {
  private readonly getApiKey: () => string;
  private readonly log: (message: string) => void;
  private readonly timeoutMs: number;

  constructor(options: EmbeddingServiceOptions) {
    this.getApiKey = options.getApiKey;
    this.log = options.logger || ((message: string) => (/fail|error|unavailable|could not|timed out/i.test(message) ? console.error(message) : console.log(message)));
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  /** Embeds text with Gemini, falling back to the local hashed embedding. */
  public async embed(text: string, role: EmbeddingRole = 'document'): Promise<EmbeddingVector> {
    const clean = (text || '').trim();
    const apiKey = this.getApiKey();

    if (clean && apiKey) {
      for (const model of GEMINI_EMBEDDING_MODELS) {
        try {
          const vector = await this.embedWithGemini(clean, role, model, apiKey);
          if (vector.length > 0) {
            return { vector, model, usedFallback: false };
          }
        } catch (err: any) {
          this.log(`[Embeddings] ${model} failed: ${err?.message}`);
        }
      }
    }

    return {
      vector: localEmbedding(clean),
      model: LOCAL_EMBEDDING_MODEL,
      usedFallback: true,
    };
  }

  private async embedWithGemini(
    text: string,
    role: EmbeddingRole,
    model: string,
    apiKey: string
  ): Promise<number[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${encodeURIComponent(
          apiKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            taskType: role === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
            outputDimensionality: GEMINI_DIMENSIONS,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`HTTP ${response.status}: ${detail.slice(0, 200)}`);
      }

      const body: any = await response.json();
      const values = body?.embedding?.values;
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error('response contained no embedding values');
      }

      return values as number[];
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Packs a float vector into a compact BLOB for SQLite storage. */
export function encodeEmbedding(vector: number[]): Uint8Array {
  const floats = Float32Array.from(vector);
  return new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
}

/** Unpacks a BLOB written by {@link encodeEmbedding}. */
export function decodeEmbedding(value: SqlValue): number[] {
  if (!value) return [];

  if (value instanceof Uint8Array) {
    const copy = value.byteOffset === 0 && value.byteLength === value.buffer.byteLength
      ? value
      : value.slice();
    return Array.from(new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4));
  }

  return [];
}
