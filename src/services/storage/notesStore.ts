import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { NoteItem } from '../../shared/types';

export class NotesStore {
  private notesDir: string;
  private indexPath: string;
  private notes: NoteItem[] = [];

  constructor() {
    let userDataDir = '';
    try {
      userDataDir = app ? app.getPath('userData') : path.join(process.cwd(), '.data');
    } catch {
      userDataDir = path.join(process.cwd(), '.data');
    }

    this.notesDir = path.join(userDataDir, 'notes');
    this.indexPath = path.join(this.notesDir, 'index.json');

    if (!fs.existsSync(this.notesDir)) {
      fs.mkdirSync(this.notesDir, { recursive: true });
    }

    this.loadNotes();
  }

  public getNotesDirectory(): string {
    return this.notesDir;
  }

  private loadNotes(): void {
    try {
      if (fs.existsSync(this.indexPath)) {
        const raw = fs.readFileSync(this.indexPath, 'utf-8');
        this.notes = JSON.parse(raw);
      } else {
        this.notes = [];
      }
    } catch (err) {
      console.error('[NotesStore] Error loading notes:', err);
      this.notes = [];
    }
  }

  private persistIndex(): void {
    try {
      fs.writeFileSync(this.indexPath, JSON.stringify(this.notes, null, 2), 'utf-8');
    } catch (err) {
      console.error('[NotesStore] Error saving notes index:', err);
    }
  }

  public listNotes(): NoteItem[] {
    return [...this.notes].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public saveNote(title: string, content: string): NoteItem {
    const cleanTitle = (title || 'Untitled Note').trim().replace(/[\\/:*?"<>|]/g, '_');
    const now = new Date().toISOString();
    
    // Check if a note with this title already exists
    const existingIndex = this.notes.findIndex(
      (n) => n.title.toLowerCase() === cleanTitle.toLowerCase()
    );

    let note: NoteItem;

    if (existingIndex >= 0) {
      note = {
        ...this.notes[existingIndex],
        content,
        updatedAt: now,
      };
      this.notes[existingIndex] = note;
    } else {
      const id = `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      note = {
        id,
        title: cleanTitle,
        content,
        createdAt: now,
        updatedAt: now,
      };
      this.notes.unshift(note);
    }

    // Also write a standalone readable text file (.txt) so the user can easily view or edit in Notepad
    try {
      const textFilePath = path.join(this.notesDir, `${cleanTitle}.txt`);
      fs.writeFileSync(textFilePath, content, 'utf-8');
    } catch (e) {
      console.warn('[NotesStore] Failed to write plain txt backup:', e);
    }

    this.persistIndex();
    return note;
  }

  public searchNotes(query: string): NoteItem[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.listNotes();

    return this.notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }

  public getNoteByIdOrTitle(identifier: string): NoteItem | undefined {
    const q = identifier.toLowerCase().trim();
    return this.notes.find(
      (n) => n.id === identifier || n.title.toLowerCase() === q || n.title.toLowerCase().includes(q)
    );
  }

  public deleteNote(id: string): boolean {
    const index = this.notes.findIndex((n) => n.id === id);
    if (index === -1) return false;

    const [removed] = this.notes.splice(index, 1);
    try {
      const textFilePath = path.join(this.notesDir, `${removed.title}.txt`);
      if (fs.existsSync(textFilePath)) {
        fs.unlinkSync(textFilePath);
      }
    } catch (e) {
      console.warn('[NotesStore] Failed to remove txt file:', e);
    }

    this.persistIndex();
    return true;
  }
}

export const notesStore = new NotesStore();

