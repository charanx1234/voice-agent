import path from 'path';
import { EventEmitter } from 'events';
import { app, Notification } from 'electron';
import { SqliteDatabase } from '../memory/sqliteDatabase';
import { ReminderRecord, ReminderStore } from './reminderStore';
import { parseReminderTime } from './timeParser';

export interface CreateReminderResult {
  success: boolean;
  reminder?: ReminderRecord;
  error?: string;
}

export interface RemindersServiceOptions {
  dbPath?: string;
  logger?: (message: string) => void;
}

/** setTimeout silently overflowing above 24.8 days, so long waits are chunked. */
const MAX_TIMEOUT_MS = 2_147_000_000;

export function defaultReminderDbPath(): string {
  if (process.env.FRIDAY_REMINDERS_DB) {
    return process.env.FRIDAY_REMINDERS_DB;
  }
  try {
    if (app && typeof (app as any).getPath === 'function') {
      return path.join(app.getPath('userData'), 'friday_reminders.db');
    }
  } catch {
    // not running under Electron
  }
  return path.join(process.cwd(), '.data', 'friday_reminders.db');
}

/**
 * Reminder storage plus scheduling. Reminders are created directly from a voice
 * turn (no separate flow) and fire as a Windows toast even while the app is open.
 */
export class RemindersService {
  private readonly dbPath: string;
  private readonly log: (message: string) => void;
  private readonly emitter = new EventEmitter();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  private db?: SqliteDatabase;
  private store?: ReminderStore;
  private initPromise?: Promise<void>;

  constructor(options: RemindersServiceOptions = {}) {
    this.dbPath = options.dbPath || defaultReminderDbPath();
    this.log = options.logger || ((message: string) => (/fail|error|unavailable|could not|timed out/i.test(message) ? console.error(message) : console.log(message)));
  }

  public async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.open().catch((err) => {
        this.initPromise = undefined;
        throw err;
      });
    }
    return this.initPromise;
  }

  private async open(): Promise<void> {
    const db = await SqliteDatabase.open(this.dbPath, { logger: this.log });
    const store = new ReminderStore(db);
    store.migrate();

    this.db = db;
    this.store = store;
    this.scheduleAll();
    this.log(`[Reminders] Ready at ${this.dbPath}`);
  }

  /** Subscribes to 'changed' and 'fired' notifications. Returns an unsubscribe function. */
  public on(event: 'changed' | 'fired', listener: (payload?: any) => void): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  private async ready(): Promise<ReminderStore | null> {
    try {
      await this.init();
      return this.store || null;
    } catch (err: any) {
      this.log(`[Reminders] Unavailable: ${err?.message}`);
      return null;
    }
  }

  public async create(text: string, when: string): Promise<CreateReminderResult> {
    const store = await this.ready();
    if (!store) return { success: false, error: 'Reminder storage is unavailable.' };

    const cleanText = (text || '').trim();
    if (!cleanText) return { success: false, error: 'What should I remind you about?' };

    const parsed = parseReminderTime(when, new Date());
    if (!parsed) {
      return {
        success: false,
        error: `I could not understand the time "${when}". Try "at 6 pm", "in 20 minutes" or "tomorrow at 9".`,
      };
    }

    if (parsed.dueAt.getTime() <= Date.now() - 60_000) {
      return { success: false, error: 'That time is already in the past. When should I remind you?' };
    }

    const reminder = store.create(cleanText, parsed.dueAt);
    this.schedule(reminder);
    this.emitter.emit('changed');

    return { success: true, reminder };
  }

  public async list(includeDone = false): Promise<ReminderRecord[]> {
    const store = await this.ready();
    return store ? store.list({ includeDone }) : [];
  }

  public async complete(idOrText: string): Promise<ReminderRecord | undefined> {
    const store = await this.ready();
    if (!store) return undefined;

    const found = store.findPending(idOrText);
    if (!found) return undefined;

    this.clearTimer(found.id);
    const reminder = store.complete(found.id);
    this.emitter.emit('changed');
    return reminder;
  }

  public async remove(idOrText: string): Promise<boolean> {
    const store = await this.ready();
    if (!store) return false;

    const found = store.findPending(idOrText);
    if (!found) return false;

    this.clearTimer(found.id);
    const removed = store.remove(found.id);
    if (removed) this.emitter.emit('changed');
    return removed;
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  private scheduleAll(): void {
    if (!this.store) return;
    for (const reminder of this.store.list()) {
      this.schedule(reminder);
    }
  }

  private schedule(reminder: ReminderRecord): void {
    this.clearTimer(reminder.id);

    const delay = new Date(reminder.dueAt).getTime() - Date.now();

    if (delay <= 0) {
      // Fire shortly after startup so the UI is ready to display it.
      const timer = setTimeout(() => this.fire(reminder.id), 1500);
      timer.unref?.();
      this.timers.set(reminder.id, timer);
      return;
    }

    if (delay > MAX_TIMEOUT_MS) {
      const timer = setTimeout(() => {
        this.timers.delete(reminder.id);
        this.schedule(reminder);
      }, MAX_TIMEOUT_MS);
      timer.unref?.();
      this.timers.set(reminder.id, timer);
      return;
    }

    const timer = setTimeout(() => this.fire(reminder.id), delay);
    timer.unref?.();
    this.timers.set(reminder.id, timer);
  }

  private fire(id: string): void {
    this.timers.delete(id);
    if (!this.store) return;

    const reminder = this.store.markFired(id);
    if (!reminder) return;

    this.log(`[Reminders] Firing: ${reminder.text}`);

    try {
      if (Notification.isSupported()) {
        new Notification({
          title: 'FRIDAY reminder',
          body: reminder.text,
          silent: false,
        }).show();
      }
    } catch (err: any) {
      this.log(`[Reminders] Could not show notification: ${err?.message}`);
    }

    this.emitter.emit('fired', reminder);
    this.emitter.emit('changed');
  }

  public async shutdown(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();

    if (this.db) {
      this.db.close();
      this.db = undefined;
      this.store = undefined;
      this.initPromise = undefined;
    }
  }

  public flushNow(): void {
    this.shutdownNow();
  }

  /** Synchronous shutdown for `will-quit`: cancels timers, flushes and closes. */
  public shutdownNow(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    try {
      this.db?.close();
    } catch (err: any) {
      this.log(`[Reminders] Final flush failed: ${err?.message}`);
    }

    this.db = undefined;
    this.store = undefined;
    this.initPromise = undefined;
  }
}

export const remindersService = new RemindersService();
