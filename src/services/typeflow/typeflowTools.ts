import { typeFlowController } from './typeflowController';
import { typeFlowAi } from './typeflowAiIntelligence';
import { typeFlowService } from './typeflowService';
import { typingEngineManager } from './typingEngineManager';

export const typeFlowToolDefinitions = [
  {
    name: 'typeflow_type_clipboard',
    description: 'Types the current clipboard text into the currently focused supported application window using FRIDAY TypeFlow.',
    parameters: {
      type: 'OBJECT',
      properties: {
        speed_wpm: { type: 'NUMBER', description: 'Typing speed in words per minute (optional, default 60).' },
        delay_ms: { type: 'NUMBER', description: 'Delay between keystrokes in milliseconds (optional, default 25).' },
      },
      required: [],
    },
  },
  {
    name: 'typeflow_read_selection',
    description: 'Reads the text currently selected by the mouse or cursor in the active window using Windows UI Automation.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
  {
    name: 'typeflow_explain_selection',
    description: 'Reads the selected text and provides a clear explanation, breakdown, or answer using FRIDAY AI brain.',
    parameters: {
      type: 'OBJECT',
      properties: {
        instruction: { type: 'STRING', description: 'Specific follow-up instruction (e.g. "make it short", "explain the bug", "summarize").' },
      },
      required: [],
    },
  },
  {
    name: 'typeflow_type_text',
    description: 'Types specific text into the active supported application window after user approval.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'The text to type into the focused field.' },
        delay_ms: { type: 'NUMBER', description: 'Typing delay in ms per character (default 25).' },
      },
      required: ['text'],
    },
  },
  {
    name: 'typeflow_pause_session',
    description: 'Pauses the currently active typing session.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
  {
    name: 'typeflow_resume_session',
    description: 'Resumes a paused typing session.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
  {
    name: 'typeflow_cancel_session',
    description: 'Cancels the currently running typing session immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
  {
    name: 'typeflow_clear_context',
    description: 'Clears the active selected-text context in FRIDAY TypeFlow.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
];

export async function executeTypeFlowTool(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'typeflow_type_clipboard': {
      try {
        const text = typeFlowController.getClipboardText();
        if (!text) {
          return { success: false, error: 'Clipboard is empty.' };
        }
        const delayMs = args.delay_ms || (args.speed_wpm ? Math.round(12000 / args.speed_wpm) : 25);
        const res = await typeFlowController.typeClipboard({ charDelayMs: delayMs });
        return {
          success: res.success,
          charsTyped: res.charsTyped,
          targetProcess: res.targetProcess,
          message: `Successfully typed ${res.charsTyped} characters from clipboard into ${res.targetProcess}.`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    case 'typeflow_read_selection': {
      try {
        const sel = await typeFlowController.readSelectedText();
        if (!sel.text) {
          return { success: false, error: sel.error || 'No selected text found.' };
        }
        const preview = sel.text.length > 200 ? sel.text.slice(0, 197) + '...' : sel.text;
        return {
          success: true,
          text: sel.text,
          length: sel.text.length,
          application: sel.application,
          source: sel.source,
          message: `Selected text captured from ${sel.application}: "${preview}"`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    case 'typeflow_explain_selection': {
      try {
        let sel = typeFlowController.getActiveContext()?.selectedText;
        if (!sel) {
          const fresh = await typeFlowController.readSelectedText();
          sel = fresh.text;
        }
        if (!sel) {
          return { success: false, error: 'Please select some text with your mouse first.' };
        }

        const instruction = args.instruction || 'Explain this clearly and give a concise answer.';
        const explanation = await typeFlowAi.generateResponse(sel, instruction);
        return {
          success: true,
          selectedText: sel,
          explanation,
          message: explanation,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    case 'typeflow_type_text': {
      try {
        const text = args.text || '';
        if (!text) return { success: false, error: 'No text provided to type.' };
        const delayMs = args.delay_ms || 25;
        const res = await typeFlowController.typeText(text, { charDelayMs: delayMs });
        return {
          success: res.success,
          charsTyped: res.charsTyped,
          targetProcess: res.targetProcess,
          message: `Typed ${res.charsTyped} characters into ${res.targetProcess}.`,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    case 'typeflow_pause_session': {
      const ok = await typeFlowController.pause();
      return { success: ok, message: ok ? 'Typing session paused.' : 'No active session to pause.' };
    }

    case 'typeflow_resume_session': {
      const ok = await typeFlowController.resume();
      return { success: ok, message: ok ? 'Typing session resumed.' : 'No paused session to resume.' };
    }

    case 'typeflow_cancel_session': {
      const ok = await typeFlowController.cancel();
      return { success: ok, message: ok ? 'Typing session cancelled.' : 'No active session to cancel.' };
    }

    case 'typeflow_clear_context': {
      typeFlowController.clearContext();
      return { success: true, message: 'TypeFlow context cleared.' };
    }

    default:
      return { success: false, error: `Unknown TypeFlow tool: ${name}` };
  }
}
