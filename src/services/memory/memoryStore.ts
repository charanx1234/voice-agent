import { MemoryKind, MemoryStatus, MemoryType } from '../../shared/types';
import { SqliteDatabase, SqlValue } from './sqliteDatabase';
import {
  EmbeddingService,
  cosineSimilarity,
  decodeEmbedding,
  encodeEmbedding,
  keywordOverlap,
  localEmbedding,
} from './embeddings';

export type { MemoryKind, MemoryStatus, MemoryType };

export const MEMORY_KINDS: MemoryKind[] = [
  'preference',
  'personal',
  'project',
  'fact',
  'instruction',
];

export type MemorySource = 'chat' | 'manual' | 'tool';

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  subject: string;
  title: string;
  content: string;
  importance: number;
  source: MemorySource;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  // FIMA V1 fields
  memoryType?: MemoryType;
  status?: MemoryStatus;
  confidence?: number;
  projectId?: string;
  sourceConversationId?: string;
  expirationAt?: string;
  version?: number;
  supersedesId?: string;
  extraMetadata?: Record<string, any>;
}

export interface MemoryInput {
  kind: MemoryKind;
  title: string;
  content: string;
  subject?: string;
  importance?: number;
  source?: MemorySource;
  // FIMA V1 fields
  memoryType?: MemoryType;
  status?: MemoryStatus;
  confidence?: number;
  projectId?: string;
  sourceConversationId?: string;
  expirationAt?: string;
  extraMetadata?: Record<string, any>;
}

export interface MemoryUpdate {
  kind?: MemoryKind;
  title?: string;
  content?: string;
  subject?: string;
  importance?: number;
  // FIMA V1 fields
  memoryType?: MemoryType;
  status?: MemoryStatus;
  confidence?: number;
  projectId?: string;
  sourceConversationId?: string;
  expirationAt?: string;
  version?: number;
  supersedesId?: string;
  extraMetadata?: Record<string, any>;
}

export interface MemoryHit extends MemoryRecord {
  score: number;
}

export interface MemoryStats {
  total: number;
  byKind: Record<string, number>;
  embedded: number;
  databaseBytes: number;
}

interface MemoryRow {
  id: string;
  kind: string;
  subject: string;
  title: string;
  content: string;
  importance: number;
  source: string;
  embedding: SqlValue;
  embedding_model: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  // FIMA V1 columns
  memory_type?: string;
  status?: string;
  confidence?: number;
  project_id?: string;
  source_conversation_id?: string;
  expiration_at?: string;
  version?: number;
  supersedes_id?: string;
  extra_metadata?: string;
}

const DUPLICATE_SIMILARITY = 0.93;
const MAX_CANDIDATES = 2000;

function clampImportance(value: number | undefined): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value as number)));
}

function normalizeSubject(subject: string | undefined): string {
  return (subject || '').trim().toLowerCase();
}

function toRecord(row: MemoryRow): MemoryRecord {
  let extraMeta: Record<string, any> | undefined;
  if (row.extra_metadata) {
    try {
      extraMeta = JSON.parse(row.extra_metadata);
    } catch {}
  }

  return {
    id: row.id,
    kind: (row.kind as MemoryKind) || 'fact',
    subject: row.subject || '',
    title: row.title,
    content: row.content,
    importance: row.importance,
    source: (row.source as MemorySource) || 'chat',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at || undefined,
    memoryType: (row.memory_type as MemoryType) || 'long_term',
    status: (row.status as MemoryStatus) || 'active',
    confidence: row.confidence !== undefined ? row.confidence : 0.8,
    projectId: row.project_id || undefined,
    sourceConversationId: row.source_conversation_id || undefined,
    expirationAt: row.expiration_at || undefined,
    version: row.version || 1,
    supersedesId: row.supersedes_id || undefined,
    extraMetadata: extraMeta,
  };
}

export class MemoryStore {
  private readonly db: SqliteDatabase;
  private readonly embeddings: EmbeddingService;

  constructor(db: SqliteDatabase, embeddings: EmbeddingService) {
    this.db = db;
    this.embeddings = embeddings;
  }

