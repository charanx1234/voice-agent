import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { ChatMessage, MemoryInputPayload, MemoryItem, MemoryStats } from '../../shared/types';
import { settingsStore } from '../storage/settingsStore';
import { ConversationStore, MAX_STORED_MESSAGES } from './conversationStore';
import { EmbeddingService } from './embeddings';
import { ExtractedMemory, MemoryExtractor } from './memoryExtractor';
import { MemoryStore } from './memoryStore';
import { migrate } from './schema';
import { SqliteDatabase } from './sqliteDatabase';

export interface MemoryServiceOptions {
  dbPath?: string;
  logger?: (message: string) => void;
}

/** Resolves the SQLite file location, falling back to a workspace folder outside Electron. */
export function defaultMemoryDbPath(): string {
  // Lets automated checks point at a throwaway database instead of the user's real one.
  if (process.env.FRIDAY_MEMORY_DB) {
    return process.env.FRIDAY_MEMORY_DB;
  }

  try {
    if (app && typeof (app as any).getPath === 'function') {
      return path.join(app.getPath('userData'), 'friday_memory.db');
    }
  } catch {
    // not running under Electron (tests, scripts)
  }
  return path.join(process.cwd(), '.data', 'friday_memory.db');
}

export interface ExchangeSummary {
  added: number;
  updated: number;
  skipped: number;
  method: string;
}

/**
 * Formats retrieved memories into the block appended to FRIDAY's system instruction.
 * Pure function so formatting stays testable without touching the database.
 */
export function formatMemoryContext(memories: MemoryItem[]): string {
  if (memories.length === 0) return '';

  const lines = memories
    .slice(0, 9)
    .map(
      (memory) =>
        `- [${memory.kind}${memory.importance >= 4 ? ', important' : ''}] ${memory.title}: ${memory.content}`
    )
    .join('\n');

  return `LONG-TERM MEMORY (things you remember about the user from earlier conversations):
${lines}

How to use this memory:
- Use these details naturally when they are relevant, the way a friend who remembers would.
- Never say "according to my memory database" and never read the list aloud verbatim.
- If the user corrects one of these details, accept the correction and use the new information.
- Do not invent memories that are not listed here.`;
}

/**
 * Owns the long-term memory system: SQLite storage, semantic retrieval, Gemini
 * extraction, and the rolling conversation transcript. Everything is lazy-initialised
 * so a missing or locked database degrades gracefully instead of breaking chat.
 */
export class MemoryService {
  private readonly dbPath: string;
  private readonly log: (message: string) => void;

  private db?: SqliteDatabase;
  private memoryStore?: MemoryStore;
  private conversationStore?: ConversationStore;
  private extractor?: MemoryExtractor;
  private initPromise?: Promise<void>;
  private readonly contextCache = new Map<string, { block: string; expiresAt: number }>();

  /** Serialises background extraction so turns are processed in order. */
  private extractionChain: Promise<void> = Promise.resolve();

  constructor(options: MemoryServiceOptions = {}) {
    this.dbPath = options.dbPath || defaultMemoryDbPath();
    this.log = options.logger || ((message: string) => (/fail|error|unavailable|could not|timed out/i.test(message) ? console.error(message) : console.log(message)));
  }

  public getDatabasePath(): string {
    return this.dbPath;
  }

