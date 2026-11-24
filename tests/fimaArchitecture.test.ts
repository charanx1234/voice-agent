import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SqliteDatabase } from '../src/services/memory/sqliteDatabase';
import { migrate } from '../src/services/memory/schema';
import { MemoryStore } from '../src/services/memory/memoryStore';
import { evaluateGate } from '../src/services/memory/memoryGate';
import { MemoryActivityLog } from '../src/services/memory/memoryActivity';
import { MemoryHistoryTracker } from '../src/services/memory/memoryHistory';
import { MemoryLifecycleManager } from '../src/services/memory/memoryLifecycle';
import { ProjectMemoryManager } from '../src/services/memory/projectMemory';
import { buildMemoryContextBlock } from '../src/services/memory/memoryContextBuilder';
import { resolveConflict, likelyConflict } from '../src/services/memory/memoryConflict';
import {
  EmbeddingService,
  LOCAL_EMBEDDING_MODEL,
  localEmbedding,
} from '../src/services/memory/embeddings';

const stubEmbeddings = {
  embed: async (text: string) => ({
    vector: localEmbedding(text),
    model: LOCAL_EMBEDDING_MODEL,
    usedFallback: true,
  }),
} as unknown as EmbeddingService;

let tempDir: string;
let dbPath: string;
let db: SqliteDatabase;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-fima-test-'));
  dbPath = path.join(tempDir, 'friday_memory.db');
  db = await SqliteDatabase.open(dbPath, { persistDebounceMs: 0 });
  migrate(db);
});

