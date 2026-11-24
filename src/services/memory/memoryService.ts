import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import {
  ChatMessage,
  FimaStats,
  MemoryActivityItem,
  MemoryHistoryItem,
  MemoryInputPayload,
  MemoryItem,
  MemoryStats,
  MemoryStatus,
  MemoryType,
  ProjectInputPayload,
  ProjectItem,
} from '../../shared/types';
import { settingsStore } from '../storage/settingsStore';
import { ConversationStore, MAX_STORED_MESSAGES } from './conversationStore';
import { EmbeddingService } from './embeddings';
import { ExtractedMemory, MemoryExtractor } from './memoryExtractor';
import { MemoryStore } from './memoryStore';
import { migrate } from './schema';
import { SqliteDatabase } from './sqliteDatabase';
import { evaluateGate, GateInput } from './memoryGate';
import { MemoryActivityLog } from './memoryActivity';
import { MemoryHistoryTracker } from './memoryHistory';
import { MemoryLifecycleManager } from './memoryLifecycle';
import { ProjectMemoryManager } from './projectMemory';
import { buildMemoryContextBlock, ContextBuilderInput } from './memoryContextBuilder';
import { resolveConflict, likelyConflict } from './memoryConflict';

export interface MemoryServiceOptions {
  dbPath?: string;
  logger?: (message: string) => void;
}

/** Resolves the SQLite file location, falling back to a workspace folder outside Electron. */
export function defaultMemoryDbPath(): string {
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
  gateDecision?: string;
}

/**
 * FIMA V1 — Enhanced formatMemoryContext.
 * Now delegates to MemoryContextBuilder for structured, project-aware context.
 * Falls back to simple format when builder is not available.
 */
export function formatMemoryContext(memories: MemoryItem[]): string {
  if (memories.length === 0) return '';

  const lines = memories
    .slice(0, 9)
    .filter((m) => !m.status || m.status === 'active')
    .map(
      (memory) =>
        `- [${memory.kind}${memory.importance >= 4 ? ', important' : ''}] ${memory.title}: ${memory.content}`
    )
    .join('\n');

  if (!lines) return '';

  return `LONG-TERM MEMORY (things you remember about the user from earlier conversations):
${lines}

How to use this memory:
- Use these details naturally when they are relevant, the way a friend who remembers would.
- Never say "according to my memory database" and never read the list aloud verbatim.
- If the user corrects one of these details, accept the correction and use the new information.
- Do not invent memories that are not listed here.`;
}