  /**
   * Saves a memory. Near-duplicates (same subject, or very high embedding similarity)
   * update the existing row instead of piling up repeated facts.
   */
  public async create(
    input: MemoryInput
  ): Promise<{ memory: MemoryRecord; action: 'created' | 'updated' }> {
    const title = (input.title || '').trim() || (input.content || '').slice(0, 60).trim();
    const content = (input.content || '').trim();

    if (!title || !content) {
      throw new Error('A memory needs both a title and content.');
    }

    const kind: MemoryKind = MEMORY_KINDS.includes(input.kind) ? input.kind : 'fact';
    const importance = clampImportance(input.importance);
    const subject = normalizeSubject(input.subject);
    const memoryType = input.memoryType || 'long_term';
    const status = input.status || 'active';
    const confidence = input.confidence !== undefined ? input.confidence : 0.8;
    const projectId = input.projectId || null;
    const sourceConversationId = input.sourceConversationId || null;
    const expirationAt = input.expirationAt || null;
    const extraMeta = input.extraMetadata ? JSON.stringify(input.extraMetadata) : null;

    const duplicate = await this.findDuplicate(kind, subject, `${title} ${content}`);
    if (duplicate) {
      const memory = await this.update(duplicate.id, {
        title,
        content,
        subject,
        importance: Math.max(duplicate.importance, importance),
        memoryType,
        status,
        confidence,
        projectId: projectId || duplicate.projectId,
        expirationAt: expirationAt || duplicate.expirationAt,
        extraMetadata: input.extraMetadata,
      });
      if (memory) return { memory, action: 'updated' };
    }

    const embedding = await this.embeddings.embed(`${title}. ${content}`, 'document');
    const now = new Date().toISOString();
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.db.run(
      `INSERT INTO memories
        (id, kind, subject, title, content, importance, source, embedding, embedding_model, created_at, updated_at,
         memory_type, status, confidence, project_id, source_conversation_id, expiration_at, version, supersedes_id, extra_metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?);`,
      [
        id,
        kind,
        subject,
        title,
        content,
        importance,
        input.source || 'chat',
        encodeEmbedding(embedding.vector),
        embedding.model,
        now,
        now,
        memoryType,
        status,
        confidence,
        projectId,
        sourceConversationId,
        expirationAt,
        extraMeta,
      ]
    );

    this.db.flush();
    return { memory: this.get(id)!, action: 'created' };
  }

  public get(id: string): MemoryRecord | undefined {
    const row = this.db.get<MemoryRow>('SELECT * FROM memories WHERE id = ?;', [id]);
    return row ? toRecord(row) : undefined;
  }

  public async findBySubject(subject: string): Promise<MemoryRecord | undefined> {
    const clean = normalizeSubject(subject);
    if (!clean) return undefined;
    const row = this.db.get<MemoryRow>(
      'SELECT * FROM memories WHERE lower(subject) = ? AND status = ? LIMIT 1;',
      [clean, 'active']
    );
    return row ? toRecord(row) : undefined;
  }

  public listByProject(projectId: string, limit = 50): MemoryRecord[] {
    const rows = this.db.all<MemoryRow>(
      'SELECT * FROM memories WHERE project_id = ? AND status != ? ORDER BY updated_at DESC LIMIT ?;',
      [projectId, 'archived', limit]
    );
    return rows.map(toRecord);
  }

  public list(options: {
    kind?: MemoryKind;
    status?: string;
    memoryType?: string;
    limit?: number;
    offset?: number;
  } = {}): MemoryRecord[] {
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);

    const conditions: string[] = [];
    const params: SqlValue[] = [];

