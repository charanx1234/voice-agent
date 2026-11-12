import { notesToolDefinitions, executeNotesTool } from './notesTool';
import { projectSearchToolDefinition, executeProjectSearchTool } from './projectSearchTool';
import { webResearchToolDefinition, executeWebResearchTool } from './webResearchTool';
import { appShortcutsToolDefinition, executeAppShortcutsTool, ALLOWED_APPLICATIONS } from './appShortcutsTool';
import { researchToolDefinition, executeResearchTool } from './researchTool';
import { memoryToolDefinitions, executeMemoryTool } from '../memory/memoryTool';
import { reminderToolDefinitions, executeReminderTool } from '../reminders/remindersTool';
import { dashboardToolDefinition, executeDashboardTool } from '../dashboard/dashboardTool';
import { websiteAccessibilityToolDefinitions, executeWebsiteAccessibilityTool } from './websiteAccessibilityTool';
import { screenControlToolDefinitions, executeScreenControlTool } from './screenControlTools';
import { chromeBrowserToolDefinitions, executeChromeBrowserTool } from './chromeBrowserTool';
import { musicControlToolDefinitions, executeMusicControlTool } from './musicControlTool';
import { systemControlToolDefinitions, executeSystemControlTool } from './systemControlTools';
import { quickToolsDefinitions, executeQuickToolsAgent } from './quickToolsDefinitions';
import { typeFlowToolDefinitions, executeTypeFlowTool } from '../typeflow/typeflowTools';
import { desktopControlService } from '../desktop/desktopControlService';
import { settingsStore } from '../storage/settingsStore';
import { accentIdFromName, defaultVoiceForAccent } from '../voice/voiceCatalog';
import { ToolConfirmationPayload } from '../../shared/types';
import { EventEmitter } from 'events';
import { PersonalityMode } from '../../shared/types';
import { classifyFridayError } from '../error/errorHandler';

export type ConfirmationRequester = (payload: ToolConfirmationPayload) => Promise<boolean>;

/** Fired when the model decides FRIDAY should go to standby. */
export const standbyEmitter = new EventEmitter();
standbyEmitter.setMaxListeners(20);

export const enterStandbyToolDefinition = {
  name: 'enter_standby',
  description:
    "Puts FRIDAY into hands-free standby: she stops the active conversation, stays quiet, and listens only for her wake word ('Hey Friday'). Call this when the user says something like go offline, go to sleep, standby, stop listening, that's all for now, or goodbye in hands-free mode. Reply with a one-line farewell in the user's language before going quiet.",
  parameters: {
    type: 'OBJECT',
    properties: {},
    required: [],
  },
};

export const voiceAccentToolDefinition = {
  name: 'set_voice_accent',
  description:
    "Switches FRIDAY's English speaking accent — American, British or Indian. Use whenever the user asks FRIDAY to talk, speak or sound in a particular accent (e.g. \"speak in a British accent\"). Applies from the next reply.",
  parameters: {
    type: 'OBJECT',
    properties: {
      accent: {
        type: 'STRING',
        description:
          'The accent to switch to: "American", "British" or "Indian" (or en-US, en-GB, en-IN).',
      },
    },
    required: ['accent'],
  },
};

export function executeVoiceAccentTool(args: Record<string, any>): any {
  const accentId = accentIdFromName(args.accent);
  if (!accentId) {
    return {
      success: false,
      error: `"${args.accent || ''}" is not a supported accent. FRIDAY can speak American, British or Indian English.`,
    };
  }

  const voice = defaultVoiceForAccent(accentId);
  settingsStore.saveSettings({ voiceAccent: accentId, ttsVoice: voice });

  return {
    success: true,
    accent: accentId,
    voice,
    message: `FRIDAY now speaks with a ${
      accentId === 'en-US' ? 'American' : accentId === 'en-GB' ? 'British' : 'Indian'
    } accent.`,
  };
}