/**
 * FIMA V1 — Central Memory Service
 *
 * Integrates all FIMA modules:
 *   - Memory Intelligence Gate (pre-filter before extraction)
 *   - Structured memory records with lifecycle status
 *   - Project Memory Manager
 *   - Memory Lifecycle Manager (expiry, dedup, merge)
 *   - Memory Conflict Resolution
 *   - Memory Context Builder (structured AI context)
 *   - Memory Activity Log (audit trail)
 *   - Memory History Tracker (versioning)
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

  // FIMA V1 modules (initialized in openInternal)
  private activityLog?: MemoryActivityLog;
  private historyTracker?: MemoryHistoryTracker;
  private lifecycleManager?: MemoryLifecycleManager;
  private projectManager?: ProjectMemoryManager;

  /** Serialises background extraction so turns are processed in order. */
  private extractionChain: Promise<void> = Promise.resolve();

  /** Background maintenance debounce — run at most once every 5 minutes. */
  private lastMaintenanceAt = 0;
  private readonly MAINTENANCE_INTERVAL_MS = 5 * 60_000;

  constructor(options: MemoryServiceOptions = {}) {
    this.dbPath = options.dbPath || defaultMemoryDbPath();
    this.log = options.logger ||
      ((message: string) =>
        /fail|error|unavailable|could not|timed out/i.test(message)
          ? console.error(message)
          : console.log(message));
  }

  public getDatabasePath(): string {
    return this.dbPath;
  }

  public async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.openInternal().catch((err) => {
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
      getModelName: () => settingsStore.getSettings().modelName || 'gemini-3.1-pro-preview',
      logger: this.log,
    });

    // FIMA V1 modules
    this.activityLog = new MemoryActivityLog(db);
    this.historyTracker = new MemoryHistoryTracker(db);
    this.lifecycleManager = new MemoryLifecycleManager(db, this.historyTracker, this.activityLog);
    this.projectManager = new ProjectMemoryManager(db);

    this.log(`[MemoryService] FIMA V1 ready at ${this.dbPath}`);
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
   * FIMA V1 — Enhanced context building.
   * Uses MemoryContextBuilder for structured, project-aware context.
   * Excludes outdated/superseded memories from active facts.
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
        services.store.search(userText, 8),
        Promise.resolve(services.store.core(5)),
      ]);

      // FIMA V1: Get active project context
      let activeProject: ProjectItem | undefined;
      let projectMemories: MemoryItem[] = [];
      if (this.projectManager) {
        activeProject = this.projectManager.detectActiveProject(userText);
        if (activeProject) {
          projectMemories = await this.getProjectMemories(activeProject.id, 8);
        }
      }

      // Pull in related memories for top hits
      const merged = new Map<string, MemoryItem>();
      for (const hit of relevant) merged.set(hit.id, hit);
      for (const item of core) if (!merged.has(item.id)) merged.set(item.id, item);
      for (const hit of relevant.slice(0, 2)) {
        for (const related of services.store.relatedTo(hit.id, 2)) {
          if (!merged.has(related.id)) merged.set(related.id, related);
        }
      }

      // FIMA V1: Use MemoryContextBuilder
      const builderInput: ContextBuilderInput = {
        relevantMemories: Array.from(merged.values()),
        coreMemories: core,
        activeProject,
        projectMemories,
      };

      const result = buildMemoryContextBlock(builderInput);
      const block = result.block;

      // Log retrieval activity
      if (this.activityLog && result.memoriesIncluded > 0) {
        this.activityLog.log('retrieved', {
          reason: `Retrieved ${result.memoriesIncluded} memories for context`,
          details: { query: userText.slice(0, 100), count: result.memoriesIncluded },
        });
      }

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

  /**
   * FIMA V1 — Enhanced enqueueExtraction with Intelligence Gate.
   * The gate pre-filters trivial exchanges BEFORE any AI extraction call.
   */
  public enqueueExtraction(
    userText: string,
    assistantText: string,
    options: { isL0Response?: boolean; isExplicitToolSave?: boolean } = {}
  ): void {
    if (!this.isEnabled()) return;

    // ── FIMA V1: Pre-filter with Intelligence Gate ─────────────────────────
    const gateInput: GateInput = {
      userText,
      assistantText,
      isL0Response: options.isL0Response,
      isExplicitToolSave: options.isExplicitToolSave,
    };
    const gateResult = evaluateGate(gateInput);

    if (gateResult.decision === 'ignore') {
      this.log(`[MemoryGate] IGNORE (${gateResult.reason})`);
      this.activityLog?.log('ignored', {
        reason: gateResult.reason,
        details: { userTextPreview: userText.slice(0, 80) },
      });
      return;
    }

    this.extractionChain = this.extractionChain
      .then(async () => {
        await this.extractAndStore(userText, assistantText, gateResult.decision);
        // Schedule background maintenance if due
        this.scheduleBackgroundMaintenance();
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
    return this.extractAndStore(userText, assistantText, 'save');
  }

  private async extractAndStore(
    userText: string,
    assistantText: string,
    gateDecision: string
  ): Promise<ExchangeSummary> {
    const services = await this.ready();
    if (!services || !this.extractor) {
      return { added: 0, updated: 0, skipped: 0, method: 'unavailable' };
    }

    const outcome = await this.extractor.extract(userText, assistantText);
    if (outcome.memories.length === 0) {
      return { added: 0, updated: 0, skipped: 0, method: outcome.method, gateDecision };
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const candidate of outcome.memories) {
      try {
        // ── FIMA V1: Set appropriate memory_type based on gate decision ──────
        const memoryType: MemoryType = gateDecision === 'temporary' ? 'working' : 'long_term';
        const status: MemoryStatus = gateDecision === 'temporary' ? 'temporary' : 'active';

        // For temporary memories, set expiration to 24 hours
        const expirationAt = memoryType === 'working'
          ? new Date(Date.now() + 86_400_000).toISOString()
          : undefined;

        // ── FIMA V1: Check for conflicts before storing ───────────────────────
        if (memoryType === 'long_term') {
          const existingConflict = await this.checkForConflict(candidate, services.store, userText);
          if (existingConflict) {
            updated++;
            continue;
          }
        }

        const result = await services.store.create({
          ...this.toInput(candidate),
          // @ts-ignore — extra FIMA V1 fields passed through to memoryStore
          memoryType,
          status,
          expirationAt,
        });

        if (result.action === 'created') {
          added++;
          this.historyTracker?.record(result.memory.id, 'created', {
            newContent: result.memory.content,
            reason: `Auto-extracted via ${outcome.method}`,
            source: 'memory_extractor',
          });
          this.activityLog?.log('saved', {
            memoryId: result.memory.id,
            reason: `Auto-extracted: "${candidate.title}" (${outcome.method})`,
          });
        } else {
          updated++;
          this.historyTracker?.record(result.memory.id, 'updated', {
            newContent: result.memory.content,
            reason: `Updated via ${outcome.method}`,
            source: 'memory_extractor',
          });
          this.activityLog?.log('updated', {
            memoryId: result.memory.id,
            reason: `Updated: "${candidate.title}" (${outcome.method})`,
          });
        }
      } catch (err: any) {
        skipped++;
        this.log(`[MemoryService] Could not store memory "${candidate.title}": ${err?.message}`);
      }
    }

    if (added + updated > 0) {
      this.log(`[MemoryService] FIMA: ${added} new, ${updated} updated (${outcome.method}, gate=${gateDecision}).`);
      this.contextCache.clear();
    }

    return { added, updated, skipped, method: outcome.method, gateDecision };
  }

  /**
   * FIMA V1: Check if new memory conflicts with an existing one.
   * Returns true if the conflict was handled (caller should skip normal create).
   */
  private async checkForConflict(
    candidate: ExtractedMemory,
    store: MemoryStore,
    sourceText: string
  ): Promise<boolean> {
    if (!candidate.subject) return false;

    // Find existing memory with same subject
    const existing = await store.findBySubject(candidate.subject);
    if (!existing) return false;

    if (!likelyConflict(existing.content, candidate.content)) return false;

    const resolution = resolveConflict(
      existing as MemoryItem,
      candidate.content,
      candidate.importance,
      sourceText
    );

    if (resolution.resolution === 'pending_review') {
      // Mark existing as pending_review without overwriting
      this.db?.run(
        `UPDATE memories SET status = 'pending_review', updated_at = ? WHERE id = ?;`,
        [new Date().toISOString(), existing.id]
      );
      this.activityLog?.log('conflict_detected', {
        memoryId: existing.id,
        reason: `Conflict detected with existing memory "${existing.title}" — marked for review`,
        details: { resolution: resolution.resolution, reason: resolution.reason },
      });
      return true;
    }

    if (resolution.resolution === 'overwrite') {
      // Let normal create/update flow handle it (findDuplicate will update)
      return false;
    }

    if (resolution.resolution === 'ignore_new') {
      this.activityLog?.log('ignored', {
        memoryId: existing.id,
        reason: `Conflict resolved: keeping existing higher-importance memory "${existing.title}"`,
      });
      return true;
    }

    return false;
  }

  private scheduleBackgroundMaintenance(): void {
    const now = Date.now();
    if (now - this.lastMaintenanceAt < this.MAINTENANCE_INTERVAL_MS) return;
    this.lastMaintenanceAt = now;

    setImmediate(async () => {
      try {
        const result = await this.lifecycleManager?.runMaintenance();
        if (result && (result.expired + result.merged) > 0) {
          this.log(`[MemoryLifecycle] Maintenance: ${result.expired} expired, ${result.merged} merged`);
          this.contextCache.clear();
        }
      } catch (err: any) {
        this.log(`[MemoryLifecycle] Maintenance failed: ${err?.message}`);
      }
    });
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

  // ── Public API — Memory CRUD ───────────────────────────────────────────────

  public async search(query: string, limit = 8): Promise<MemoryItem[]> {
    const services = await this.ready();
    if (!services) return [];
    return services.store.search(query, limit);
  }

  public async list(options: {
    kind?: MemoryItem['kind'];
    limit?: number;
    status?: MemoryStatus;
    memoryType?: MemoryType;
  } = {}): Promise<MemoryItem[]> {
    const services = await this.ready();
    if (!services) return [];
    return services.store.list(options);
  }

  public async create(input: MemoryInputPayload): Promise<{ memory: MemoryItem; action: 'created' | 'updated' }> {
    const services = await this.ready();
    if (!services) throw new Error('Memory database is unavailable.');
    const result = await services.store.create({ ...input, source: 'manual' });

    this.historyTracker?.record(result.memory.id, result.action === 'created' ? 'created' : 'updated', {
      newContent: result.memory.content,
      reason: 'Manual creation by user',
      source: 'manual',
    });
    this.activityLog?.log(result.action === 'created' ? 'saved' : 'updated', {
      memoryId: result.memory.id,
      reason: `Manually ${result.action}: "${result.memory.title}"`,
    });

    this.contextCache.clear();
    return result;
  }

  public async update(id: string, patch: Partial<MemoryInputPayload>): Promise<MemoryItem | null> {
    const services = await this.ready();
    if (!services) return null;

    const before = services.store.get(id);
    const result = (await services.store.update(id, patch)) || null;

    if (result && before) {
      this.historyTracker?.record(id, 'updated', {
        oldContent: before.content,
        newContent: result.content,
        reason: 'User edited memory',
        source: 'manual',
      });
      this.activityLog?.log('updated', {
        memoryId: id,
        reason: `User edited: "${result.title}"`,
      });
      this.contextCache.clear();
    }

    return result;
  }

  public async remove(id: string): Promise<boolean> {
    const services = await this.ready();
    if (!services) return false;

    const mem = services.store.get(id);
    const result = services.store.delete(id);
    if (result && mem) {
      this.historyTracker?.record(id, 'deleted', {
        oldContent: mem.content,
        reason: 'Deleted by user',
        source: 'manual',
      });
      this.activityLog?.log('deleted', {
        memoryId: id,
        reason: `User deleted: "${mem.title}"`,
      });
      this.contextCache.clear();
    }
    return result;
  }

  public async archive(id: string): Promise<boolean> {
    const services = await this.ready();
    if (!services) return false;

    const mem = services.store.get(id);
    if (!mem) return false;

    this.lifecycleManager?.archive(id, 'Archived by user');
    this.contextCache.clear();
    return true;
  }

  public async getStats(): Promise<MemoryStats> {
    const services = await this.ready();
    if (!services) {
      return { total: 0, byKind: {}, embedded: 0, databaseBytes: 0 };
    }
    return services.store.stats();
  }

  public async getFimaStats(): Promise<FimaStats> {
    const services = await this.ready();
    if (!services) {
      return {
        totalActive: 0, totalTemporary: 0, totalArchived: 0,
        totalOutdated: 0, totalPendingReview: 0,
        byKind: {}, byMemoryType: {},
        projectCount: 0, activityLast24h: 0,
        embedded: 0, databaseBytes: 0,
      };
    }

    const statusCounts = this.lifecycleManager?.statusCounts() || {};
    const baseStats = services.store.stats();

    return {
      totalActive: statusCounts['active'] || 0,
      totalTemporary: statusCounts['temporary'] || 0,
      totalArchived: statusCounts['archived'] || 0,
      totalOutdated: statusCounts['outdated'] || 0,
      totalPendingReview: statusCounts['pending_review'] || 0,
      byKind: baseStats.byKind,
      byMemoryType: {},
      projectCount: this.projectManager?.count() || 0,
      activityLast24h: this.activityLog?.countLast24h() || 0,
      embedded: baseStats.embedded,
      databaseBytes: baseStats.databaseBytes,
    };
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

  public async getMemoryHistory(memoryId: string): Promise<MemoryHistoryItem[]> {
    await this.ready();
    return this.historyTracker?.forMemory(memoryId) || [];
  }

  public async getActivity(limit = 50): Promise<MemoryActivityItem[]> {
    await this.ready();
    return this.activityLog?.recent(limit) || [];
  }

  public async exportMemories(): Promise<string> {
    const memories = await this.list({ limit: 1000 });
    const projects = await this.listProjects();
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        version: 'fima-v1',
        memories,
        projects,
      },
      null,
      2
    );
  }

  public async clearCategory(category: string): Promise<number> {
    const services = await this.ready();
    if (!services || !this.db) return 0;
    const count = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM memories WHERE status = ? OR memory_type = ?;',
      [category, category]
    )?.count ?? 0;
    this.db.run(
      'DELETE FROM memories WHERE status = ? OR memory_type = ?;',
      [category, category]
    );
    this.db.flush();
    this.contextCache.clear();
    this.activityLog?.log('deleted', {
      reason: `Cleared memory category "${category}" (${count} items removed)`,
    });
    return count;
  }

  // ── Project Memory API ─────────────────────────────────────────────────────

  public async listProjects(): Promise<ProjectItem[]> {
    await this.ready();
    return this.projectManager?.list() || [];
  }

  public async getProject(id: string): Promise<ProjectItem | null> {
    await this.ready();
    return this.projectManager?.get(id) || null;
  }

  public async createProject(input: ProjectInputPayload): Promise<ProjectItem> {
    await this.ready();
    if (!this.projectManager) throw new Error('Project manager unavailable.');
    const project = this.projectManager.create(input);
    this.activityLog?.log('saved', {
      projectId: project.id,
      reason: `Project created: "${project.name}"`,
    });
    return project;
  }

  public async updateProject(id: string, patch: Partial<ProjectInputPayload>): Promise<ProjectItem | null> {
    await this.ready();
    return this.projectManager?.update(id, patch) || null;
  }

  public async deleteProject(id: string): Promise<boolean> {
    await this.ready();
    return this.projectManager?.delete(id) || false;
  }

  public async getProjectMemories(projectId: string, limit = 50): Promise<MemoryItem[]> {
    const services = await this.ready();
    if (!services) return [];
    return services.store.listByProject(projectId, limit);
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
      this.activityLog = undefined;
      this.historyTracker = undefined;
      this.lifecycleManager = undefined;
      this.projectManager = undefined;
    }
  }

  /**
   * Synchronous flush for `will-quit`, where promises are not guaranteed to settle.
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
    this.activityLog = undefined;
    this.historyTracker = undefined;
    this.lifecycleManager = undefined;
    this.projectManager = undefined;
  }

  /** Test helper: true once the database file exists on disk. */
  public isPersisted(): boolean {
    return fs.existsSync(this.dbPath);
  }
}

export const memoryService = new MemoryService();
