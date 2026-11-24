/**
 * FIMA V1 — Memory Lifecycle Manager
 *
 * Maintains memory quality by:
 *   A. Expiring temporary memories past their expiration_at date
 *   B. Detecting and merging semantic duplicates across kinds
 *   C. Marking outdated/superseded memories
 *   D. Archiving memories that are no longer relevant
 *   E. Versioning updates (via MemoryHistoryTracker)
 *
 * Runs as a background job — never on the hot path of a conversation.
 */

import { SqliteDatabase } from './sqliteDatabase';
import { MemoryHistoryTracker } from './memoryHistory';
import { MemoryActivityLog } from './memoryActivity';
import { cosineSimilarity, decodeEmbedding } from './embeddings';

interface MemRow {
  id: string;
  kind: string;
  subject: string;
  title: string;
  content: string;
  status: string;
  memory_type: string;
  importance: number;
  confidence: number;
  embedding: Uint8Array | null;
  expiration_at: string | null;
  updated_at: string;
  supersedes_id: string | null;
}

const NEAR_DUPLICATE_THRESHOLD = 0.90;  // slightly lower than memoryStore's 0.93 for proactive merging

export class MemoryLifecycleManager {
  private readonly db: SqliteDatabase;
  private readonly history: MemoryHistoryTracker;
  private readonly activity: MemoryActivityLog;

  private maintenanceRunning = false;

  constructor(
    db: SqliteDatabase,
    history: MemoryHistoryTracker,
    activity: MemoryActivityLog
  ) {
    this.db = db;
    this.history = history;
    this.activity = activity;
  }

  /**
   * Run the full maintenance cycle. This is called in the background
   * and never blocks a conversation.
   */
  public async runMaintenance(): Promise<{ expired: number; merged: number; errors: number }> {
    if (this.maintenanceRunning) {
      return { expired: 0, merged: 0, errors: 0 };
    }

    this.maintenanceRunning = true;
    let expired = 0;
    let merged = 0;
    let errors = 0;

    try {
      expired = this.expireTemporaryMemories();
      merged = await this.mergeNearDuplicates();
    } catch (err: any) {
      errors++;
      console.warn('[MemoryLifecycle] Maintenance error:', err?.message);
    } finally {
      this.maintenanceRunning = false;
    }

    return { expired, merged, errors };
  }

  /**
   * Expire temporary memories that have passed their expiration_at date.
   * Updates status to 'outdated' rather than deleting, preserving history.
   */
  public expireTemporaryMemories(): number {
    const now = new Date().toISOString();

    const expired = this.db.all<MemRow>(
      `SELECT id, title, content FROM memories
        WHERE status = 'temporary' AND expiration_at IS NOT NULL AND expiration_at < ?;`,
      [now]
    );

    for (const row of expired) {
      this.db.run(
        `UPDATE memories SET status = 'outdated', updated_at = ? WHERE id = ?;`,
        [now, row.id]
      );
      this.history.record(row.id, 'status_changed', {
        oldContent: `status=temporary`,
        newContent: `status=outdated`,
        reason: 'Temporary memory expired past its expiration_at date',
        source: 'lifecycle_manager',
      });
      this.activity.log('expired', {
        memoryId: row.id,
        reason: `Temporary memory "${row.title}" expired`,
      });
    }

    if (expired.length > 0) {
      this.db.flush();
    }

    return expired.length;
  }

