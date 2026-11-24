"""
FRIDAY Intelligent Memory Architecture (FIMA V1)
Database Migration Script: Schema Version 1 -> Version 2

Safely migrates existing memory databases to FIMA V1:
- Backs up database before any change
- Adds new FIMA columns (additive, preserves existing data)
- Creates projects, memory_history, memory_links, memory_activity tables
- Categorizes existing memories into memory_type, status, confidence
- Links project memories to structured project records
- Identifies and handles junk fragments
- Sets PRAGMA user_version = 2
- Generates detailed verification report
"""

import os
import shutil
import sqlite3
import time
from datetime import datetime

def migrate_database(db_path: str):
    if not os.path.exists(db_path):
        print(f"[-] Database not found at {db_path}")
        return False

    print(f"\n=======================================================")
    print(f"[*] Starting FIMA V1 Migration for: {db_path}")
    print(f"=======================================================")

    # 1. Create timestamped backup
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{db_path}.bak_fima_v1_{timestamp}"
    shutil.copy2(db_path, backup_path)
    print(f"[+] Backup created: {backup_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # 2. Check current version
    cur.execute("PRAGMA user_version;")
    current_version = cur.fetchone()[0]
    print(f"[*] Current schema version: {current_version}")

    # 3. Additive schema extension (Version 2)
    new_columns = [
        ("memory_type", "TEXT NOT NULL DEFAULT 'long_term'"),
        ("status", "TEXT NOT NULL DEFAULT 'active'"),
        ("confidence", "REAL NOT NULL DEFAULT 0.8"),
        ("project_id", "TEXT"),
        ("source_conversation_id", "TEXT"),
        ("expiration_at", "TEXT"),
        ("version", "INTEGER NOT NULL DEFAULT 1"),
        ("supersedes_id", "TEXT"),
        ("extra_metadata", "TEXT"),
    ]

    for col_name, col_def in new_columns:
        try:
            cur.execute(f"ALTER TABLE memories ADD COLUMN {col_name} {col_def};")
            print(f"[+] Added column: memories.{col_name}")
        except sqlite3.OperationalError:
            # Column already exists
            pass

    # New indexes
    cur.execute("CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_memories_memory_type ON memories(memory_type);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_memories_expiration ON memories(expiration_at);")

    # New tables
    cur.execute("""
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          objective TEXT,
          tech_stack TEXT,
          status TEXT NOT NULL DEFAULT 'in_progress',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived INTEGER NOT NULL DEFAULT 0
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status, archived);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS memory_history (
          id TEXT PRIMARY KEY,
          memory_id TEXT NOT NULL,
          action TEXT NOT NULL,
          old_content TEXT,
          new_content TEXT,
          reason TEXT,
          source TEXT,
          created_at TEXT NOT NULL
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_history_memory_id ON memory_history(memory_id);")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS memory_links (
          id TEXT PRIMARY KEY,
          from_memory_id TEXT NOT NULL,
          to_memory_id TEXT NOT NULL,
          link_type TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS memory_activity (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          memory_id TEXT,
          project_id TEXT,
          reason TEXT,
          details TEXT,
          created_at TEXT NOT NULL
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_activity_created ON memory_activity(created_at DESC);")

    conn.commit()
    print("[+] Core FIMA V1 tables and indexes ready.")

    # 4. Migrate and classify existing records
    now_iso = datetime.utcnow().isoformat() + "Z"

    # Ensure projects exist
    cur.execute("SELECT id FROM projects WHERE id = 'proj_friday';")
    if not cur.fetchone():
        cur.execute("""
            INSERT INTO projects (id, name, description, objective, tech_stack, status, created_at, updated_at, archived)
            VALUES ('proj_friday', 'FRIDAY AI Desktop Companion', 'Intelligent Windows desktop AI companion with voice, memory, and desktop control', 'Provide an intelligent, context-aware companion', '["Electron", "React", "TypeScript", "Python", "SQLite"]', 'in_progress', ?, ?, 0);
        """, (now_iso, now_iso))
        print("[+] Created default project: FRIDAY AI Desktop Companion")

    cur.execute("SELECT id FROM projects WHERE id = 'proj_poop_counter_app';")
    if not cur.fetchone():
        cur.execute("""
            INSERT INTO projects (id, name, description, objective, tech_stack, status, created_at, updated_at, archived)
            VALUES ('proj_poop_counter_app', 'Poop Counter App', 'Mobile/Desktop application to track daily human bowel movement frequency', 'Health tracking application', '["React Native", "TypeScript"]', 'in_progress', ?, ?, 0);
        """, (now_iso, now_iso))
        print("[+] Created project: Poop Counter App")

    # Inspect all memories
    cur.execute("SELECT * FROM memories;")
    records = cur.fetchall()
    print(f"[*] Found {len(records)} existing memory records to categorize.")

    updated_count = 0
    junk_flagged = 0

    for r in records:
        mid = r["id"]
        kind = r["kind"]
        title = r["title"] or ""
        content = r["content"] or ""

        # Default classification
        mem_type = "long_term"
        status = "active"
        confidence = 0.8
        proj_id = None

        if kind == "instruction":
            confidence = 1.0
            mem_type = "long_term"
        elif kind == "personal":
            confidence = 0.95
            mem_type = "long_term"
        elif kind == "project":
            mem_type = "project"
            confidence = 0.85
            if "poop" in content.lower() or "poop" in title.lower():
                proj_id = "proj_poop_counter_app"
            else:
                proj_id = "proj_friday"

        if "friday" in content.lower() or "creator of friday" in content.lower():
            proj_id = "proj_friday"
            confidence = 0.95

        # Check for junk / fragments (Problem P7 in audit)
        if title.strip().lower() in ("till now", "so far", "as of now") or len(content.strip().split()) < 3:
            status = "outdated"
            junk_flagged += 1
            print(f"  [!] Flagged low-quality memory as outdated: '{title}' ({mid})")

        cur.execute("""
            UPDATE memories
            SET memory_type = ?, status = ?, confidence = ?, project_id = ?
            WHERE id = ?;
        """, (mem_type, status, confidence, proj_id, mid))
        updated_count += 1

    # Log initial migration in activity log
    cur.execute("""
        INSERT INTO memory_activity (id, action, reason, created_at)
        VALUES ('act_migration_v1', 'saved', 'Migrated database to FIMA V1 schema with project links and lifecycle states', ?);
    """, (now_iso,))

    # Update PRAGMA user_version
    cur.execute("PRAGMA user_version = 2;")
    conn.commit()

    print(f"[+] Successfully migrated {updated_count} memories.")
    print(f"[+] Flagged {junk_flagged} junk memories as outdated.")
    print(f"[+] Schema user_version is now 2.")

    # Verification summary
    cur.execute("SELECT COUNT(*) FROM memories WHERE status = 'active';")
    active_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM memories WHERE status != 'active';")
    inactive_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM projects;")
    project_count = cur.fetchone()[0]

    print(f"\n--- Post-Migration Verification Summary ---")
    print(f"Total Active Memories:   {active_count}")
    print(f"Total Inactive Memories: {inactive_count}")
    print(f"Total Projects:          {project_count}")
    print(f"Database Integrity Check:")
    cur.execute("PRAGMA integrity_check;")
    print(f"Result: {cur.fetchone()[0]}")

    conn.close()
    return True

if __name__ == "__main__":
    # Migrate repo backup DB
    repo_db = r"c:\25r11a6760\FRIDAY\userDataBackup\friday_memory.db"
    migrate_database(repo_db)

    # Migrate workspace .data DB
    dotdata_db = r"c:\25r11a6760\FRIDAY\.data\friday_memory.db"
    migrate_database(dotdata_db)