    if (options.kind) {
      conditions.push('kind = ?');
      params.push(options.kind);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.memoryType) {
      conditions.push('memory_type = ?');
      params.push(options.memoryType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const rows = this.db.all<MemoryRow>(
      `SELECT * FROM memories ${whereClause} ORDER BY updated_at DESC LIMIT ? OFFSET ?;`,
      params
    );

    return rows.map(toRecord);
  }

  public async update(id: string, patch: MemoryUpdate): Promise<MemoryRecord | undefined> {
    const existingRow = this.db.get<MemoryRow>('SELECT * FROM memories WHERE id = ?;', [id]);
    if (!existingRow) return undefined;

    const existing = toRecord(existingRow);
    const title = patch.title !== undefined ? patch.title.trim() : existing.title;
    const content = patch.content !== undefined ? patch.content.trim() : existing.content;
    const kind = patch.kind && MEMORY_KINDS.includes(patch.kind) ? patch.kind : existing.kind;
    const subject = patch.subject !== undefined ? normalizeSubject(patch.subject) : existing.subject;
    const importance =
      patch.importance !== undefined ? clampImportance(patch.importance) : existing.importance;
    const memoryType = patch.memoryType || existing.memoryType || 'long_term';
    const status = patch.status || existing.status || 'active';
    const confidence = patch.confidence !== undefined ? patch.confidence : existing.confidence ?? 0.8;
    const projectId = patch.projectId !== undefined ? patch.projectId : existing.projectId ?? null;
    const expirationAt = patch.expirationAt !== undefined ? patch.expirationAt : existing.expirationAt ?? null;
    const version = (existing.version || 1) + 1;
    const supersedesId = patch.supersedesId !== undefined ? patch.supersedesId : existing.supersedesId ?? null;
    const extraMeta = patch.extraMetadata
      ? JSON.stringify(patch.extraMetadata)
      : (existing.extraMetadata ? JSON.stringify(existing.extraMetadata) : null);

    const contentChanged =
      title !== existing.title || content !== existing.content || kind !== existing.kind;

    const params: SqlValue[] = [
      kind,
      subject,
      title,
      content,
      importance,
      new Date().toISOString(),
      memoryType,
      status,
      confidence,
      projectId,
      expirationAt,
      version,
      supersedesId,
      extraMeta,
    ];
    let setEmbedding = '';

    if (contentChanged) {
      const embedding = await this.embeddings.embed(`${title}. ${content}`, 'document');
      setEmbedding = ', embedding = ?, embedding_model = ?';
      params.push(encodeEmbedding(embedding.vector), embedding.model);
    }

    this.db.run(
      `UPDATE memories
         SET kind = ?, subject = ?, title = ?, content = ?, importance = ?, updated_at = ?,
             memory_type = ?, status = ?, confidence = ?, project_id = ?, expiration_at = ?,
             version = ?, supersedes_id = ?, extra_metadata = ?${setEmbedding}
       WHERE id = ?;`,
      [...params, id]
    );

    this.db.flush();
    return this.get(id);
  }

  public delete(id: string): boolean {
    const existing = this.db.get<{ id: string }>('SELECT id FROM memories WHERE id = ?;', [id]);
    if (!existing) return false;

    this.db.run('DELETE FROM memories WHERE id = ?;', [id]);
    this.db.flush();
    return true;
  }

  /** Semantic + keyword search over all stored memories. */
  public async search(query: string, limit = 8, includeInactive = false): Promise<MemoryHit[]> {
    const clean = (query || '').trim();
    if (!clean) return [];

    const [geminiQuery, localQuery] = await Promise.all([
      this.embeddings.embed(clean, 'query'),
      Promise.resolve(localEmbedding(clean)),
    ]);

    const statusFilter = includeInactive
      ? ''
      : "WHERE status IS NULL OR status IN ('active', 'temporary')";

    const rows = this.db.all<MemoryRow>(
      `SELECT * FROM memories ${statusFilter} ORDER BY updated_at DESC LIMIT ?;`,
      [MAX_CANDIDATES]
    );

    const now = Date.now();
    const hits: MemoryHit[] = rows.map((row) => {
      const stored = decodeEmbedding(row.embedding);
      const queryVector = stored.length === geminiQuery.vector.length ? geminiQuery.vector : localQuery;
      const semantic = stored.length === queryVector.length ? cosineSimilarity(stored, queryVector) : 0;

      const keyword = keywordOverlap(clean, `${row.title} ${row.content} ${row.subject}`);
      const ageDays = Math.max(0, (now - new Date(row.updated_at).getTime()) / 86_400_000);
      const recency = Math.exp(-ageDays / 120);
      const importanceBoost = (row.importance - 3) * 0.02;

      const score = 0.68 * Math.max(0, semantic) + 0.27 * keyword + 0.05 * recency + importanceBoost;

      return { ...toRecord(row), score: Number(score.toFixed(4)) };
    });

    const ranked = hits
      .filter((hit) => hit.score >= 0.12)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(Math.max(limit, 1), 25));

    if (ranked.length > 0) {
      this.markUsed(ranked.map((hit) => hit.id));
    }

    return ranked;
  }

