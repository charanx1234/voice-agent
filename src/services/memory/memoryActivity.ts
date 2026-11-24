/**
 * FIMA V1 — Memory Activity Log
 *
 * Populates the memory_activity table with structured, human-readable records
 * of every memory operation. Used by the Memory Center dashboard activity feed.
 */

import { MemoryActivityAction, MemoryActivityItem } from '../../shared/types';
import { SqliteDatabase } from './sqliteDatabase';

interface ActivityRow {
  id: string;
  action: string;
  memory_id: string | null;
  project_id: string | null;
  reason: string | null;
  details: string | null;
  created_at: string;
}

function toItem(row: ActivityRow): MemoryActivityItem {
  return {
    id: row.id,
    action: row.action as MemoryActivityAction,
    memoryId: row.memory_id || undefined,
    projectId: row.project_id || undefined,
    reason: row.reason || undefined,
    details: row.details ? JSON.parse(row.details) : undefined,
    createdAt: row.created_at,
  };
}

export class MemoryActivityLog {
  private readonly db: SqliteDatabase;
  private static readonly MAX_ACTIVITY_ROWS = 500;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  public log(
    action: MemoryActivityAction,
    options: {
      memoryId?: string;
      projectId?: string;
      reason?: string;
      details?: Record<string, any>;
    } = {}
  ): void {
    try {
      const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();

      this.db.run(
        `INSERT INTO memory_activity (id, action, memory_id, project_id, reason, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          action,
          options.memoryId || null,
          options.projectId || null,
          options.reason || null,
          options.details ? JSON.stringify(options.details) : null,
          now,
        ]
      );

      // Keep the activity log bounded
      this.trim();
    } catch {
      // Activity log failures must never break the main memory pipeline
    }
  }

  public recent(limit = 50): MemoryActivityItem[] {
    try {
      const rows = this.db.all<ActivityRow>(
        `SELECT * FROM memory_activity ORDER BY created_at DESC, rowid DESC LIMIT ?;`,
        [Math.min(Math.max(limit, 1), 200)]
      );
      return rows.map(toItem);
    } catch {
      return [];
    }
  }

  public countLast24h(): number {
    try {
      const cutoff = new Date(Date.now() - 86_400_000).toISOString();
      return (
        this.db.get<{ count: number }>(
          `SELECT COUNT(*) AS count FROM memory_activity WHERE created_at > ?;`,
          [cutoff]
        )?.count ?? 0
      );
    } catch {
      return 0;
    }
  }

  private trim(): void {
    try {
      const count =
        this.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM memory_activity;')?.count ?? 0;
      if (count > MemoryActivityLog.MAX_ACTIVITY_ROWS) {
        const excess = count - MemoryActivityLog.MAX_ACTIVITY_ROWS;
        this.db.run(
          `DELETE FROM memory_activity WHERE id IN (
            SELECT id FROM memory_activity ORDER BY created_at ASC LIMIT ?
          );`,
          [excess]
        );
      }
    } catch {
      // non-critical
    }
  }
}