export const personalityModeToolDefinition = {
  name: 'set_personality_mode',
  description:
    'Changes FRIDAY presentation style only. Use when the user asks for simple, moderate, balanced, roast, sarcastic or playful behaviour. Intelligence, tools, information and actions stay exactly the same.',
  parameters: {
    type: 'OBJECT',
    properties: {
      mode: {
        type: 'STRING',
        description: 'One of: simple, moderate, roast.',
      },
    },
    required: ['mode'],
  },
};

export function executePersonalityModeTool(args: Record<string, any>): any {
  const value = String(args.mode || '').toLowerCase().trim();
  const aliases: Record<string, PersonalityMode> = {
    simple: 'simple',
    gentle: 'simple',
    caring: 'simple',
    moderate: 'moderate',
    balanced: 'moderate',
    normal: 'moderate',
    roast: 'roast',
    sarcastic: 'roast',
    playful: 'roast',
  };
  const mode = aliases[value];
  if (!mode) {
    return { success: false, error: 'Choose simple, moderate or roast.' };
  }

  settingsStore.saveSettings({ personalityMode: mode });
  return {
    success: true,
    mode,
    message: `FRIDAY personality mode changed to ${mode}.`,
  };
}

export class ToolRegistry {
  private confirmationRequester?: ConfirmationRequester;

  public setConfirmationRequester(fn: ConfirmationRequester): void {
    this.confirmationRequester = fn;
  }

  /**
   * Returns all tool function declarations formatted for Gemini API tools
   */
  public getGeminiToolDeclarations(): any[] {
    const allDefs = [
      ...notesToolDefinitions,
      ...memoryToolDefinitions,
      ...reminderToolDefinitions,
      dashboardToolDefinition,
      projectSearchToolDefinition,
      webResearchToolDefinition,
      researchToolDefinition,
      voiceAccentToolDefinition,
      personalityModeToolDefinition,
      enterStandbyToolDefinition,
      appShortcutsToolDefinition,
      ...websiteAccessibilityToolDefinitions,
      ...screenControlToolDefinitions,
      ...chromeBrowserToolDefinitions,
      ...musicControlToolDefinitions,
      ...systemControlToolDefinitions,
      ...quickToolsDefinitions,
      ...typeFlowToolDefinitions,
    ];

    // Format for @google/genai and @google/generative-ai
    return [
      {
        functionDeclarations: allDefs.map((def) => ({
          name: def.name,
          description: def.description,
          parameters: def.parameters,
        })),
      },
    ];
  }