  /**
   * Finds near-duplicate memories (embedding similarity ≥ 0.90) and merges
   * the lower-importance one into the higher-importance one.
   *
   * Only runs on ACTIVE memories. Preserves history.
   */
  public async mergeNearDuplicates(): Promise<number> {
    const candidates = this.db.all<MemRow>(
      `SELECT id, kind, subject, title, content, status, importance, confidence, embedding, updated_at
         FROM memories
        WHERE status = 'active' AND embedding IS NOT NULL
        ORDER BY importance DESC, updated_at DESC
        LIMIT 300;`
    );

    if (candidates.length < 2) return 0;

    const merged = new Set<string>();
    let count = 0;
    const now = new Date().toISOString();

    for (let i = 0; i < candidates.length; i++) {
      if (merged.has(candidates[i].id)) continue;
      const base = candidates[i];
      const baseVector = decodeEmbedding(base.embedding);
      if (baseVector.length === 0) continue;

      for (let j = i + 1; j < candidates.length; j++) {
        if (merged.has(candidates[j].id)) continue;
        const candidate = candidates[j];

        // Don't merge if subjects are very different (guard against false merges)
        if (base.subject && candidate.subject && base.subject !== candidate.subject) continue;

        const candidateVector = decodeEmbedding(candidate.embedding);
        if (candidateVector.length !== baseVector.length) continue;

        const similarity = cosineSimilarity(baseVector, candidateVector);
        if (similarity < NEAR_DUPLICATE_THRESHOLD) continue;

        // Merge candidate into base (base has higher importance / is newer)
        const keepId = base.importance >= candidate.importance ? base.id : candidate.id;
        const removeId = keepId === base.id ? candidate.id : base.id;

        // Mark the removed one as superseded
        this.db.run(
          `UPDATE memories SET status = 'superseded', supersedes_id = ?, updated_at = ? WHERE id = ?;`,
          [keepId, now, removeId]
        );

        this.history.record(removeId, 'superseded', {
          oldContent: removeId === candidate.id ? candidate.content : base.content,
          newContent: `Merged into memory ${keepId}`,
          reason: `Near-duplicate detected (similarity ${similarity.toFixed(3)})`,
          source: 'lifecycle_manager',
        });

        this.activity.log('merged', {
          memoryId: removeId,
          reason: `Near-duplicate of "${keepId}" (similarity ${similarity.toFixed(3)}) — merged`,
        });

        merged.add(removeId);
        count++;
        break; // Only merge one duplicate per base at a time
      }
    }

    if (count > 0) {
      this.db.flush();
    }

    return count;
  }

  /**
   * Marks a memory as superseded by a newer one.
   * Preserves the old memory in history.
   */
  public supersede(oldId: string, newId: string, reason: string): void {
    const now = new Date().toISOString();
    const old = this.db.get<MemRow>('SELECT * FROM memories WHERE id = ?;', [oldId]);
    if (!old) return;

    this.db.run(
      `UPDATE memories SET status = 'superseded', supersedes_id = ?, updated_at = ? WHERE id = ?;`,
      [newId, now, oldId]
    );

    this.history.record(oldId, 'superseded', {
      oldContent: old.content,
      newContent: `Superseded by ${newId}`,
      reason,
      source: 'memory_service',
    });

    this.activity.log('superseded', {
      memoryId: oldId,
      reason,
      details: { supersededBy: newId },
    });

    this.db.flush();
  }

  /**
   * Archives a memory (keeps it, removes from active retrieval).
   */
  public archive(id: string, reason: string): void {
    const now = new Date().toISOString();
    const mem = this.db.get<MemRow>('SELECT * FROM memories WHERE id = ?;', [id]);
    if (!mem) return;

    this.db.run(
      `UPDATE memories SET status = 'archived', updated_at = ? WHERE id = ?;`,
      [now, id]
    );

    this.history.record(id, 'archived', {
      oldContent: mem.content,
      reason,
      source: 'user_or_system',
    });

    this.activity.log('archived', {
      memoryId: id,
      reason,
    });

    this.db.flush();
  }

  /** Count memories by status. */
  public statusCounts(): Record<string, number> {
    const rows = this.db.all<{ status: string; count: number }>(
      `SELECT status, COUNT(*) AS count FROM memories GROUP BY status;`
    );
    const result: Record<string, number> = {};
    for (const row of rows) result[row.status] = row.count;
    return result;
  }
}