  public async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.openInternal().catch((err) => {
        // Allow a later retry (e.g. a transient file lock) instead of caching failure.
        this.initPromise = undefined;
        throw err;
      });
    }
    return this.initPromise;
  }

  private async openInternal(): Promise<void> {
    const db = await SqliteDatabase.open(this.dbPath, { logger: this.log });
    migrate(db);

    const embeddings = new EmbeddingService({
      getApiKey: () => settingsStore.getRawApiKey(),
      logger: this.log,
    });

    this.db = db;
    this.memoryStore = new MemoryStore(db, embeddings);
    this.conversationStore = new ConversationStore(db);
    this.extractor = new MemoryExtractor({
      getApiKey: () => settingsStore.getRawApiKey(),
      getModelName: () => settingsStore.getSettings().modelName || 'gemini-3.5-flash-lite',
      logger: this.log,
    });

    this.log(`[MemoryService] Ready at ${this.dbPath}`);
  }

  public isEnabled(): boolean {
    return settingsStore.getSettings().memoryEnabled !== false;
  }

  private async ready(): Promise<{
    store: MemoryStore;
    conversations: ConversationStore;
  } | null> {
    try {
      await this.init();
      if (!this.memoryStore || !this.conversationStore) return null;
      return { store: this.memoryStore, conversations: this.conversationStore };
    } catch (err: any) {
      this.log(`[MemoryService] Unavailable: ${err?.message}`);
      return null;
    }
  }

  /**
   * Builds the memory block injected into the system instruction for this turn.
   * Returns an empty string when memory is disabled or nothing relevant exists.
   */
  public async buildContextBlock(userText: string): Promise<string> {
    if (!this.isEnabled()) return '';

    const cacheKey = userText.trim().toLowerCase();
    const cached = this.contextCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.block;

    const services = await this.ready();
    if (!services || !userText.trim()) return '';

    try {
      const [relevant, core] = await Promise.all([
        services.store.search(userText, 6),
        Promise.resolve(services.store.core(3)),
      ]);

      const merged = new Map<string, MemoryItem>();
      for (const hit of relevant) merged.set(hit.id, hit);
      for (const item of core) if (!merged.has(item.id)) merged.set(item.id, item);

      // Pull in connected memories (same project/person) for the best two hits.
      for (const hit of relevant.slice(0, 2)) {
        for (const related of services.store.relatedTo(hit.id, 2)) {
          if (!merged.has(related.id)) merged.set(related.id, related);
        }
      }

      const block = formatMemoryContext(Array.from(merged.values()));
      if (this.contextCache.size >= 32) {
        const oldest = this.contextCache.keys().next().value;
        if (oldest) this.contextCache.delete(oldest);
      }
      this.contextCache.set(cacheKey, { block, expiresAt: Date.now() + 20_000 });
      return block;
    } catch (err: any) {
      this.log(`[MemoryService] Context build failed: ${err?.message}`);
      return '';
    }
  }

  /** Persists one user+assistant exchange to the rolling transcript. */
  public async appendExchange(
    userText: string,
    assistantText: string,
    meta: { language?: string; isVoice?: boolean; isError?: boolean } = {}
  ): Promise<void> {
    const services = await this.ready();
    if (!services) return;

    try {
      if (userText.trim()) {
        services.conversations.append({
          role: 'user',
          text: userText,
          language: meta.language,
          isVoice: meta.isVoice,
        });
      }
      if (assistantText.trim()) {
        services.conversations.append({
          role: 'assistant',
          text: assistantText,
          language: meta.language,
          isError: meta.isError,
        });
      }
    } catch (err: any) {
      this.log(`[MemoryService] Failed to persist transcript: ${err?.message}`);
    }
  }

  /** Runs extraction off the reply path so chat latency is unaffected. */
  public enqueueExtraction(userText: string, assistantText: string): void {
    if (!this.isEnabled()) return;

    this.extractionChain = this.extractionChain
      .then(async () => {
        await this.extractAndStore(userText, assistantText);
      })
      .catch((err: any) => {
        this.log(`[MemoryService] Background extraction failed: ${err?.message}`);
      });
  }

  /** Awaits transcript persistence plus extraction (used by tests and tools). */
  public async processExchange(
    userText: string,
    assistantText: string,
    meta: { language?: string; isVoice?: boolean } = {}
  ): Promise<ExchangeSummary> {
    await this.appendExchange(userText, assistantText, meta);
    if (!this.isEnabled()) {
      return { added: 0, updated: 0, skipped: 0, method: 'disabled' };
    }
    return this.extractAndStore(userText, assistantText);
  }

  private async extractAndStore(userText: string, assistantText: string): Promise<ExchangeSummary> {
    const services = await this.ready();
    if (!services || !this.extractor) {
      return { added: 0, updated: 0, skipped: 0, method: 'unavailable' };
    }

    const outcome = await this.extractor.extract(userText, assistantText);
    if (outcome.memories.length === 0) {
      return { added: 0, updated: 0, skipped: 0, method: outcome.method };
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const candidate of outcome.memories) {
      try {
        const result = await services.store.create(this.toInput(candidate));
        if (result.action === 'created') added++;
        else updated++;
      } catch (err: any) {
        skipped++;
        this.log(`[MemoryService] Could not store memory "${candidate.title}": ${err?.message}`);
      }
    }

    if (added + updated > 0) {
      this.log(`[MemoryService] ${added} new, ${updated} updated (${outcome.method}).`);
      this.contextCache.clear();
    }

    return { added, updated, skipped, method: outcome.method };
  }

  private toInput(candidate: ExtractedMemory): MemoryInputPayload {
    return {
      kind: candidate.kind,
      title: candidate.title,
      content: candidate.content,
      subject: candidate.subject,
      importance: candidate.importance,
    };
  }

  public async search(query: string, limit = 8): Promise<MemoryItem[]> {
    const services = await this.ready();
    if (!services) return [];
    return services.store.search(query, limit);
  }

  public async list(options: { kind?: MemoryItem['kind']; limit?: number } = {}): Promise<MemoryItem[]> {
    const services = await this.ready();
    if (!services) return [];
    return services.store.list(options);
  }

  public async create(input: MemoryInputPayload): Promise<{ memory: MemoryItem; action: 'created' | 'updated' }> {
    const services = await this.ready();
    if (!services) throw new Error('Memory database is unavailable.');
    return services.store.create({ ...input, source: 'manual' });
  }

  public async update(id: string, patch: Partial<MemoryInputPayload>): Promise<MemoryItem | null> {
    const services = await this.ready();
    if (!services) return null;
    return (await services.store.update(id, patch)) || null;
  }

  public async remove(id: string): Promise<boolean> {
    const services = await this.ready();
    if (!services) return false;
    return services.store.delete(id);
  }

  public async getStats(): Promise<MemoryStats> {
    const services = await this.ready();
    if (!services) {
      return { total: 0, byKind: {}, embedded: 0, databaseBytes: 0 };
    }
    return services.store.stats();
  }

  public async count(): Promise<number> {
    const services = await this.ready();
    return services ? services.store.count() : 0;
  }

  public async loadConversation(limit = MAX_STORED_MESSAGES): Promise<ChatMessage[]> {
    const services = await this.ready();
    if (!services) return [];
    return services.conversations.loadRecent(limit);
  }

  public async clearConversation(): Promise<boolean> {
    const services = await this.ready();
    if (!services) return false;
    services.conversations.clear();
    return true;
  }

  /** Flushes pending writes; call before the app quits. */
  public async shutdown(): Promise<void> {
    try {
      await this.extractionChain;
    } catch {
      // ignore in-flight extraction failures during shutdown
    }

    if (this.db) {
      this.db.close();
      this.db = undefined;
      this.memoryStore = undefined;
      this.conversationStore = undefined;
      this.extractor = undefined;
      this.initPromise = undefined;
    }
  }

  /**
   * Synchronous flush for `will-quit`, where promises are not guaranteed to settle.
   * Closing the database writes the final snapshot atomically.
   */
  public flushNow(): void {
    try {
      this.db?.close();
    } catch (err: any) {
      this.log(`[MemoryService] Final flush failed: ${err?.message}`);
    }
    this.db = undefined;
    this.memoryStore = undefined;
    this.conversationStore = undefined;
    this.extractor = undefined;
    this.initPromise = undefined;
  }

  /** Test helper: true once the database file exists on disk. */
  public isPersisted(): boolean {
    return fs.existsSync(this.dbPath);
  }
}

export const memoryService = new MemoryService();
