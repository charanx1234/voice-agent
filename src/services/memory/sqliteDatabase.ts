import fs from 'fs';
import path from 'path';

// sql.js ships no type declarations and is loaded dynamically so the app can read
// the WebAssembly binary from inside app.asar without a native module rebuild.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const initSqlJs: any = require('sql.js');

export type SqlValue = string | number | null | Uint8Array;

export interface SqliteDatabaseOptions {
  logger?: (message: string) => void;
  persistDebounceMs?: number;
}

/**
 * Thin synchronous SQLite wrapper over sql.js.
 *
 * sql.js keeps the database in memory, so this class owns durability: every write
 * marks the database dirty, a debounced timer exports it, and the export is written
 * atomically (temp file + rename) so a crash mid-write cannot corrupt the database.
 */
export class SqliteDatabase {
  private readonly db: any;
  private readonly filePath: string;
  private readonly log: (message: string) => void;
  private readonly persistDebounceMs: number;

  private dirty = false;
  private persistTimer: NodeJS.Timeout | null = null;
  private closed = false;

  private constructor(
    db: any,
    filePath: string,
    log: (message: string) => void,
    persistDebounceMs: number
  ) {
    this.db = db;
    this.filePath = filePath;
    this.log = log;
    this.persistDebounceMs = persistDebounceMs;
  }

  /** Opens (or creates) a database file, recovering from a corrupt file if needed. */
  public static async open(
    filePath: string,
    options: SqliteDatabaseOptions = {}
  ): Promise<SqliteDatabase> {
    const log = options.logger || ((message: string) => console.warn(message));
    const SQL = await initSqlJs({ wasmBinary: SqliteDatabase.readWasmBinary() });

    const directory = path.dirname(filePath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    let db: any;
    if (fs.existsSync(filePath)) {
      try {
        db = new SQL.Database(fs.readFileSync(filePath));
        // Touch the schema to prove the file really is a healthy SQLite database.
        db.exec('SELECT count(*) FROM sqlite_master;');
      } catch (err: any) {
        const backupPath = `${filePath}.corrupt-${Date.now()}`;
        try {
          fs.renameSync(filePath, backupPath);
          log(
            `[SqliteDatabase] Database was unreadable (${err?.message}); moved it to ${backupPath} and started fresh.`
          );
        } catch {
          log(`[SqliteDatabase] Database was unreadable and could not be moved: ${err?.message}`);
        }
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
    }

    db.run('PRAGMA foreign_keys = ON;');

    return new SqliteDatabase(
      db,
      filePath,
      log,
      options.persistDebounceMs ?? 250
    );
  }

  /** Locates sql-wasm.wasm, including when the app runs from inside app.asar. */
  private static readWasmBinary(): Uint8Array {
    const candidates: string[] = [];

    try {
      candidates.push(path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm'));
    } catch {
      // require.resolve can fail in unusual bundling setups; fall through to paths.
    }

    candidates.push(
      path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      path.join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
    );

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return fs.readFileSync(candidate);
        }
      } catch {
        // try the next candidate
      }
    }

    throw new Error(
      `sql-wasm.wasm could not be located (tried: ${candidates.join(', ')}).`
    );
  }

  public getFileSize(): number {
    try {
      return fs.statSync(this.filePath).size;
    } catch {
      return 0;
    }
  }

  public run(sql: string, params: SqlValue[] = []): void {
    this.db.run(sql, params);
    this.markDirty();
  }

  public all<T = any>(sql: string, params: SqlValue[] = []): T[] {
    const statement = this.db.prepare(sql);
    try {
      statement.bind(params);
      const rows: T[] = [];
      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }
      return rows;
    } finally {
      statement.free();
    }
  }

  public get<T = any>(sql: string, params: SqlValue[] = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  /** Runs a raw multi-statement script. */
  public exec(sql: string): void {
    this.db.exec(sql);
    this.markDirty();
  }

  /** Runs `fn` inside a transaction, rolling back if it throws. */
  public transaction<T>(fn: () => T): T {
    this.db.run('BEGIN');
    try {
      const result = fn();
      this.db.run('COMMIT');
      this.markDirty();
      return result;
    } catch (err) {
      try {
        this.db.run('ROLLBACK');
      } catch {
        // ignore rollback failure, original error is more useful
      }
      throw err;
    }
  }

  public markDirty(): void {
    if (this.closed) return;
    this.dirty = true;
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.persistTimer || this.persistDebounceMs <= 0) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flush();
    }, this.persistDebounceMs);
    // Never keep the process alive just to write a debounced snapshot.
    this.persistTimer.unref?.();
  }

  /** Writes the database to disk now, atomically. */
  public flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (!this.dirty || this.closed) return;

    try {
      const bytes = this.db.export();
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, Buffer.from(bytes));
      fs.renameSync(tempPath, this.filePath);
      this.dirty = false;
    } catch (err: any) {
      this.log(`[SqliteDatabase] Failed to persist ${this.filePath}: ${err?.message}`);
    }
  }

  public close(): void {
    if (this.closed) return;
    this.flush();
    this.closed = true;
    try {
      this.db.close();
    } catch {
      // already closed
    }
  }
}
