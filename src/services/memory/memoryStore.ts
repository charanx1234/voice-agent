import { MemoryKind } from '../../shared/types';
import { SqliteDatabase, SqlValue } from './sqliteDatabase';
import {
  EmbeddingService,
  cosineSimilarity,
  decodeEmbedding,
  encodeEmbedding,
  keywordOverlap,
  localEmbedding,
} from './embeddings';

export type { MemoryKind };

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
}

export interface MemoryInput {
  kind: MemoryKind;
  title: string;
  content: string;
  subject?: string;
  importance?: number;
  source?: MemorySource;
}

export interface MemoryUpdate {
  kind?: MemoryKind;
  title?: string;
  content?: string;
  subject?: string;
  importance?: number;
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
  return {
    id: row.id,
    kind: row.kind as MemoryKind,
    subject: row.subject || '',
    title: row.title,
    content: row.content,
    importance: row.importance,
    source: (row.source as MemorySource) || 'chat',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at || undefined,
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

    const duplicate = await this.findDuplicate(kind, subject, `${title} ${content}`);
    if (duplicate) {
      const memory = await this.update(duplicate.id, {
        title,
        content,
        subject,
        importance: Math.max(duplicate.importance, importance),
      });
      if (memory) return { memory, action: 'updated' };
    }

    const embedding = await this.embeddings.embed(`${title}. ${content}`, 'document');
    const now = new Date().toISOString();
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.db.run(
      `INSERT INTO memories
        (id, kind, subject, title, content, importance, source, embedding, embedding_model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
      ]
    );

    this.db.flush();
    return { memory: this.get(id)!, action: 'created' };
  }

  public get(id: string): MemoryRecord | undefined {
    const row = this.db.get<MemoryRow>('SELECT * FROM memories WHERE id = ?;', [id]);
    return row ? toRecord(row) : undefined;
  }

  public list(options: { kind?: MemoryKind; limit?: number; offset?: number } = {}): MemoryRecord[] {
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);

    const rows = options.kind
      ? this.db.all<MemoryRow>(
          `SELECT * FROM memories WHERE kind = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?;`,
          [options.kind, limit, offset]
        )
      : this.db.all<MemoryRow>(
          `SELECT * FROM memories ORDER BY updated_at DESC LIMIT ? OFFSET ?;`,
          [limit, offset]
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

    const contentChanged =
      title !== existing.title || content !== existing.content || kind !== existing.kind;

    const params: SqlValue[] = [kind, subject, title, content, importance, new Date().toISOString()];
    let setEmbedding = '';

    if (contentChanged) {
      const embedding = await this.embeddings.embed(`${title}. ${content}`, 'document');
      setEmbedding = ', embedding = ?, embedding_model = ?';
      params.push(encodeEmbedding(embedding.vector), embedding.model);
    }

    this.db.run(
      `UPDATE memories
         SET kind = ?, subject = ?, title = ?, content = ?, importance = ?, updated_at = ?${setEmbedding}
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
  public async search(query: string, limit = 8): Promise<MemoryHit[]> {
    const clean = (query || '').trim();
    if (!clean) return [];

    const [geminiQuery, localQuery] = await Promise.all([
      this.embeddings.embed(clean, 'query'),
      Promise.resolve(localEmbedding(clean)),
    ]);

    const rows = this.db.all<MemoryRow>(
      'SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?;',
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
      'SELECT * FROM memories WHERE id != ? AND embedding IS NOT NULL LIMIT ?;',
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
    return this.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM memories;')?.count ?? 0;
  }

  public stats(): MemoryStats {
    const rows = this.db.all<{ kind: string; count: number }>(
      'SELECT kind, COUNT(*) AS count FROM memories GROUP BY kind;'
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
        'SELECT * FROM memories WHERE lower(subject) = ? LIMIT 1;',
        [subject]
      );
      if (row) return toRecord(row);
    }

    const candidates = this.db.all<MemoryRow>(
      'SELECT * FROM memories WHERE kind = ? AND embedding IS NOT NULL LIMIT 500;',
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