  /**
   * Checks if user confirmation is required based on settings
   */
  private requiresConfirmation(toolName: string, args?: Record<string, any>): boolean {
    const settings = settingsStore.getSettings();
    const conf = settings.requireToolConfirmations;

    if (toolName === 'launch_allowed_app' && conf.launchApps) return true;
    if (toolName === 'search_project_folder' && conf.folderSearch) return true;
    if (toolName === 'search_web' && conf.webResearch) return true;
    if (toolName === 'save_note' && conf.notes) return true;
    if (
      (toolName === 'click_desktop_element' || toolName === 'move_mouse_cursor') &&
      args?.target &&
      desktopControlService.isDestructiveAction(args.target)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Executes a tool with validation and permission checks
   */
  public async executeTool(toolName: string, args: Record<string, any>): Promise<any> {
    console.log(`[ToolRegistry] Request to execute "${toolName}":`, args);

    // 1. Permission / confirmation check
    if (this.requiresConfirmation(toolName, args) && this.confirmationRequester) {
      const confirmId = `conf_${Date.now()}`;
      let description = `Allow FRIDAY to execute ${toolName}?`;

      if (toolName === 'launch_allowed_app') {
        const app = ALLOWED_APPLICATIONS.find((a) => a.id === args.appId);
        description = `FRIDAY wants to open ${app ? app.name : args.appId} on your computer.`;
      } else if (toolName === 'search_project_folder') {
        description = `FRIDAY wants to search your approved project folders for "${args.query}".`;
      } else if (toolName === 'search_web') {
        description = `FRIDAY wants to search the web for "${args.query}".`;
      } else if (toolName === 'save_note') {
        description = `FRIDAY wants to save a note titled "${args.title}".`;
      } else if (toolName === 'click_desktop_element' || toolName === 'move_mouse_cursor') {
        description = `FRIDAY wants to interact with "${args.target}" on your screen. This action may modify files or settings.`;
      }

      const userApproved = await this.confirmationRequester({
        id: confirmId,
        toolName,
        description,
        details: args,
      });

      if (!userApproved) {
        return {
          success: false,
          rejectedByUser: true,
          error: `Action was cancelled or denied by the user.`,
        };
      }
    }

    // 2. Dispatch to specific tool handler
    try {
      if (['save_note', 'list_notes', 'search_notes', 'read_note'].includes(toolName)) {
        return await executeNotesTool(toolName, args);
      }
      if (toolName === 'save_memory' || toolName === 'search_memory') {
        return await executeMemoryTool(toolName, args);
      }
      if (
        [
          'create_reminder',
          'list_reminders',
          'complete_reminder',
          'create_task',
          'list_tasks',
          'complete_task',
        ].includes(toolName)
      ) {
        return await executeReminderTool(toolName, args);
      }
      if (toolName === 'deep_research') {
        return await executeResearchTool(toolName, args);
      }
      if (toolName === 'set_voice_accent') {
        return executeVoiceAccentTool(args);
      }
      if (toolName === 'set_personality_mode') {
        return executePersonalityModeTool(args);
      }
      if (toolName === 'enter_standby') {
        try {
          standbyEmitter.emit('standby-requested');
        } catch (err: any) {
          console.warn('[ToolRegistry] Standby notification failed:', err?.message);
        }
        return { success: true, standby: true, message: 'FRIDAY is going to standby.' };
      }
      if (toolName === 'show_on_dashboard') {
        return await executeDashboardTool(toolName, args);
      }
      if (toolName === 'search_project_folder') {
        return await executeProjectSearchTool(toolName, args);
      }
      if (toolName === 'search_web') {
        return await executeWebResearchTool(toolName, args);
      }
      if (toolName === 'launch_allowed_app') {
        return await executeAppShortcutsTool(toolName, args);
      }
      if (toolName.startsWith('website_')) {
        return await executeWebsiteAccessibilityTool(toolName, args);
      }
      if (
        [
          'search_in_chrome',
          'open_url_in_chrome',
          'click_chrome_link',
          'control_chrome_tabs',
        ].includes(toolName)
      ) {
        return await executeChromeBrowserTool(toolName, args);
      }
      if (toolName === 'control_music') {
        return await executeMusicControlTool(toolName, args);
      }
      if (
        [
          'control_system_volume',
          'control_system_brightness',
          'get_time_date_info',
          'get_live_weather',
        ].includes(toolName)
      ) {
        return await executeSystemControlTool(toolName, args);
      }
      if (
        [
          'organize_desktop_folder',
          'find_duplicate_files',
          'manage_clipboard_history',
          'manage_text_snippets',
          'arrange_windows',
          'manage_quick_notes',
          'batch_rename_files',
          'search_files_nlp',
          'manage_workspaces',
        ].includes(toolName)
      ) {
        return await executeQuickToolsAgent(toolName, args);
      }
      if (toolName.startsWith('typeflow_')) {
        return await executeTypeFlowTool(toolName, args);
      }
      if (
        [
          'read_screen',
          'get_active_window',
          'move_mouse_cursor',
          'click_desktop_element',
          'type_desktop_text',
          'scroll_desktop',
          'switch_desktop_window',
          'close_desktop_window',
        ].includes(toolName)
      ) {
        return await executeScreenControlTool(toolName, args);
      }

      const classified = classifyFridayError(new Error(`Unrecognized capability: ${toolName}`), { toolName });
      return { success: false, error: classified.userMessage, errorKind: classified.kind };
    } catch (err: any) {
      const classified = classifyFridayError(err, { toolName });
      return {
        success: false,
        error: classified.userMessage,
        errorKind: classified.kind,
        technicalDetails: err?.message,
      };
    }
  }
}

export const toolRegistry = new ToolRegistry();
