import { ChatMessage } from '../../shared/types';
import { SqliteDatabase } from './sqliteDatabase';

export const MAX_STORED_MESSAGES = 200;
export const MAX_MESSAGE_AGE_DAYS = 30;

const PRIMARY_SESSION = 'primary';

interface MessageRow {
  id: string;
  role: string;
  text: string;
  language: string | null;
  is_voice: number;
  is_error: number;
  created_at: string;
}

export interface AppendMessageInput {
  role: 'user' | 'assistant' | 'system';
  text: string;
  language?: string;
  isVoice?: boolean;
  isError?: boolean;
}

/**
 * Persists the rolling conversation so context survives application restarts.
 * This is deliberately separate from long-term memory: the transcript is capped and
 * pruned, while curated memories live forever until the user edits or deletes them.
 */
export class ConversationStore {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  public append(input: AppendMessageInput): ChatMessage {
    const text = (input.text || '').trim();
    const now = new Date().toISOString();
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.ensureSession(now);

    this.db.run(
      `INSERT INTO conversation_messages (id, session_id, role, text, language, is_voice, is_error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        PRIMARY_SESSION,
        input.role,
        text,
        input.language || null,
        input.isVoice ? 1 : 0,
        input.isError ? 1 : 0,
        now,
      ]
    );

    this.touchSession(now);
    this.prune();

    return {
      id,
      role: input.role,
      text,
      timestamp: new Date(now).getTime(),
      language: input.language,
      isVoice: input.isVoice,
      isError: input.isError,
    };
  }

  /** Most recent messages, returned oldest-first so they read as a conversation. */
  public loadRecent(limit = 50): ChatMessage[] {
    const safeLimit = Math.min(Math.max(limit, 1), MAX_STORED_MESSAGES);
    const rows = this.db.all<MessageRow>(
      `SELECT * FROM conversation_messages
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ?;`,
      [PRIMARY_SESSION, safeLimit]
    );

    return rows
      .reverse()
      .map((row) => ({
        id: row.id,
        role: row.role as ChatMessage['role'],
        text: row.text,
        timestamp: new Date(row.created_at).getTime(),
        language: row.language || undefined,
        isVoice: Boolean(row.is_voice),
        isError: Boolean(row.is_error),
      }));
  }

  /** Removes messages beyond the retention window or the message cap. */
  public prune(): number {
    const cutoff = new Date(
      Date.now() - MAX_MESSAGE_AGE_DAYS * 86_400_000
    ).toISOString();

    const oldCount =
      this.db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM conversation_messages WHERE created_at < ?;',
        [cutoff]
      )?.count ?? 0;

    if (oldCount > 0) {
      this.db.run('DELETE FROM conversation_messages WHERE created_at < ?;', [cutoff]);
    }

    const total =
      this.db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM conversation_messages;'
      )?.count ?? 0;

    let excess = 0;
    if (total > MAX_STORED_MESSAGES) {
      excess = total - MAX_STORED_MESSAGES;
      this.db.run(
        `DELETE FROM conversation_messages
          WHERE id IN (
            SELECT id FROM conversation_messages ORDER BY created_at ASC LIMIT ?
          );`,
        [excess]
      );
    }

    return oldCount + excess;
  }

  public clear(): void {
    this.db.run('DELETE FROM conversation_messages;');
    this.db.run('DELETE FROM conversation_sessions;');
    this.db.flush();
  }

  public count(): number {
    return (
      this.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM conversation_messages;')
        ?.count ?? 0
    );
  }

  private ensureSession(now: string): void {
    const existing = this.db.get<{ id: string }>(
      'SELECT id FROM conversation_sessions WHERE id = ?;',
      [PRIMARY_SESSION]
    );
    if (existing) return;

    this.db.run(
      'INSERT INTO conversation_sessions (id, title, started_at, updated_at) VALUES (?, ?, ?, ?);',
      [PRIMARY_SESSION, 'FRIDAY conversation', now, now]
    );
  }

  private touchSession(now: string): void {
    this.db.run('UPDATE conversation_sessions SET updated_at = ? WHERE id = ?;', [
      now,
      PRIMARY_SESSION,
    ]);
  }
}
