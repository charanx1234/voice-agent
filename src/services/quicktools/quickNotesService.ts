import { notesStore } from '../storage/notesStore';
import { QuickNoteItem } from '../../shared/types';

function normalizeCategory(cat?: string): QuickNoteItem['category'] {
  const allowed = ['Coding', 'Work', 'Personal', 'Ideas', 'Study', 'General'];
  if (cat && allowed.includes(cat)) return cat as QuickNoteItem['category'];
  return 'General';
}

export class QuickNotesService {
  public getNotes(category?: string, query?: string): QuickNoteItem[] {
    const list = notesStore.listNotes(category, query);
    return list.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      category: normalizeCategory(n.category),
      tags: n.tags || ['general'],
      isPinned: Boolean(n.isPinned),
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }));
  }

  public getNoteById(id: string): QuickNoteItem | undefined {
    const n = notesStore.getNoteByIdOrTitle(id);
    if (!n) return undefined;
    return {
      id: n.id,
      title: n.title,
      content: n.content,
      category: normalizeCategory(n.category),
      tags: n.tags || ['general'],
      isPinned: Boolean(n.isPinned),
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  }

  public saveNote(
    note: Omit<QuickNoteItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): QuickNoteItem {
    const saved = notesStore.saveNote(
      note.title,
      note.content,
      note.category || 'General',
      note.tags || [],
      Boolean(note.isPinned)
    );

    return {
      id: saved.id,
      title: saved.title,
      content: saved.content,
      category: normalizeCategory(saved.category),
      tags: saved.tags || [],
      isPinned: Boolean(saved.isPinned),
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  public deleteNote(id: string): boolean {
    return notesStore.deleteNote(id);
  }

  public togglePin(id: string): QuickNoteItem[] {
    const list = notesStore.togglePin(id);
    return list.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      category: normalizeCategory(n.category),
      tags: n.tags || ['general'],
      isPinned: Boolean(n.isPinned),
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }));
  }
}

export const quickNotesService = new QuickNotesService();
