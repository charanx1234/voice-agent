import { ipcMain, dialog, shell, BrowserWindow, clipboard, Menu, app, screen } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS } from './security';
import { settingsStore } from '../services/storage/settingsStore';
import { notesStore } from '../services/storage/notesStore';
import { geminiService } from '../services/ai/gemini';
import { toolRegistry } from '../services/agent/toolRegistry';
import { memoryService } from '../services/memory/memoryService';
import { remindersService } from '../services/reminders/remindersService';
import { dashboardBus } from '../services/dashboard/dashboardTool';
import { neuralVoiceService } from '../services/voice/neuralVoice';
import { systemHealthService } from '../services/system/healthService';
import { getLogDirectory, readRecentLogLines } from './backend/logger';
import { ALLOWED_APPLICATIONS, executeAppShortcutsTool } from '../services/agent/appShortcutsTool';
import { standbyEmitter } from '../services/agent/toolRegistry';
import { websiteAccessibilityService } from '../services/accessibility/websiteAccessibilityService';
import { providerManager } from '../services/ai/providers/providerManager';
import { screenUnderstandingService } from '../services/screen/screenUnderstandingService';
import { desktopControlService } from '../services/desktop/desktopControlService';
import { executeScreenControlTool } from '../services/agent/screenControlTools';
import { AiProviderId, ChatMessage, MemoryInputPayload, PetCompanionState, SpeechSynthesisRequest, ToolConfirmationPayload } from '../shared/types';
import { VoiceCoordinator } from './voiceCoordinator';
import { capabilityRegistry } from '../services/capabilities/capabilityRegistry';

let handlersRegistered = false;

/** Safely sends an IPC event only if the window and webContents exist and are not destroyed. */
function safeSend(win: BrowserWindow | null | undefined, channel: string, ...args: any[]): boolean {
  try {
    if (!win || win.isDestroyed()) return false;
    const wc = win.webContents;
    if (!wc || wc.isDestroyed()) return false;
    wc.send(channel, ...args);
    return true;
  } catch {
    return false;
  }
}

