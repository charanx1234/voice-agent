import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { QuickNotesService } from '../src/services/quicktools/quickNotesService';

describe('QuickNotesService', () => {
  let tempDir: string;
  let tempNotesPath: string;
  let service: QuickNotesService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qnotes-test-'));
    tempNotesPath = path.join(tempDir, 'notes.json');
    service = new QuickNotesService(tempNotesPath);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('initializes with default starter note', () => {
    const notes = service.getNotes();
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes[0].title).toBe('Welcome to Quick Notes');
  });

  it('creates and retrieves notes', () => {
    const saved = service.saveNote({
      title: 'Meeting Notes',
      content: 'Discuss sprint goals and backlog items.',
      category: 'Work',
      tags: ['work', 'sprint'],
      isPinned: false,
    });

    expect(saved.id).toBeDefined();
    expect(saved.title).toBe('Meeting Notes');

    const workNotes = service.getNotes('Work');
    expect(workNotes.some((n) => n.id === saved.id)).toBe(true);

    const generalNotes = service.getNotes('Ideas');
    expect(generalNotes.some((n) => n.id === saved.id)).toBe(false);
  });

  it('searches notes by query text and tags', () => {
    service.saveNote({
      title: 'Neural Net Architecture',
      content: 'Transformer layers with rotary position embeddings.',
      category: 'Ideas',
      tags: ['ai', 'research'],
    });

    const searchResults = service.getNotes(undefined, 'rotary');
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].title).toBe('Neural Net Architecture');
  });

  it('toggles pin and sorts pinned notes to top', () => {
    const n1 = service.saveNote({ title: 'Note 1', content: 'c1', category: 'General' });
    const n2 = service.saveNote({ title: 'Note 2', content: 'c2', category: 'General' });

    // Pin n1
    service.togglePin(n1.id);
    const notes = service.getNotes();
    expect(notes[0].id).toBe(n1.id);
    expect(notes[0].isPinned).toBe(true);
  });

  it('deletes notes correctly', () => {
    const note = service.saveNote({ title: 'Temp Note', content: 'delete me', category: 'General' });
    expect(service.getNotes().some((n) => n.id === note.id)).toBe(true);

    const deleted = service.deleteNote(note.id);
    expect(deleted).toBe(true);
    expect(service.getNotes().some((n) => n.id === note.id)).toBe(false);
  });
});
