import { memoryService } from '../memory/memoryService';
import { MEMORY_KINDS, MemoryKind } from '../memory/memoryStore';

export const memoryToolDefinitions = [
  {
    name: 'save_memory',
    description:
      'Saves a durable fact, user preference, personal detail, standing instruction, or ongoing project into long-term memory so it is remembered in future sessions. Use this when the user says "remember that...", states a lasting preference, or shares an important personal/project detail.',
    parameters: {
      type: 'OBJECT',
      properties: {
        kind: {
          type: 'STRING',
          description: `Category of memory: ${MEMORY_KINDS.join(', ')}.`,
        },
        title: {
          type: 'STRING',
          description: 'Short label for the memory, e.g. "Preferred reply language" or "Project FRIDAY".',
        },
        content: {
          type: 'STRING',
          description: 'One concise sentence describing the fact, written in the third person.',
        },
        importance: {
          type: 'NUMBER',
          description: 'Importance from 1 to 5, where 5 is core identity or an explicit instruction.',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'search_memory',
    description:
      'Searches long-term memory for facts the user previously told you (preferences, personal details, projects, instructions). Use when the user refers to something from an earlier conversation.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'What to look for in memory, e.g. "favourite food" or "current project".',
        },
      },
      required: ['query'],
    },
  },
];

export async function executeMemoryTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  switch (toolName) {
    case 'save_memory': {
      const title = (args.title || '').trim();
      const content = (args.content || '').trim();
      if (!title || !content) {
        return { success: false, error: 'Both title and content are required to save a memory.' };
      }

      const kind: MemoryKind = MEMORY_KINDS.includes(args.kind) ? args.kind : 'fact';

      try {
        const result = await memoryService.create({
          kind,
          title,
          content,
          importance: typeof args.importance === 'number' ? args.importance : 4,
        });

        return {
          success: true,
          action: result.action,
          message:
            result.action === 'created'
              ? `Saved to long-term memory: ${title}.`
              : `Updated existing memory: ${title}.`,
          memory: result.memory,
        };
      } catch (err: any) {
        return { success: false, error: `Could not save memory: ${err.message}` };
      }
    }

    case 'search_memory': {
      const query = (args.query || '').trim();
      if (!query) {
        return { success: false, error: 'A search query is required.' };
      }

      const results = await memoryService.search(query, 8);
      return {
        success: true,
        query,
        count: results.length,
        results: results.map((memory) => ({
          id: memory.id,
          kind: memory.kind,
          title: memory.title,
          content: memory.content,
          importance: memory.importance,
          score: memory.score,
        })),
      };
    }

    default:
      return { success: false, error: `Unknown memory tool: ${toolName}` };
  }
}