let cachedPetState: PetCompanionState = {
  robotState: 'idle',
  amplitude: 0,
  expression: 'neutral',
  mood: 'calm',
  soundMuted: false,
  handsFreeEnabled: true,
  isSpeaking: false,
};

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  getPetWindow?: () => BrowserWindow | null
): void {
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
      safeSend(getMainWindow(), IPC_CHANNELS.TOOL_CONFIRM_REQUEST, payload);

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

  // Use Electron's native clipboard in the packaged app. The text is never
  // logged or persisted; the renderer receives only a success/error result.
  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_WRITE, async (_event, text: unknown) => {
    try {
      if (typeof text !== 'string') {
        return { success: false, error: 'Only text can be copied.' };
      }
      clipboard.writeText(text);
      return { success: true };
    } catch {
      return { success: false, error: 'Clipboard access is unavailable.' };
    }
  });

  // Chat / Voice message
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, payload) => {
    return await providerManager.generate(payload, (event) => {
      if (!payload?.requestId) return;
      try {
        if (_event.sender && !_event.sender.isDestroyed()) {
          _event.sender.send(IPC_CHANNELS.RESPONSE_STREAM, {
            ...event,
            requestId: payload.requestId,
          });
        }
      } catch {
        // Window closed or sender destroyed during streaming
      }
    });
  });

  ipcMain.on(IPC_CHANNELS.CANCEL_RESPONSE, (_event, requestId?: string) => {
    geminiService.cancelRequest(requestId);
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
      if (targetPath && isApprovedProjectPath(targetPath)) {
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
    safeSend(getMainWindow(), IPC_CHANNELS.REMINDERS_CHANGED, reminders);
  });

  remindersService.on('fired', (reminder) => {
    safeSend(getMainWindow(), IPC_CHANNELS.REMINDER_FIRED, reminder);
  });

  remindersService.on('tasks-changed', async () => {
    const tasks = await remindersService.listTasks(false);
    safeSend(getMainWindow(), IPC_CHANNELS.TASKS_CHANGED, tasks);
  });

  systemHealthService.onSample((health) => {
    safeSend(getMainWindow(), IPC_CHANNELS.SYSTEM_HEALTH_UPDATE, health);
  });

  dashboardBus.on('artifact', (artifact) => {
    safeSend(getMainWindow(), IPC_CHANNELS.DASHBOARD_ARTIFACT, artifact);
  });

  // Hands-free: the model asks to go to standby (user said "go offline").
  standbyEmitter.on('standby-requested', () => {
    safeSend(getMainWindow(), IPC_CHANNELS.STANDBY_REQUESTED);
  });

  // Hands-free: wake-word gate transcription for standby listening.
  ipcMain.handle(
    IPC_CHANNELS.TRANSCRIBE_UTTERANCE,
    async (_event, audioBase64: string, audioMimeType?: string) => {
      try {
        const reply = await geminiService.transcribeUtterance(audioBase64, audioMimeType);
        return { success: true, reply };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Transcription failed.' };
      }
    }
  );

  // Live microphone speech transcription (verbatim user query)
  ipcMain.handle(
    IPC_CHANNELS.TRANSCRIBE_SPEECH,
    async (_event, audioBase64: string, audioMimeType?: string) => {
      try {
        const text = await geminiService.transcribeAudio(audioBase64, audioMimeType);
        return { success: true, text };
      } catch (err: any) {
        console.error('[FRIDAY IPC] Speech transcription failed:', err?.message || err);
        return { success: false, error: err?.message || 'Speech transcription failed.', text: '' };
      }
    }
  );

  // Explicit quit application completely
  ipcMain.on(IPC_CHANNELS.APP_EXIT, () => {
    console.log('[FRIDAY IPC] User requested application exit.');
    app.quit();
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

  // Neural speech synthesis (Edge, then Gemini fallback)
  ipcMain.handle(IPC_CHANNELS.TTS_SYNTHESIZE, async (_event, request: SpeechSynthesisRequest) => {
    return await neuralVoiceService.synthesize(request || { text: '' });
  });

  ipcMain.handle(IPC_CHANNELS.ELEVENLABS_USAGE, async () => {
    return await neuralVoiceService.getUsage(true);
  });

  ipcMain.on(IPC_CHANNELS.TTS_CANCEL, () => {
    neuralVoiceService.cancelAll();
  });

  // Tasks
  ipcMain.handle(IPC_CHANNELS.TASKS_LIST, async (_event, includeDone?: boolean) => {
    try {
      return await remindersService.listTasks(Boolean(includeDone));
    } catch (err: any) {
      console.error('[IPC] tasks-list failed:', err?.message);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASKS_COMPLETE, async (_event, idOrText: string) => {
    try {
      return (await remindersService.completeTask(idOrText)) || null;
    } catch (err: any) {
      console.error('[IPC] tasks-complete failed:', err?.message);
      return null;
    }
  });

  // System health
  ipcMain.handle(IPC_CHANNELS.SYSTEM_HEALTH_GET, async () => {
    try {
      return await systemHealthService.read();
    } catch (err: any) {
      console.error('[IPC] system-health failed:', err?.message);
      return null;
    }
  });

  // Log access for debugging without a terminal
  ipcMain.handle(IPC_CHANNELS.LOGS_OPEN_FOLDER, async () => {
    try {
      await shell.openPath(getLogDirectory());
      return true;
    } catch (err: any) {
      console.error('[IPC] Could not open log folder:', err?.message);
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LOGS_READ, async (_event, limit?: number) => {
    try {
      return readRecentLogLines(limit || 200);
    } catch {
      return [];
    }
  });

  // Website Accessibility Assistant
  websiteAccessibilityService.on('state-changed', (state) => {
    safeSend(getMainWindow(), IPC_CHANNELS.ACCESSIBILITY_STATE_CHANGED, state);
  });

  ipcMain.handle(IPC_CHANNELS.ACCESSIBILITY_GET_STATE, async () => {
    return websiteAccessibilityService.getState();
  });

  ipcMain.handle(IPC_CHANNELS.ACCESSIBILITY_SET_ENABLED, async (_event, enabled: boolean) => {
    return await websiteAccessibilityService.setEnabled(Boolean(enabled));
  });

  ipcMain.handle(IPC_CHANNELS.ACCESSIBILITY_OPEN_URL, async (_event, url: string) => {
    return await websiteAccessibilityService.openUrl(String(url || ''));
  });

  ipcMain.handle(
    IPC_CHANNELS.ACCESSIBILITY_EXECUTE_COMMAND,
    async (_event, payload: { command: string; language?: string } | string) => {
      const command = typeof payload === 'string' ? payload : payload?.command || '';
      const language = typeof payload === 'string' ? undefined : payload?.language;
      return await websiteAccessibilityService.executeNaturalCommand(command, language);
    }
  );

  ipcMain.handle(IPC_CHANNELS.ACCESSIBILITY_SET_READING_SPEED, async (_event, speed: number) => {
    return websiteAccessibilityService.setReadingSpeed(Number(speed) || 1.0);
  });

  ipcMain.handle(IPC_CHANNELS.ACCESSIBILITY_STOP_READING, async () => {
    return websiteAccessibilityService.stopReading();
  });

  // Window control
  ipcMain.on(IPC_CHANNELS.MINIMIZE_WINDOW, () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.minimize();
    }
  });

  ipcMain.on(IPC_CHANNELS.CLOSE_WINDOW, () => {
    console.log('[IPC] Renderer requested window close.');
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  // Floating Desktop Pet Companion Handlers
  ipcMain.on(IPC_CHANNELS.PET_SHOW_MAIN, () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  ipcMain.on(IPC_CHANNELS.PET_TOGGLE_MAIN, () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isVisible() && !win.isMinimized()) {
        win.hide();
      } else {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    }
  });

  ipcMain.on(IPC_CHANNELS.PET_CONTEXT_MENU, () => {
    const petWin = getPetWindow ? getPetWindow() : null;
    const current = settingsStore.getSettings();
    const menu = Menu.buildFromTemplate([
      {
        label: 'Open FRIDAY',
        click: () => {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
          }
        },
      },
      {
        label: current.soundMuted ? 'Unmute Sound' : 'Mute Sound',
        click: () => {
          const updated = !settingsStore.getSettings().soundMuted;
          settingsStore.saveSettings({ soundMuted: updated });
          cachedPetState.soundMuted = updated;
          safeSend(getMainWindow(), IPC_CHANNELS.PET_STATE_CHANGED, cachedPetState);
          safeSend(petWin, IPC_CHANNELS.PET_STATE_CHANGED, cachedPetState);
        },
      },
      {
        label: 'Reset Pet Position',
        click: () => {
          if (petWin && !petWin.isDestroyed()) {
            const primaryDisplay = screen.getPrimaryDisplay();
            const { workArea } = primaryDisplay;
            const x = Math.round(workArea.x + workArea.width - 240);
            const y = Math.round(workArea.y + workArea.height - 280);
            petWin.setPosition(x, y);
            settingsStore.saveSettings({ petPosition: { x, y } });
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Exit FRIDAY',
        click: () => {
          app.quit();
        },
      },
    ]);

    if (petWin && !petWin.isDestroyed()) {
      menu.popup({ window: petWin });
    }
  });

  ipcMain.handle(IPC_CHANNELS.PET_GET_STATE, async () => {
    return cachedPetState;
  });

  ipcMain.on(IPC_CHANNELS.PET_STATE_CHANGED, (_event, state: Partial<PetCompanionState>) => {
    cachedPetState = { ...cachedPetState, ...state };
    const petWin = getPetWindow ? getPetWindow() : null;
    safeSend(petWin, IPC_CHANNELS.PET_STATE_CHANGED, cachedPetState);
  });

  ipcMain.on(IPC_CHANNELS.PET_QUIT, () => {
    console.log('[IPC] Pet requested full app quit.');
    app.quit();
  });

  let isPetExpanded = false;

  ipcMain.handle(IPC_CHANNELS.PET_SET_EXPANDED, async (_event, expand: boolean) => {
    const val = Boolean(expand);
    isPetExpanded = val;
    const petWin = getPetWindow ? getPetWindow() : null;
    if (petWin && !petWin.isDestroyed()) {
      const bounds = petWin.getBounds();
      const targetW = val ? 380 : 200;
      const targetH = val ? 580 : 220;
      
      let newX = bounds.x - (targetW - bounds.width);
      let newY = bounds.y - (targetH - bounds.height);

      const display = screen.getDisplayMatching(bounds);
      const { workArea } = display;

      if (newX < workArea.x) newX = workArea.x;
      if (newY < workArea.y) newY = workArea.y;
      if (newX + targetW > workArea.x + workArea.width) {
        newX = workArea.x + workArea.width - targetW;
      }
      if (newY + targetH > workArea.y + workArea.height) {
        newY = workArea.y + workArea.height - targetH;
      }

      petWin.setBounds({
        x: Math.round(newX),
        y: Math.round(newY),
        width: targetW,
        height: targetH,
      });
    }
    return val;
  });

  ipcMain.handle(IPC_CHANNELS.PET_GET_EXPANDED, async () => {
    return isPetExpanded;
  });

  // Shared Capabilities
  ipcMain.handle(IPC_CHANNELS.CAPABILITIES_LIST, async () => {
    return capabilityRegistry.listPetCapabilities();
  });

  ipcMain.handle(
    IPC_CHANNELS.CAPABILITIES_EXECUTE,
    async (_event, payload: { id: string; params?: any }) => {
      try {
        return await capabilityRegistry.execute(payload.id, payload.params);
      } catch (err: any) {
        return { error: err.message };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.PET_SET_ENABLED, async (_event, enabled: boolean) => {
    const val = Boolean(enabled);
    settingsStore.saveSettings({ desktopPetEnabled: val });
    const petWin = getPetWindow ? getPetWindow() : null;
    if (petWin && !petWin.isDestroyed()) {
      if (val) {
        petWin.show();
      } else {
        petWin.hide();
      }
    }
    return val;
  });

  // Modular AI Provider Handlers
  ipcMain.handle(IPC_CHANNELS.PROVIDER_GET_STATUS, async () => {
    return providerManager.getStatus();
  });

  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_SET_ACTIVE,
    async (_event, payload: { provider: AiProviderId; fallback?: AiProviderId }) => {
      return providerManager.setActiveProvider(payload.provider, payload.fallback);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_SAVE_CONFIG,
    async (_event, payload: { id: AiProviderId; config: any }) => {
      return providerManager.saveConfig(payload.id, payload.config);
    }
  );

  ipcMain.handle(IPC_CHANNELS.PROVIDER_TEST_CONNECTION, async (_event, id: AiProviderId) => {
    return await providerManager.testConnection(id);
  });

  // Windows Screen Understanding & Desktop Control Handlers
  screenUnderstandingService.on('analysis-state', (active: boolean) => {
    safeSend(getMainWindow(), IPC_CHANNELS.SCREEN_ANALYSIS_ACTIVE, active);
    safeSend(getPetWindow ? getPetWindow() : null, IPC_CHANNELS.SCREEN_ANALYSIS_ACTIVE, active);
  });

  ipcMain.handle(IPC_CHANNELS.SCREEN_CAPTURE, async (_event, options) => {
    return await screenUnderstandingService.captureScreen(options);
  });

  ipcMain.handle(IPC_CHANNELS.SCREEN_GET_ACTIVE_WINDOW, async () => {
    return await screenUnderstandingService.getActiveWindow();
  });

  ipcMain.handle(
    IPC_CHANNELS.SCREEN_EXECUTE_ACTION,
    async (_event, payload: { action: string; args?: Record<string, any> }) => {
      return await executeScreenControlTool(payload.action, payload.args || {});
    }
  );

  // Synchronized Conversation Transcript Broadcast
  ipcMain.on(IPC_CHANNELS.CHAT_BROADCAST_MESSAGE, (_event, message: ChatMessage) => {
    const mainWin = getMainWindow();
    const petWin = getPetWindow ? getPetWindow() : null;
    if (_event.sender !== mainWin?.webContents) {
      safeSend(mainWin, IPC_CHANNELS.CHAT_BROADCAST_MESSAGE, message);
    }
    if (_event.sender !== petWin?.webContents) {
      safeSend(petWin, IPC_CHANNELS.CHAT_BROADCAST_MESSAGE, message);
    }
  });

  // Centralized Voice Coordinator & Single Microphone Ownership
  const voiceCoordinator = new VoiceCoordinator(getMainWindow, () => (getPetWindow ? getPetWindow() : null));

  ipcMain.on(IPC_CHANNELS.VOICE_TRIGGER_MIC, () => {
    voiceCoordinator.handleTriggerMic();
  });

  ipcMain.on(IPC_CHANNELS.VOICE_INTERRUPT, () => {
    voiceCoordinator.handleInterrupt();
  });

  ipcMain.on(IPC_CHANNELS.VOICE_STATE_CHANGED, (_event, payload) => {
    if (!payload?.sessionState) return;
    voiceCoordinator.setState(payload.sessionState, {
      expression: payload.expression,
      mood: payload.mood,
      isSpeaking: payload.isSpeaking,
      isVerifiedSpeaker: payload.isVerifiedSpeaker,
    });
  });

  ipcMain.on(IPC_CHANNELS.VOICE_LEVEL_UPDATE, (_event, level) => {
    voiceCoordinator.updateLevel(Number(level) || 0);
  });

  ipcMain.on(IPC_CHANNELS.VOICE_MOUTH_UPDATE, (_event, payload) => {
    if (payload) {
      voiceCoordinator.updateMouth(payload.mouthOpenness || 0, payload.amplitude || 0, payload.frequencies || []);
    }
  });

  ipcMain.handle(IPC_CHANNELS.VOICE_SPEAKER_ENROLL, async (_event, profile) => {
    try {
      settingsStore.saveSettings({ enrolledVoiceProfile: profile, speakerVerificationEnabled: true });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Could not save speaker profile' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.VOICE_SPEAKER_CLEAR, async () => {
    try {
      settingsStore.saveSettings({ enrolledVoiceProfile: undefined, speakerVerificationEnabled: false });
      return true;
    } catch {
      return false;
    }
  });
}

/** Renderer file-opening is limited to files inside an approved project root. */
function isApprovedProjectPath(targetPath: string): boolean {
  try {
    const settings = settingsStore.getSettings();
    const resolvedTarget = fs.realpathSync.native(path.resolve(targetPath));
    return (settings.approvedFolders || []).some((folder) => {
      try {
        const root = fs.realpathSync.native(folder);
        const relative = path.relative(root, resolvedTarget);
        return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
