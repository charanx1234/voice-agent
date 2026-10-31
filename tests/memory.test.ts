import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SqliteDatabase } from '../src/services/memory/sqliteDatabase';
import { migrate } from '../src/services/memory/schema';
import { MemoryStore } from '../src/services/memory/memoryStore';
import { ConversationStore, MAX_STORED_MESSAGES } from '../src/services/memory/conversationStore';
import {
  EmbeddingService,
  LOCAL_EMBEDDING_MODEL,
  cosineSimilarity,
  keywordOverlap,
  localEmbedding,
} from '../src/services/memory/embeddings';
import {
  heuristicallyExtract,
  parseExtractionResponse,
} from '../src/services/memory/memoryExtractor';
import { formatMemoryContext } from '../src/services/memory/memoryService';

/** Deterministic embeddings: no network, same algorithm the app falls back to. */
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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-memory-'));
  dbPath = path.join(tempDir, 'friday_memory.db');
  db = await SqliteDatabase.open(dbPath, { persistDebounceMs: 0 });
  migrate(db);
});

afterEach(() => {
  try {
    db.close();
  } catch {
    // already closed by a test
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('SQLite persistence', () => {
  it('writes a real SQLite file that survives reopening', async () => {
    const store = new MemoryStore(db, stubEmbeddings);
    const { memory, action } = await store.create({
      kind: 'personal',
      title: 'Name',
      content: "User's name is Ram Charan.",
      subject: 'name',
      importance: 5,
    });

    expect(action).toBe('created');
    expect(fs.readFileSync(dbPath).subarray(0, 15).toString('utf8')).toBe('SQLite format 3');

    db.close();
    db = await SqliteDatabase.open(dbPath, { persistDebounceMs: 0 });

    const reopened = new MemoryStore(db, stubEmbeddings);
    expect(reopened.count()).toBe(1);
    expect(reopened.get(memory.id)?.content).toBe("User's name is Ram Charan.");
  });

  it('is safe to run migrations twice', () => {
    expect(() => migrate(db)).not.toThrow();
    expect(() => migrate(db)).not.toThrow();
  });

  it('recovers from a corrupt database without throwing', async () => {
    const corruptPath = path.join(tempDir, 'corrupt.db');
    fs.writeFileSync(corruptPath, 'this is definitely not sqlite');

    const recovered = await SqliteDatabase.open(corruptPath, { persistDebounceMs: 0 });
    migrate(recovered);

    const rows = recovered.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memories';"
    );
    expect(rows.length).toBe(1);
    expect(fs.readdirSync(tempDir).some((name) => name.includes('.corrupt-'))).toBe(true);
    recovered.close();
  });
});

describe('MemoryStore', () => {
  it('updates an existing memory instead of duplicating the same subject', async () => {
    const store = new MemoryStore(db, stubEmbeddings);

    const first = await store.create({
      kind: 'personal',
      title: 'Name',
      content: "User's name is Ram.",
      subject: 'name',
      importance: 4,
    });
    const second = await store.create({
      kind: 'personal',
      title: 'Name',
      content: "User's name is Ram Charan.",
      subject: 'name',
      importance: 5,
    });

    expect(first.action).toBe('created');
    expect(second.action).toBe('updated');
    expect(second.memory.id).toBe(first.memory.id);
    expect(store.count()).toBe(1);
    expect(second.memory.content).toContain('Ram Charan');
    expect(second.memory.importance).toBe(5);
  });

  it('rates near-duplicate content as the same memory', async () => {
    const store = new MemoryStore(db, stubEmbeddings);

    await store.create({
      kind: 'preference',
      title: 'Reply language',
      content: 'User prefers all replies in Telugu.',
      importance: 4,
    });
    const duplicate = await store.create({
      kind: 'preference',
      title: 'Reply language',
      content: 'User prefers all replies in Telugu.',
      importance: 4,
    });

    expect(duplicate.action).toBe('updated');
    expect(store.count()).toBe(1);
  });

  it('ranks the most relevant memory first for a semantic query', async () => {
    const store = new MemoryStore(db, stubEmbeddings);

    await store.create({
      kind: 'personal',
      title: 'City',
      content: 'User lives in Hyderabad.',
    });
    await store.create({
      kind: 'preference',
      title: 'Reply language',
      content: 'User prefers replies in Telugu.',
      importance: 4,
    });
    await store.create({
      kind: 'project',
      title: 'Project FRIDAY',
      content: 'User is building a desktop AI companion called FRIDAY.',
    });

    const hits = await store.search('which language should you reply to me in', 5);

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toBe('Reply language');
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('updates, deletes, and reports stats', async () => {
    const store = new MemoryStore(db, stubEmbeddings);

    const { memory } = await store.create({
      kind: 'fact',
      title: 'Pet',
      content: "User has a dog named Bruno.",
    });

    const updated = await store.update(memory.id, { content: "User has a dog named Bruno, a beagle." });
    expect(updated?.content).toContain('beagle');
    expect(updated?.updatedAt).toBeDefined();

    const stats = store.stats();
    expect(stats.total).toBe(1);
    expect(stats.byKind.fact).toBe(1);
    expect(stats.embedded).toBe(1);

    expect(store.delete(memory.id)).toBe(true);
    expect(store.count()).toBe(0);
  });

  it('returns the most important standing instructions as core memory', async () => {
    const store = new MemoryStore(db, stubEmbeddings);

    await store.create({ kind: 'instruction', title: 'Be brief', content: 'Always keep replies short.', importance: 5 });
    await store.create({ kind: 'fact', title: 'Trivia', content: 'User once visited Goa.', importance: 2 });

    const core = store.core(5);
    expect(core.map((item) => item.title)).toContain('Be brief');
    expect(core.map((item) => item.title)).not.toContain('Trivia');
  });
});

describe('ConversationStore', () => {
  it('keeps transcript order and caps stored messages', () => {
    const conversations = new ConversationStore(db);

    conversations.append({ role: 'user', text: 'hello' });
    conversations.append({ role: 'assistant', text: 'hi there' });

    const recent = conversations.loadRecent(10);
    expect(recent.map((message) => message.text)).toEqual(['hello', 'hi there']);
    expect(recent[0].role).toBe('user');

    for (let i = 0; i < MAX_STORED_MESSAGES + 10; i++) {
      conversations.append({ role: 'user', text: `filler ${i}` });
    }

    expect(conversations.count()).toBe(MAX_STORED_MESSAGES);
    // Newest message must still be present after pruning.
    const after = conversations.loadRecent(MAX_STORED_MESSAGES);
    expect(after[after.length - 1].text).toBe(`filler ${MAX_STORED_MESSAGES + 9}`);
  });

  it('clears the transcript on request', () => {
    const conversations = new ConversationStore(db);
    conversations.append({ role: 'user', text: 'remember nothing' });
    expect(conversations.count()).toBe(1);

    conversations.clear();
    expect(conversations.count()).toBe(0);
    expect(conversations.loadRecent(10)).toEqual([]);
  });
});

describe('Memory extraction parsing', () => {
  it('parses a clean JSON array', () => {
    const raw = JSON.stringify([
      { kind: 'preference', subject: 'reply-language', title: 'Reply language', content: 'User prefers Telugu replies.', importance: 5 },
    ]);

    const memories = parseExtractionResponse(raw);
    expect(memories).toHaveLength(1);
    expect(memories[0].kind).toBe('preference');
    expect(memories[0].importance).toBe(5);
    expect(memories[0].subject).toBe('reply-language');
  });

  it('tolerates code fences and surrounding prose', () => {
    const raw = 'Sure! Here you go:\n```json\n[{"kind":"personal","title":"Name","content":"User is Ram.","importance":"4"}]\n```';
    const memories = parseExtractionResponse(raw);

    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe('User is Ram.');
    expect(memories[0].importance).toBe(4);
  });

  it('rejects malformed entries and unknown kinds', () => {
    const raw = JSON.stringify([
      { kind: 'nonsense', title: 'Odd', content: 'User likes tea.', importance: 99 },
      { kind: 'fact', title: '', content: '' },
      'not an object',
    ]);

    const memories = parseExtractionResponse(raw);
    expect(memories).toHaveLength(1);
    expect(memories[0].kind).toBe('fact');
    expect(memories[0].importance).toBe(5);
  });

  it('returns an empty list for garbage', () => {
    expect(parseExtractionResponse('')).toEqual([]);
    expect(parseExtractionResponse('not json at all')).toEqual([]);
    expect(parseExtractionResponse('[{"broken":')).toEqual([]);
  });

  it('never extracts more than three memories per turn', () => {
    const raw = JSON.stringify(
      Array.from({ length: 8 }, (_, index) => ({
        kind: 'fact',
        title: `Fact ${index}`,
        content: `Something durable ${index}.`,
        importance: 3,
      }))
    );

    expect(parseExtractionResponse(raw)).toHaveLength(3);
  });
});

describe('Heuristic extraction (offline fallback)', () => {
  it('captures an explicit "remember" request', () => {
    const memories = heuristicallyExtract('Remember that my office is on the third floor.');
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toContain('third floor');
  });

  it('captures name and location statements', () => {
    const memories = heuristicallyExtract('My name is Ram Charan and I live in Hyderabad.');
    const contents = memories.map((memory) => memory.content).join(' ');

    expect(contents).toContain('Ram Charan');
    expect(contents).toContain('Hyderabad');
  });

  it('ignores small talk', () => {
    expect(heuristicallyExtract('What is the weather today?')).toEqual([]);
    expect(heuristicallyExtract('Thanks, that was helpful!')).toEqual([]);
  });
});

describe('Memory context formatting and similarity', () => {
  const baseMemory = {
    id: 'm1',
    kind: 'preference' as const,
    subject: 'reply-language',
    title: 'Reply language',
    content: 'User prefers Telugu replies.',
    importance: 5,
    source: 'chat' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('returns an empty string when there is nothing to inject', () => {
    expect(formatMemoryContext([])).toBe('');
  });

  it('includes kind, title, content and marks important memories', () => {
    const block = formatMemoryContext([baseMemory]);

    expect(block).toContain('LONG-TERM MEMORY');
    expect(block).toContain('User prefers Telugu replies.');
    expect(block).toContain('[preference, important]');
    expect(block).toContain('Do not invent memories');
  });

  it('produces deterministic local embeddings', () => {
    const a = localEmbedding('user prefers telugu replies');
    const b = localEmbedding('user prefers telugu replies');
    const c = localEmbedding('completely different topic about cars');

    expect(a).toEqual(b);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    expect(cosineSimilarity(a, c)).toBeLessThan(0.8);
  });

  it('scores keyword overlap with prefix matching', () => {
    expect(keywordOverlap('reply language', 'User prefers replies in Telugu')).toBeGreaterThan(0);
    expect(keywordOverlap('quantum physics', 'User prefers Telugu replies')).toBe(0);
  });
});
