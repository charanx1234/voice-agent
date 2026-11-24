import { SqliteDatabase } from './sqliteDatabase';

export const SCHEMA_VERSION = 2;

/**
 * Creates every table the memory system needs. Versioned through `PRAGMA user_version`
 * so future schema changes can migrate existing user databases instead of dropping them.
 *
 * Version 1: Original memories, conversation_sessions, conversation_messages, memory_events
 * Version 2: FIMA V1 — adds memory lifecycle columns, projects, memory_history,
 *             memory_links, memory_activity tables
 */
export function migrate(db: SqliteDatabase): void {
  const current =
    db.get<{ user_version: number }>('PRAGMA user_version;')?.user_version ?? 0;

  if (current >= SCHEMA_VERSION) return;

  // ── Version 1 → create core tables if they don't exist ─────────────────────
  if (current < 1) {
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
    });
  }

  // ── Version 2 → FIMA V1 extensions ─────────────────────────────────────────
  if (current < 2) {
    db.transaction(() => {
      // Extend memories with lifecycle + project columns
      // ALTER TABLE ADD COLUMN is safe on existing rows — they get the DEFAULT value
      const addColumnSafe = (col: string) => {
        try { db.exec(`ALTER TABLE memories ADD COLUMN ${col};`); } catch { /* already exists */ }
      };

      addColumnSafe("memory_type TEXT NOT NULL DEFAULT 'long_term'");
      // Values: working | long_term | project | episodic | semantic

      addColumnSafe("status TEXT NOT NULL DEFAULT 'active'");
      // Values: active | temporary | outdated | superseded | archived | pending_review

      addColumnSafe('confidence REAL NOT NULL DEFAULT 0.8');
      // 0.0 to 1.0

      addColumnSafe('project_id TEXT');
      addColumnSafe('source_conversation_id TEXT');
      addColumnSafe('expiration_at TEXT');   // ISO date, for temporary memories
      addColumnSafe('version INTEGER NOT NULL DEFAULT 1');
      addColumnSafe('supersedes_id TEXT');   // memory this one supersedes
      addColumnSafe('extra_metadata TEXT');  // JSON blob for flexible fields

      // New indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
        CREATE INDEX IF NOT EXISTS idx_memories_memory_type ON memories(memory_type);
        CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id) WHERE project_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_memories_expiration ON memories(expiration_at) WHERE expiration_at IS NOT NULL;
      `);

      // Projects table
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          objective TEXT,
          tech_stack TEXT,            -- JSON array string
          status TEXT NOT NULL DEFAULT 'in_progress',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status, archived);
        CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
      `);

      // Memory history / versioning
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_history (
          id TEXT PRIMARY KEY,
          memory_id TEXT NOT NULL,
          action TEXT NOT NULL,       -- created | updated | status_changed | superseded | merged
          old_content TEXT,
          new_content TEXT,
          reason TEXT,
          source TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_memory_history_memory_id ON memory_history(memory_id);
        CREATE INDEX IF NOT EXISTS idx_memory_history_created ON memory_history(created_at DESC);
      `);

      // Memory relationship links
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_links (
          id TEXT PRIMARY KEY,
          from_memory_id TEXT NOT NULL,
          to_memory_id TEXT NOT NULL,
          link_type TEXT NOT NULL,    -- related | supersedes | contradicts | supports
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_memory_links_from ON memory_links(from_memory_id);
        CREATE INDEX IF NOT EXISTS idx_memory_links_to ON memory_links(to_memory_id);
      `);

      // Memory activity log (replaces empty memory_events)
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_activity (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          -- saved | updated | merged | archived | retrieved | ignored | conflict_detected | promoted | expired
          memory_id TEXT,
          project_id TEXT,
          reason TEXT,
          details TEXT,               -- JSON blob
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_memory_activity_created ON memory_activity(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_memory_activity_action ON memory_activity(action);
        CREATE INDEX IF NOT EXISTS idx_memory_activity_memory_id ON memory_activity(memory_id) WHERE memory_id IS NOT NULL;
      `);

      db.exec(`PRAGMA user_version = 2;`);
    });
  }

  db.flush();
}
