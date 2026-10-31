import { GoogleGenerativeAI } from '@google/generative-ai';
import { MEMORY_KINDS, MemoryKind } from './memoryStore';

export interface ExtractedMemory {
  kind: MemoryKind;
  subject: string;
  title: string;
  content: string;
  importance: number;
}

export interface ExtractionOutcome {
  memories: ExtractedMemory[];
  method: 'gemini' | 'heuristic' | 'none';
}

export interface MemoryExtractorOptions {
  getApiKey: () => string;
  getModelName: () => string;
  logger?: (message: string) => void;
  timeoutMs?: number;
}

const MAX_MEMORIES_PER_TURN = 3;

function buildExtractionPrompt(userText: string, assistantText: string): string {
  return `You extract durable long-term memories about the USER from a conversation turn.
Return ONLY a JSON array. Return [] when nothing is worth remembering.

RULES:
- Only extract stable facts about the user: their name, city, job, family, pets, health, likes/dislikes, reply-language preferences, standing instructions, and ongoing projects/goals.
- NEVER extract: greetings, small talk, one-off questions, temporary states ("I'm tired today"), anything the assistant said, general world knowledge, or secrets (passwords, OTPs, card/account numbers, ID numbers).
- Never invent details. Only what the user explicitly stated or clearly implied.
- Prefer 0 memories. Extract at most ${MAX_MEMORIES_PER_TURN}.
- "kind" must be one of: ${MEMORY_KINDS.join(', ')}.
  - personal: identity, location, family, health, job.
  - preference: tastes, communication style, reply language.
  - project: ongoing work, goals, deadlines, tech stack.
  - instruction: a standing rule for how FRIDAY should behave ("always answer briefly").
  - fact: other stable facts about the user's world.
- "subject" is a short lowercase key used for de-duplication, e.g. "name", "city", "reply-language", "project.friday", "favourite-food".
- "content" is ONE concise third-person sentence, e.g. "User's name is Ram Charan.".
- "importance" is 1-5, where 5 is core identity or an explicit instruction.

USER SAID:
"""${userText.slice(0, 4000)}"""

FRIDAY REPLIED:
"""${assistantText.slice(0, 2000)}"""

JSON array:`;
}

function clampImportance(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 3;
  return Math.min(5, Math.max(1, Math.round(numeric)));
}

function normalizeKind(value: unknown): MemoryKind {
  const candidate = String(value || '').toLowerCase().trim() as MemoryKind;
  return MEMORY_KINDS.includes(candidate) ? candidate : 'fact';
}