  /**
   * Memories connected to `id` by embedding similarity. Used to pull in related
   * context (same project, same person) without loading the whole database.
   */
  public relatedTo(id: string, limit = 3): MemoryHit[] {
    const row = this.db.get<MemoryRow>('SELECT * FROM memories WHERE id = ?;', [id]);
    if (!row) return [];

    const base = decodeEmbedding(row.embedding);
    if (base.length === 0) return [];

    const rows = this.db.all<MemoryRow>(
      `SELECT * FROM memories WHERE id != ? AND embedding IS NOT NULL AND (status IS NULL OR status = 'active') LIMIT ?;`,
      [id, MAX_CANDIDATES]
    );

    const hits: MemoryHit[] = [];
    for (const candidate of rows) {
      const vector = decodeEmbedding(candidate.embedding);
      if (vector.length !== base.length) continue;

      const score = cosineSimilarity(base, vector);
      if (score >= 0.55) hits.push({ ...toRecord(candidate), score: Number(score.toFixed(4)) });
    }

    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  public markUsed(ids: string[]): void {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    for (const id of ids) {
      this.db.run('UPDATE memories SET last_used_at = ? WHERE id = ?;', [now, id]);
    }
  }

  public count(): number {
    return this.db.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM memories WHERE status IS NULL OR status = 'active';"
    )?.count ?? 0;
  }

  public stats(): MemoryStats {
    const rows = this.db.all<{ kind: string; count: number }>(
      "SELECT kind, COUNT(*) AS count FROM memories WHERE status IS NULL OR status = 'active' GROUP BY kind;"
    );

    const byKind: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byKind[row.kind] = row.count;
      total += row.count;
    }

    const embedded =
      this.db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM memories WHERE embedding IS NOT NULL;'
      )?.count ?? 0;

    return { total, byKind, embedded, databaseBytes: this.db.getFileSize() };
  }

  /** Highest-importance standing instructions/preferences, always shown to the model. */
  public core(limit = 5): MemoryRecord[] {
    const rows = this.db.all<MemoryRow>(
      `SELECT * FROM memories
        WHERE importance >= 4 AND kind IN ('preference', 'instruction', 'personal')
          AND (status IS NULL OR status = 'active')
        ORDER BY importance DESC, updated_at DESC
        LIMIT ?;`,
      [limit]
    );
    return rows.map(toRecord);
  }

  private async findDuplicate(
    kind: MemoryKind,
    subject: string,
    haystack: string
  ): Promise<MemoryRecord | undefined> {
    if (subject) {
      const row = this.db.get<MemoryRow>(
        'SELECT * FROM memories WHERE lower(subject) = ? AND (status IS NULL OR status = ?) LIMIT 1;',
        [subject, 'active']
      );
      if (row) return toRecord(row);
    }

    const candidates = this.db.all<MemoryRow>(
      "SELECT * FROM memories WHERE kind = ? AND embedding IS NOT NULL AND (status IS NULL OR status = 'active') LIMIT 500;",
      [kind]
    );
    if (candidates.length === 0) return undefined;

    const embedding = await this.embeddings.embed(haystack, 'document');

    let best: { row: MemoryRow; score: number } | null = null;
    for (const candidate of candidates) {
      const stored = decodeEmbedding(candidate.embedding);
      if (stored.length !== embedding.vector.length) continue;
      const score = cosineSimilarity(stored, embedding.vector);
      if (!best || score > best.score) best = { row: candidate, score };
    }

    return best && best.score >= DUPLICATE_SIMILARITY ? toRecord(best.row) : undefined;
  }
}
