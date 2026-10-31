import { notesStore } from '../storage/notesStore';

export const notesToolDefinitions = [
  {
    name: 'save_note',
    description: 'Saves a new text note or updates an existing note with title and content. Returns the saved note details.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
          description: 'Short title or subject of the note (e.g., "Grocery List", "Project Ideas").',
        },
        content: {
          type: 'STRING',
          description: 'The body text or content of the note.',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'list_notes',
    description: 'Lists all saved notes with their titles, creation dates, and excerpts.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'search_notes',
    description: 'Searches saved notes by title or content keywords.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Keyword or phrase to search for within notes.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_note',
    description: 'Reads the complete content of a specific note by title or ID so it can be spoken aloud or summarized.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titleOrId: {
          type: 'STRING',
          description: 'The title or ID of the note to retrieve.',
        },
      },
      required: ['titleOrId'],
    },
  },
];

export async function executeNotesTool(toolName: string, args: Record<string, any>): Promise<any> {
  switch (toolName) {
    case 'save_note': {
      const { title, content } = args;
      if (!title || !content) {
        return { error: 'Both title and content are required to save a note.' };
      }
      const note = notesStore.saveNote(title, content);
      return {
        success: true,
        message: `Note "${note.title}" saved successfully.`,
        note,
        storageLocation: notesStore.getNotesDirectory(),
      };
    }
    case 'list_notes': {
      const notes = notesStore.listNotes();
      return {
        success: true,
        count: notes.length,
        notes: notes.map((n) => ({
          id: n.id,
          title: n.title,
          updatedAt: n.updatedAt,
          preview: n.content.slice(0, 100),
        })),
        storageLocation: notesStore.getNotesDirectory(),
      };
    }
    case 'search_notes': {
      const query = args.query || '';
      const matches = notesStore.searchNotes(query);
      return {
        success: true,
        query,
        count: matches.length,
        results: matches.map((n) => ({
          id: n.id,
          title: n.title,
          updatedAt: n.updatedAt,
          content: n.content,
        })),
      };
    }
    case 'read_note': {
      const titleOrId = args.titleOrId || '';
      const note = notesStore.getNoteByIdOrTitle(titleOrId);
      if (!note) {
        return {
          success: false,
          error: `Note "${titleOrId}" not found.`,
        };
      }
      return {
        success: true,
        title: note.title,
        content: note.content,
        updatedAt: note.updatedAt,
      };
    }
    default:
      return { error: `Unknown notes tool: ${toolName}` };
  }
}