/** Parses a model response into validated memories, tolerating code fences and prose. */
export function parseExtractionResponse(raw: string): ExtractedMemory[] {
  if (!raw) return [];

  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  if (!text.startsWith('[')) {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end <= start) return [];
    text = text.slice(start, end + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const list = Array.isArray(parsed) ? parsed : [];
  const memories: ExtractedMemory[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;

    const content = String(record.content || '').trim();
    const title = String(record.title || '').trim() || content.slice(0, 60);
    if (!content || !title) continue;

    memories.push({
      kind: normalizeKind(record.kind),
      subject: String(record.subject || '').trim().toLowerCase().slice(0, 60),
      title: title.slice(0, 120),
      content: content.slice(0, 600),
      importance: clampImportance(record.importance),
    });

    if (memories.length >= MAX_MEMORIES_PER_TURN) break;
  }

  return memories;
}

/**
 * Offline-safe extraction for explicit memories ("remember that I..."). This keeps
 * "remember this" working even when the Gemini call fails or no key is configured.
 */
export function heuristicallyExtract(userText: string): ExtractedMemory[] {
  const text = (userText || '').trim();
  if (!text) return [];

  const lower = text.toLowerCase();
  const results: ExtractedMemory[] = [];

  const push = (kind: MemoryKind, title: string, content: string, subject: string, importance = 4) => {
    if (results.some((item) => item.content === content)) return;
    results.push({ kind, title, content, subject, importance });
  };

  const nameMatch = text.match(/\bmy name is\s+([\p{L}\s.'-]{2,40})/iu);
  if (nameMatch) {
    const name = nameMatch[1].trim().replace(/[.,]$/, '');
    push('personal', 'Name', `User's name is ${name}.`, 'name', 5);
  }

  const callMeMatch = text.match(/\bcall me\s+([\p{L}\s.'-]{2,30})/iu);
  if (callMeMatch) {
    const nickname = callMeMatch[1].trim().replace(/[.,]$/, '');
    push('instruction', 'Preferred name', `User prefers to be called ${nickname}.`, 'preferred-name', 5);
  }

  const locationMatch = text.match(/\bi (?:live|stay) in\s+([\p{L}\s.'-]{2,40})/iu);
  if (locationMatch) {
    const place = locationMatch[1].trim().replace(/[.,]$/, '');
    push('personal', 'Location', `User lives in ${place}.`, 'city', 4);
  }

  const workMatch = text.match(/\bi(?:'m| am) working on\s+([^.!?]{3,120})/iu);
  if (workMatch) {
    const project = workMatch[1].trim();
    push('project', 'Current project', `User is working on ${project}.`, 'project.current', 4);
  }

  const rememberMatch = text.match(
    /\b(?:remember|note|keep in mind)\s+(?:that\s+)?(.{3,200}?)(?:[.!?]|$)/iu
  );
  if (rememberMatch) {
    const detail = rememberMatch[1].trim().replace(/[.,]$/, '');
    push('fact', detail.slice(0, 60), `User asked FRIDAY to remember: ${detail}.`, '', 4);
  }

  const preferMatch = text.match(/\bi (?:prefer|like|love|enjoy)\s+([^.!?]{2,120})/iu);
  if (preferMatch) {
    const thing = preferMatch[1].trim();
    push('preference', thing.slice(0, 60), `User likes ${thing}.`, '', 3);
  }

  const dislikeMatch = text.match(/\bi (?:hate|dislike|don't like|do not like)\s+([^.!?]{2,120})/iu);
  if (dislikeMatch) {
    const thing = dislikeMatch[1].trim();
    push('preference', thing.slice(0, 60), `User dislikes ${thing}.`, '', 3);
  }

  const alwaysMatch = text.match(/\b(?:always|never)\s+([^.!?]{3,120})/iu);
  if (alwaysMatch && /\b(you|your|reply|respond|answer)\b/i.test(lower)) {
    push(
      'instruction',
      'Standing instruction',
      `User instructed: ${text.slice(0, 200)}`,
      'instruction',
      4
    );
  }

  return results.slice(0, MAX_MEMORIES_PER_TURN);
}

export class MemoryExtractor {
  private readonly getApiKey: () => string;
  private readonly getModelName: () => string;
  private readonly log: (message: string) => void;
  private readonly timeoutMs: number;

  constructor(options: MemoryExtractorOptions) {
    this.getApiKey = options.getApiKey;
    this.getModelName = options.getModelName;
    this.log = options.logger || ((message: string) => (/fail|error|unavailable|could not|timed out/i.test(message) ? console.error(message) : console.log(message)));
    this.timeoutMs = options.timeoutMs ?? 20000;
  }

  /** Asks Gemini what (if anything) is worth remembering from this exchange. */
  public async extract(userText: string, assistantText: string): Promise<ExtractionOutcome> {
    const hasContent = Boolean(userText && userText.trim());
    if (!hasContent) return { memories: [], method: 'none' };

    const apiKey = this.getApiKey();
    if (apiKey) {
      try {
        const memories = await this.extractWithGemini(userText, assistantText, apiKey);
        return { memories, method: 'gemini' };
      } catch (err: any) {
        this.log(`[MemoryExtractor] Gemini extraction failed, using heuristic fallback: ${err?.message}`);
      }
    }

    const memories = heuristicallyExtract(userText);
    return { memories, method: memories.length > 0 ? 'heuristic' : 'none' };
  }

  private async extractWithGemini(
    userText: string,
    assistantText: string,
    apiKey: string
  ): Promise<ExtractedMemory[]> {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: this.getModelName(),
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      } as any,
    });

    const result = await Promise.race([
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: buildExtractionPrompt(userText, assistantText) }] }],
      }),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('extraction timed out')), this.timeoutMs)
      ),
    ]);

    const response = await (result as any).response;
    const raw = response?.text?.() || '';
    return parseExtractionResponse(raw);
  }
}
