import { SqliteDatabase } from './sqliteDatabase';

export const SCHEMA_VERSION = 1;

/**
 * Creates every table the memory system needs. Versioned through `PRAGMA user_version`
 * so future schema changes can migrate existing user databases instead of dropping them.
 */
export function migrate(db: SqliteDatabase): void {
  const current =
    db.get<{ user_version: number }>('PRAGMA user_version;')?.user_version ?? 0;

  if (current >= SCHEMA_VERSION) return;

  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        importance INTEGER NOT NULL DEFAULT 3,
        source TEXT NOT NULL DEFAULT 'chat',
        embedding BLOB,
        embedding_model TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);
      CREATE INDEX IF NOT EXISTS idx_memories_updated_at ON memories(updated_at DESC);

      CREATE TABLE IF NOT EXISTS conversation_sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        language TEXT,
        is_voice INTEGER NOT NULL DEFAULT 0,
        is_error INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES conversation_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session_created
        ON conversation_messages(session_id, created_at);

      CREATE TABLE IF NOT EXISTS memory_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL
      );
    `);

    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });

  db.flush();
}
