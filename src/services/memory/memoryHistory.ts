/**
 * FIMA V1 — Memory History Tracker
 *
 * Records versioned history of memory changes in the memory_history table.
 * Every create, update, status change, merge, or supersede action is logged
 * so users can trace the provenance and evolution of any memory.
 */

import { MemoryHistoryItem } from '../../shared/types';
import { SqliteDatabase } from './sqliteDatabase';

interface HistoryRow {
  id: string;
  memory_id: string;
  action: string;
  old_content: string | null;
  new_content: string | null;
  reason: string | null;
  source: string | null;
  created_at: string;
}

function toItem(row: HistoryRow): MemoryHistoryItem {
  return {
    id: row.id,
    memoryId: row.memory_id,
    action: row.action,
    oldContent: row.old_content || undefined,
    newContent: row.new_content || undefined,
    reason: row.reason || undefined,
    source: row.source || undefined,
    createdAt: row.created_at,
  };
}

export class MemoryHistoryTracker {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  public record(
    memoryId: string,
    action: 'created' | 'updated' | 'status_changed' | 'superseded' | 'merged' | 'archived' | 'deleted',
    options: {
      oldContent?: string;
      newContent?: string;
      reason?: string;
      source?: string;
    } = {}
  ): void {
    try {
      const id = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();

      this.db.run(
        `INSERT INTO memory_history (id, memory_id, action, old_content, new_content, reason, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          memoryId,
          action,
          options.oldContent || null,
          options.newContent || null,
          options.reason || null,
          options.source || null,
          now,
        ]
      );
    } catch {
      // History tracking must never break the memory pipeline
    }
  }

  public forMemory(memoryId: string): MemoryHistoryItem[] {
    try {
      const rows = this.db.all<HistoryRow>(
        `SELECT * FROM memory_history WHERE memory_id = ? ORDER BY created_at DESC LIMIT 50;`,
        [memoryId]
      );
      return rows.map(toItem);
    } catch {
      return [];
    }
  }
}
