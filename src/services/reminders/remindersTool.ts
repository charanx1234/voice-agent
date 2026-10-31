import { remindersService } from './remindersService';

function formatDue(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const reminderToolDefinitions = [
  {
    name: 'create_reminder',
    description:
      'Creates a reminder immediately from what the user said. Pass the time phrase exactly as the user spoke it (for example "at 6", "in 20 minutes", "tomorrow at 9"). Never send the user to another screen — confirm it verbally in one short sentence.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: {
          type: 'STRING',
          description: 'What to remind the user about, e.g. "call mom".',
        },
        when: {
          type: 'STRING',
          description: 'When it should fire, as spoken: "at 6", "6pm", "in 20 minutes", "tomorrow at 9".',
        },
      },
      required: ['text', 'when'],
    },
  },
  {
    name: 'list_reminders',
    description: 'Lists the user’s pending reminders with their due times.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'complete_reminder',
    description: 'Marks a pending reminder as done, matched by id or by its text.',
    parameters: {
      type: 'OBJECT',
      properties: {
        idOrText: {
          type: 'STRING',
          description: 'The reminder id or a few words from the reminder text.',
        },
      },
      required: ['idOrText'],
    },
  },
];

export async function executeReminderTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  switch (toolName) {
    case 'create_reminder': {
      const result = await remindersService.create(args.text || '', args.when || '');
      if (!result.success || !result.reminder) {
        return { success: false, error: result.error || 'Could not create that reminder.' };
      }

      return {
        success: true,
        reminder: {
          id: result.reminder.id,
          text: result.reminder.text,
          dueAt: result.reminder.dueAt,
        },
        dueText: formatDue(result.reminder.dueAt),
        message: `Reminder created for ${formatDue(result.reminder.dueAt)}: ${result.reminder.text}. Confirm it to the user in one short sentence.`,
      };
    }

    case 'list_reminders': {
      const reminders = await remindersService.list(false);
      return {
        success: true,
        count: reminders.length,
        reminders: reminders.map((reminder) => ({
          id: reminder.id,
          text: reminder.text,
          dueAt: reminder.dueAt,
          dueText: formatDue(reminder.dueAt),
        })),
      };
    }

    case 'complete_reminder': {
      const completed = await remindersService.complete(args.idOrText || '');
      if (!completed) {
        return { success: false, error: 'No pending reminder matched that.' };
      }
      return {
        success: true,
        message: `Marked "${completed.text}" as done.`,
      };
    }

    default:
      return { success: false, error: `Unknown reminder tool: ${toolName}` };
  }
}
