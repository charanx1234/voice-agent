import { SqliteDatabase } from '../memory/sqliteDatabase';

export type ReminderStatus = 'pending' | 'done' | 'cancelled';

export interface ReminderRecord {
  id: string;
  text: string;
  dueAt: string;
  status: ReminderStatus;
  createdAt: string;
  notifiedAt?: string;
}

interface ReminderRow {
  id: string;
  text: string;
  due_at: string;
  status: string;
  created_at: string;
  notified_at: string | null;
}

function toRecord(row: ReminderRow): ReminderRecord {
  return {
    id: row.id,
    text: row.text,
    dueAt: row.due_at,
    status: row.status as ReminderStatus,
    createdAt: row.created_at,
    notifiedAt: row.notified_at || undefined,
  };
}

export class ReminderStore {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  public migrate(): void {
    const current =
      this.db.get<{ user_version: number }>('PRAGMA user_version;')?.user_version ?? 0;
    if (current >= 1) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        due_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        notified_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, due_at);
      PRAGMA user_version = 1;
    `);
    this.db.flush();
  }

  public create(text: string, dueAt: Date): ReminderRecord {
    const now = new Date().toISOString();
    const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    this.db.run(
      `INSERT INTO reminders (id, text, due_at, status, created_at)
       VALUES (?, ?, ?, 'pending', ?);`,
      [id, text, dueAt.toISOString(), now]
    );
    this.db.flush();

    return { id, text, dueAt: dueAt.toISOString(), status: 'pending', createdAt: now };
  }

  public list(options: { includeDone?: boolean } = {}): ReminderRecord[] {
    const rows = options.includeDone
      ? this.db.all<ReminderRow>('SELECT * FROM reminders ORDER BY due_at ASC;')
      : this.db.all<ReminderRow>(
          "SELECT * FROM reminders WHERE status = 'pending' ORDER BY due_at ASC;"
        );
    return rows.map(toRecord);
  }

  public get(id: string): ReminderRecord | undefined {
    const row = this.db.get<ReminderRow>('SELECT * FROM reminders WHERE id = ?;', [id]);
    return row ? toRecord(row) : undefined;
  }

  public complete(id: string): ReminderRecord | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;

    this.db.run("UPDATE reminders SET status = 'done' WHERE id = ?;", [id]);
    this.db.flush();
    return this.get(id);
  }

  public remove(id: string): boolean {
    const existing = this.get(id);
    if (!existing) return false;

    this.db.run('DELETE FROM reminders WHERE id = ?;', [id]);
    this.db.flush();
    return true;
  }

  public pendingDue(at: Date = new Date()): ReminderRecord[] {
    return this.db
      .all<ReminderRow>(
        "SELECT * FROM reminders WHERE status = 'pending' AND due_at <= ? ORDER BY due_at ASC;",
        [at.toISOString()]
      )
      .map(toRecord);
  }

  public markFired(id: string): ReminderRecord | undefined {
    this.db.run(
      "UPDATE reminders SET status = 'done', notified_at = ? WHERE id = ?;",
      [new Date().toISOString(), id]
    );
    this.db.flush();
    return this.get(id);
  }

  /** Finds a pending reminder by id or by a fuzzy text match. */
  public findPending(idOrText: string): ReminderRecord | undefined {
    const query = (idOrText || '').trim();
    if (!query) return undefined;

    const byId = this.get(query);
    if (byId) return byId;

    const lower = query.toLowerCase();
    return (
      this.list().find((reminder) => reminder.text.toLowerCase().includes(lower)) ||
      this.list().find((reminder) => lower.includes(reminder.text.toLowerCase()))
    );
  }
}