afterEach(() => {
  try {
    db.close();
  } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('FIMA V1: Memory Intelligence Gate', () => {
  it('Scenario 1: Casual greetings are ignored', () => {
    const greetings = ['Hey, what\'s up?', 'Hello Friday!', 'Hi', 'Good morning', 'yo', 'thanks!'];
    for (const text of greetings) {
      const res = evaluateGate({ userText: text, assistantText: 'Hello! How can I help?' });
      expect(res.decision).toBe('ignore');
    }
  });

  it('Scenario 2: Temporary tasks remain temporary (working memory only)', () => {
    const tempPhrases = [
      'I am currently debugging FRIDAY\'s microphone right now',
      'I\'m testing the audio volume right now',
    ];
    for (const text of tempPhrases) {
      const res = evaluateGate({ userText: text, assistantText: 'Understood, let me know what you find.' });
      expect(res.decision).toBe('temporary');
    }
  });

  it('Scenario 3: Useful preferences are saved', () => {
    const res = evaluateGate({
      userText: 'I prefer concise answers without conversational filler.',
      assistantText: 'Understood, I will keep responses direct and concise.',
    });
    expect(res.decision).toBe('save');
    expect(res.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('Scenario 4: Explicit remember requests receive highest priority', () => {
    const res = evaluateGate({
      userText: 'From now on, remember that my project architecture uses Electron and SQLite.',
      assistantText: 'Saved to memory.',
    });
    expect(res.decision).toBe('save');
    expect(res.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('Scenario 5: Pure punctuation or numbers are ignored', () => {
    expect(evaluateGate({ userText: '???', assistantText: 'What?' }).decision).toBe('ignore');
    expect(evaluateGate({ userText: '12345', assistantText: 'Got it.' }).decision).toBe('ignore');
  });

  it('Scenario 6: L0 fast-path responses are ignored unless explicit save cue exists', () => {
    const l0 = evaluateGate({
      userText: 'What is the time?',
      assistantText: 'It is 12:30 PM.',
      isL0Response: true,
    });
    expect(l0.decision).toBe('ignore');
  });
});

describe('FIMA V1: Conflict Resolution & Lifecycle', () => {
  it('Scenario 7 & 8: Explicit user corrections overwrite older information', () => {
    const existing = {
      id: 'mem_1',
      kind: 'preference' as const,
      subject: 'response-style',
      title: 'Response Style',
      content: 'User prefers detailed long explanations.',
      importance: 3,
      source: 'chat' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = resolveConflict(
      existing,
      'User prefers short concise bullet points.',
      4,
      'Actually, that changed, I now prefer short concise bullet points.'
    );

    expect(res.resolution).toBe('overwrite');
    expect(res.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('Scenario 9 & 11: A planned change does not overwrite verified existing memory', () => {
    const existing = {
      id: 'mem_2',
      kind: 'project' as const,
      subject: 'architecture',
      title: 'Current Architecture',
      content: 'FRIDAY uses Electron with SQLite.',
      importance: 4,
      source: 'chat' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = resolveConflict(
      existing,
      'Planning to migrate FRIDAY to PostgreSQL in the future.',
      3,
      'I am thinking of migrating FRIDAY to PostgreSQL later.'
    );

    expect(res.resolution).toBe('pending_review');
  });

  it('Scenario 10: Lifecycle manager marks expired temporary memories as outdated', () => {
    const history = new MemoryHistoryTracker(db);
    const activity = new MemoryActivityLog(db);
    const lifecycle = new MemoryLifecycleManager(db, history, activity);

    const pastDate = new Date(Date.now() - 3600_000).toISOString();
    db.run(
      `INSERT INTO memories (id, kind, title, content, importance, source, created_at, updated_at, status, expiration_at)
       VALUES ('temp_1', 'fact', 'Temp debug step', 'Testing mic', 2, 'chat', ?, ?, 'temporary', ?);`,
      [pastDate, pastDate, pastDate]
    );

    const expiredCount = lifecycle.expireTemporaryMemories();
    expect(expiredCount).toBe(1);

    const row = db.get<{ status: string }>('SELECT status FROM memories WHERE id = "temp_1";');
    expect(row?.status).toBe('outdated');
  });

  it('Scenario 12: Superseding preserves history and updates status', () => {
    const history = new MemoryHistoryTracker(db);
    const activity = new MemoryActivityLog(db);
    const lifecycle = new MemoryLifecycleManager(db, history, activity);

    db.run(
      `INSERT INTO memories (id, kind, title, content, importance, source, created_at, updated_at, status)
       VALUES ('old_1', 'preference', 'Old Lang', 'User speaks Hindi', 3, 'chat', '2026-01-01', '2026-01-01', 'active');`
    );

    lifecycle.supersede('old_1', 'new_1', 'User updated preferred language to English');

    const oldRow = db.get<{ status: string; supersedes_id: string }>(
      'SELECT status, supersedes_id FROM memories WHERE id = "old_1";'
    );
    expect(oldRow?.status).toBe('superseded');
    expect(oldRow?.supersedes_id).toBe('new_1');

    const hist = history.forMemory('old_1');
    expect(hist.length).toBe(1);
    expect(hist[0].action).toBe('superseded');
  });
});

describe('FIMA V1: Project Memory Manager', () => {
  it('Scenario 13: Maintains dedicated project records', () => {
    const pm = new ProjectMemoryManager(db);

    const proj = pm.create({
      name: 'FRIDAY Assistant',
      description: 'Windows AI desktop companion',
      objective: 'Build autonomous assistant',
      techStack: ['Electron', 'React', 'TypeScript', 'Python'],
      status: 'in_progress',
    });

    expect(proj.id).toBeDefined();
    expect(proj.name).toBe('FRIDAY Assistant');
    expect(proj.techStack).toContain('Electron');
    expect(pm.count()).toBe(1);
  });

  it('Scenario 14: Keeps multiple projects independent', () => {
    const pm = new ProjectMemoryManager(db);

    const p1 = pm.create({ name: 'Poop Counter App', status: 'in_progress' });
    const p2 = pm.create({ name: 'Robotics Sim', status: 'planned' });

    expect(p1.id).not.toBe(p2.id);
    expect(pm.list().length).toBe(2);

    const foundP1 = pm.detectActiveProject('How do I count poop in the Poop Counter App?');
    expect(foundP1?.name).toBe('Poop Counter App');
  });

  it('Scenario 15: Updates project status without destructive actions', () => {
    const pm = new ProjectMemoryManager(db);
    const proj = pm.create({ name: 'Core Engine' });

    pm.update(proj.id, { status: 'verified', description: 'Tested and working' });
    const updated = pm.get(proj.id);

    expect(updated?.status).toBe('verified');
    expect(updated?.description).toBe('Tested and working');
  });
});

describe('FIMA V1: Context Builder', () => {
  it('Scenario 16: Formats active project, preferences, and excludes outdated items from current facts', () => {
    const result = buildMemoryContextBlock({
      activeProject: {
        id: 'proj_1',
        name: 'FRIDAY',
        description: 'Desktop AI Assistant',
        objective: 'Help user with tasks',
        techStack: ['Electron', 'TypeScript'],
        status: 'in_progress',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        archived: false,
      },
      coreMemories: [
        {
          id: 'mem_core',
          kind: 'instruction',
          subject: 'brief',
          title: 'Reply style',
          content: 'Keep answers concise.',
          importance: 5,
          source: 'manual',
          status: 'active',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      relevantMemories: [
        {
          id: 'mem_act',
          kind: 'fact',
          subject: 'creator',
          title: 'Creator',
          content: 'User created FRIDAY.',
          importance: 5,
          source: 'chat',
          status: 'active',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        {
          id: 'mem_out',
          kind: 'fact',
          subject: 'old',
          title: 'Old tool',
          content: 'Used old architecture.',
          importance: 2,
          source: 'chat',
          status: 'outdated',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ],
    });

    expect(result.block).toContain('[ACTIVE PROJECT: FRIDAY]');
    expect(result.block).toContain('[USER PREFERENCES & INSTRUCTIONS]');
    expect(result.block).toContain('Keep answers concise.');
    expect(result.block).toContain('[RELEVANT KNOWLEDGE]');
    expect(result.block).toContain('User created FRIDAY.');
    expect(result.block).toContain('[HISTORICAL CONTEXT — may be outdated]');
    expect(result.block).toContain('Used old architecture.');
  });

  it('Scenario 17: Token budget enforcement truncates safely', () => {
    const coreMemories = Array.from({ length: 30 }, (_, i) => ({
      id: `mem_${i}`,
      kind: 'fact' as const,
      subject: `fact_${i}`,
      title: `Fact number ${i}`,
      content: `This is a long fact description number ${i} intended to test token budget enforcement.`,
      importance: 5,
      source: 'manual' as const,
      status: 'active' as const,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }));

    const result = buildMemoryContextBlock({
      coreMemories,
      relevantMemories: [],
      tokenBudget: 150, // very small budget
    });

    expect(result.memoriesIncluded).toBeLessThan(30);
    expect(result.tokenEstimate).toBeLessThanOrEqual(300);
  });
});

describe('FIMA V1: Activity Logging & Audit Trail', () => {
  it('Scenario 18: Activity log records memory operations with human-readable reasons', () => {
    const activity = new MemoryActivityLog(db);

    activity.log('saved', { memoryId: 'mem_1', reason: 'Auto-extracted preference from chat' });
    activity.log('conflict_detected', { memoryId: 'mem_1', reason: 'Contradiction flagged for review' });

    const recent = activity.recent(10);
    expect(recent.length).toBe(2);
    expect(recent[0].action).toBe('conflict_detected');
    expect(recent[1].action).toBe('saved');
    expect(activity.countLast24h()).toBe(2);
  });
});

describe('FIMA V1: MemoryStore Integration & Retrieval', () => {
  it('Scenario 19: Excludes outdated/superseded memories from active search results', async () => {
    const store = new MemoryStore(db, stubEmbeddings);

    await store.create({
      kind: 'fact',
      title: 'Current Tool',
      content: 'We use Vitest for unit testing.',
      status: 'active',
    });

    await store.create({
      kind: 'fact',
      title: 'Old Tool',
      content: 'We used Jest for unit testing.',
      status: 'outdated',
    });

    const activeResults = await store.search('unit testing');
    expect(activeResults.length).toBe(1);
    expect(activeResults[0].title).toBe('Current Tool');

    const allResults = await store.search('unit testing', 8, true);
    expect(allResults.length).toBe(2);
  });

  it('Scenario 20: Supports project-filtered queries', async () => {
    const store = new MemoryStore(db, stubEmbeddings);

    await store.create({
      kind: 'project',
      title: 'Poop App Feature',
      content: 'Tracks bowel movements',
      projectId: 'proj_poop',
    });

    await store.create({
      kind: 'project',
      title: 'FRIDAY Companion Feature',
      content: 'Floating desktop pet overlay',
      projectId: 'proj_friday',
    });

    const poopMemories = store.listByProject('proj_poop');
    expect(poopMemories.length).toBe(1);
    expect(poopMemories[0].title).toBe('Poop App Feature');

    const fridayMemories = store.listByProject('proj_friday');
    expect(fridayMemories.length).toBe(1);
    expect(fridayMemories[0].title).toBe('FRIDAY Companion Feature');
  });

  it('Scenario 21: Preserves version count on updates', async () => {
    const store = new MemoryStore(db, stubEmbeddings);

    const { memory } = await store.create({
      kind: 'preference',
      title: 'Theme',
      content: 'User prefers dark theme.',
    });

    expect(memory.version).toBe(1);

    const updated = await store.update(memory.id, {
      content: 'User prefers high contrast dark theme.',
    });

    expect(updated?.version).toBe(2);
    expect(updated?.content).toBe('User prefers high contrast dark theme.');
  });
});
