import { notesStore } from '../storage/notesStore';

/**
 * Determines whether content is worth saving as a note.
 * Returns false for casual chat, greetings, rhetorical questions, etc.
 */
function isNoteWorthSaving(title: string, content: string): boolean {
  const combined = (title + ' ' + content).toLowerCase().trim();

  // Too short to be useful
  if (content.trim().length < 15) return false;

  // Skip pure greetings / small talk
  const trivialPatterns = [
    /^(hi|hey|hello|good morning|good afternoon|good evening|how are you|how's it going|what's up|sup|yo|okay|ok|sure|fine|great|thanks|thank you|bye|goodbye|see you|ttyl|lol|haha|nice|cool|awesome|wow|yep|nope|yes|no)/i,
    /^(what did you say|can you repeat|pardon|never mind|forget it|never mind|i see|i got it|understood|noted|got it|sounds good|makes sense)/i,
  ];
  if (trivialPatterns.some((p) => p.test(content.trim()))) return false;

  // Skip if it's just a question with no factual answer content
  const isJustAQuestion = /^(what|who|where|when|why|how|is|are|was|were|do|does|did|can|could|will|would|should|shall).*?$/.test(content.trim());
  if (isJustAQuestion && content.trim().length < 60) return false;

  // Check for useful content indicators
  const usefulPatterns = [
    /\b(task|todo|to-do|deadline|due|reminder|schedule|meeting|appointment|call|email|buy|get|pick up|purchase|order|fix|build|create|write|finish|complete|review|check|update|send|deliver|submit|apply|interview|project|goal|idea|plan|note|remember|important|urgent|priority|critical|milestone|feature|bug|issue|ticket|pr|pull request|commit|deploy|release|launch|setup|install|configure|integrate|connect|api|database|server|code|script|function|class|module|component|design|wireframe|mockup|prototype|research|study|learn|practice|exercise|read|book|article|course|tutorial)\b/i,
    /\b(password|username|login|credentials|account|key|token|secret|config|setting|preference|contact|phone|address|email|name|birthday|anniversary|event|location|place|country|city|salary|budget|cost|price|invoice|payment|contract|agreement|policy|rule|guideline|requirement|specification|architecture|flowchart|diagram|report|summary|analysis|data|result|output|metric|kpi|performance|benchmark|test|qa|review|feedback|comment|suggestion|recommendation)\b/i,
    /\b(by|until|at|on|before|after|every|weekly|daily|monthly|annually|next week|next month|this week|this month|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
  ];

  if (usefulPatterns.some((p) => p.test(combined))) return true;

  // If it's long enough, it's probably intentional
  if (content.trim().length >= 80) return true;

  // Default: skip if nothing useful found
  return false;
}

export const notesToolDefinitions = [
  {
    name: 'save_note',
    description: 'Saves a new text note or updates an existing note with title and content. ONLY use this tool when the user explicitly asks to save a note, or when there is clearly useful information worth saving: tasks, deadlines, project details, preferences, instructions, reminders, important facts, shopping lists, meeting notes, passwords, contacts, or any structured content the user will need later. Do NOT save casual conversation, greetings, one-off questions, temporary chat, or generic responses. Returns the saved note details.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
          description: 'Short title or subject of the note (e.g., "Grocery List", "Project Ideas").',
        },
        content: {
          type: 'STRING',
          description: 'The body text or content of the note. Must be useful, structured information worth saving for later reference.',
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

      // Usefulness gate: skip trivial or non-useful notes
      if (!isNoteWorthSaving(title, content)) {
        return {
          success: false,
          skipped: true,
          message: 'Note skipped — content does not appear to be worth saving (too casual or trivial).',
        };
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
