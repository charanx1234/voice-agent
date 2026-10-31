import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from './security';
import { settingsStore } from '../services/storage/settingsStore';
import { notesStore } from '../services/storage/notesStore';
import { geminiService } from '../services/ai/gemini';
import { toolRegistry } from '../services/agent/toolRegistry';
import { memoryService } from '../services/memory/memoryService';
import { remindersService } from '../services/reminders/remindersService';
import { dashboardBus } from '../services/dashboard/dashboardTool';
import { ALLOWED_APPLICATIONS, executeAppShortcutsTool } from '../services/agent/appShortcutsTool';
import { MemoryInputPayload, ToolConfirmationPayload } from '../shared/types';

let handlersRegistered = false;

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  // ipcMain.handle throws if the same channel is registered twice, which happens
  // whenever the window is recreated (e.g. macOS "activate").
  if (handlersRegistered) return;
  handlersRegistered = true;

  // Pending user confirmations
  const pendingConfirmations = new Map<string, (confirmed: boolean) => void>();

  // Wire tool registry confirmation to the renderer
  toolRegistry.setConfirmationRequester((payload: ToolConfirmationPayload) => {
    return new Promise<boolean>((resolve) => {
      pendingConfirmations.set(payload.id, resolve);
      getMainWindow()?.webContents.send(IPC_CHANNELS.TOOL_CONFIRM_REQUEST, payload);

      // Auto-cancel if user doesn't respond within 60 seconds
      setTimeout(() => {
        if (pendingConfirmations.has(payload.id)) {
          pendingConfirmations.delete(payload.id);
          resolve(false);
        }
      }, 60000);
    });
  });

  // Listen for user response to tool confirmation
  ipcMain.on(IPC_CHANNELS.TOOL_CONFIRM_RESPONSE, (_event, { id, confirmed }) => {
    const resolver = pendingConfirmations.get(id);
    if (resolver) {
      pendingConfirmations.delete(id);
      resolver(Boolean(confirmed));
    }
  });

  // Settings
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async () => {
    return settingsStore.getMaskedSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, async (_event, updates) => {
    try {
      settingsStore.saveSettings(updates);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEST_CONNECTION, async (_event, keyOverride) => {
    return await geminiService.testConnection(keyOverride);
  });

  // Chat / Voice message
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, payload) => {
    return await geminiService.sendMessage(payload);
  });

  // Select folder via native dialog
  ipcMain.handle(IPC_CHANNELS.SELECT_FOLDER, async () => {
    const dialogOptions: Electron.OpenDialogOptions = {
      title: 'Select Approved Project Folder for FRIDAY',
      properties: ['openDirectory'],
    };

    const win = getMainWindow();
    const result = win
      ? await dialog.showOpenDialog(win, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selectedFolder = result.filePaths[0];
    const settings = settingsStore.getSettings();
    const approved = new Set(settings.approvedFolders || []);
    approved.add(selectedFolder);

    settingsStore.saveSettings({ approvedFolders: Array.from(approved) });
    return selectedFolder;
  });

  // Open path in Explorer
  ipcMain.handle(IPC_CHANNELS.OPEN_PATH, async (_event, targetPath: string) => {
    try {
      if (targetPath) {
        await shell.openPath(targetPath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  });

  // Notes
  ipcMain.handle(IPC_CHANNELS.LIST_NOTES, async () => {
    return notesStore.listNotes();
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_NOTE, async (_event, { title, content }) => {
    return notesStore.saveNote(title, content);
  });

  ipcMain.handle(IPC_CHANNELS.DELETE_NOTE, async (_event, id) => {
    return notesStore.deleteNote(id);
  });

  // Apps
  ipcMain.handle(IPC_CHANNELS.GET_ALLOWED_APPS, async () => {
    return ALLOWED_APPLICATIONS;
  });

  ipcMain.handle(IPC_CHANNELS.LAUNCH_APP, async (_event, appId) => {
    return await executeAppShortcutsTool('launch_allowed_app', { appId });
  });

  // Long-term memory
  ipcMain.handle(IPC_CHANNELS.MEMORY_LIST, async (_event, options) => {
    try {
      return await memoryService.list(options || {});
    } catch (err: any) {
      console.error('[IPC] memory-list failed:', err?.message);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.MEMORY_SEARCH, async (_event, payload) => {
    try {
      const query = typeof payload === 'string' ? payload : payload?.query;
      const limit = typeof payload === 'string' ? 8 : payload?.limit;
      return await memoryService.search(query || '', limit || 8);
    } catch (err: any) {
      console.error('[IPC] memory-search failed:', err?.message);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.MEMORY_CREATE, async (_event, input: MemoryInputPayload) => {
    return await memoryService.create(input);
  });

  ipcMain.handle(IPC_CHANNELS.MEMORY_UPDATE, async (_event, payload) => {
    try {
      return await memoryService.update(payload.id, payload.patch || {});
    } catch (err: any) {
      console.error('[IPC] memory-update failed:', err?.message);
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.MEMORY_DELETE, async (_event, id: string) => {
    try {
      return await memoryService.remove(id);
    } catch (err: any) {
      console.error('[IPC] memory-delete failed:', err?.message);
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.MEMORY_STATS, async () => {
    try {
      return await memoryService.getStats();
    } catch {
      return { total: 0, byKind: {}, embedded: 0, databaseBytes: 0 };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_LOAD, async (_event, limit?: number) => {
    try {
      return await memoryService.loadConversation(limit);
    } catch (err: any) {
      console.error('[IPC] conversation-load failed:', err?.message);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_CLEAR, async () => {
    try {
      return await memoryService.clearConversation();
    } catch (err: any) {
      console.error('[IPC] conversation-clear failed:', err?.message);
      return false;
    }
  });

  // Reminders
  ipcMain.handle(IPC_CHANNELS.REMINDERS_LIST, async (_event, includeDone?: boolean) => {
    try {
      return await remindersService.list(Boolean(includeDone));
    } catch (err: any) {
      console.error('[IPC] reminders-list failed:', err?.message);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.REMINDERS_COMPLETE, async (_event, idOrText: string) => {
    try {
      return (await remindersService.complete(idOrText)) || null;
    } catch (err: any) {
      console.error('[IPC] reminders-complete failed:', err?.message);
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.REMINDERS_DELETE, async (_event, idOrText: string) => {
    try {
      return await remindersService.remove(idOrText);
    } catch (err: any) {
      console.error('[IPC] reminders-delete failed:', err?.message);
      return false;
    }
  });

  // Push backend events to the renderer (reminders, dashboard output).
  remindersService.on('changed', async () => {
    const reminders = await remindersService.list(false);
    getMainWindow()?.webContents.send(IPC_CHANNELS.REMINDERS_CHANGED, reminders);
  });

  remindersService.on('fired', (reminder) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.REMINDER_FIRED, reminder);
  });

  dashboardBus.on('artifact', (artifact) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.DASHBOARD_ARTIFACT, artifact);
  });

  // Grow the window when the dashboard is shown, shrink back when it closes.
  ipcMain.on(IPC_CHANNELS.DASHBOARD_SET_OPEN, (_event, open: boolean) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;

    const [width, height] = win.getSize();

    if (open) {
      win.setMinimumSize(820, 640);
      if (width < 1040) win.setSize(1040, Math.max(height, 720), true);
    } else {
      win.setMinimumSize(400, 640);
      win.setSize(460, Math.max(height, 640), true);
    }
  });

  // Window control
  ipcMain.on(IPC_CHANNELS.MINIMIZE_WINDOW, () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.minimize();
    }
  });

  ipcMain.on(IPC_CHANNELS.CLOSE_WINDOW, () => {
    console.error('[IPC] Renderer requested window close.');
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });
}

