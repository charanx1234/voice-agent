import fs from 'fs';
import path from 'path';
import os from 'os';
import { QuickNoteItem } from '../../shared/types';

export class QuickNotesService {
  private notesFile: string;
  private notes: QuickNoteItem[] = [];

  constructor(customNotesPath?: string) {
    if (customNotesPath) {
      this.notesFile = customNotesPath;
    } else {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const dir = path.join(appData, 'friday-ai-companion');
      if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      }
      this.notesFile = path.join(dir, 'quick_notes.json');
    }

    this.loadNotes();
  }

  public getNotes(category?: string, query?: string): QuickNoteItem[] {
    let result = [...this.notes];

    if (category && category !== 'All') {
      const catLower = category.toLowerCase();
      result = result.filter((n) => n.category.toLowerCase() === catLower);
    }

    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Sort: pinned first, then by updatedAt descending
    return result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  public getNoteById(id: string): QuickNoteItem | undefined {
    return this.notes.find((n) => n.id === id);
  }

  public saveNote(
    note: Omit<QuickNoteItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): QuickNoteItem {
    const now = new Date().toISOString();

    if (note.id) {
      const index = this.notes.findIndex((n) => n.id === note.id);
      if (index >= 0) {
        const updated: QuickNoteItem = {
          ...this.notes[index],
          ...note,
          title: note.title.trim() || 'Untitled Note',
          content: note.content.trim(),
          updatedAt: now,
        };
        this.notes[index] = updated;
        this.persistNotes();
        return updated;
      }
    }

    const newNote: QuickNoteItem = {
      id: `qnote_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: note.title.trim() || 'Untitled Note',
      content: note.content.trim(),
      category: note.category || 'General',
      tags: note.tags || [],
      isPinned: note.isPinned || false,
      createdAt: now,
      updatedAt: now,
    };

    this.notes.unshift(newNote);
    this.persistNotes();
    return newNote;
  }

  public togglePin(id: string): QuickNoteItem[] {
    const note = this.notes.find((n) => n.id === id);
    if (note) {
      note.isPinned = !note.isPinned;
      note.updatedAt = new Date().toISOString();
      this.persistNotes();
    }
    return this.getNotes();
  }

  public deleteNote(id: string): boolean {
    const count = this.notes.length;
    this.notes = this.notes.filter((n) => n.id !== id);
    if (this.notes.length !== count) {
      this.persistNotes();
      return true;
    }
    return false;
  }

  private loadNotes(): void {
    try {
      if (fs.existsSync(this.notesFile)) {
        const raw = fs.readFileSync(this.notesFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.notes = parsed;
          return;
        }
      }
    } catch {}

    // Initial starter note
    this.notes = [
      {
        id: 'qnote_welcome',
        title: 'Welcome to Quick Notes',
        content: 'Use voice commands like "Friday, remember this note: project meeting tomorrow" or create notes directly in QuickTools.',
        category: 'General',
        tags: ['welcome', 'guide'],
        isPinned: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    this.persistNotes();
  }

  private persistNotes(): void {
    try {
      fs.writeFileSync(this.notesFile, JSON.stringify(this.notes, null, 2), 'utf8');
    } catch {}
  }
}

export const quickNotesService = new QuickNotesService();
