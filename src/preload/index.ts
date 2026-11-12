import { contextBridge, ipcRenderer } from 'electron';
import {
  DashboardArtifact,
  FridayApiBridge,
  ReminderItem,
  SystemHealthSnapshot,
  TaskItem,
  SpeechSynthesisRequest,
  ToolConfirmationPayload,
  ResponseStreamEvent,
  ElevenLabsUsage,
  PetCompanionState,
  ChatMessage,
} from '../shared/types';
import { IPC_CHANNELS } from '../main/security';

const confirmationCallbacks = new Map<string, (confirmed: boolean) => void>();

const apiBridge: FridayApiBridge = {
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  saveSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),
  testGeminiConnection: (keyOverride) =>
    ipcRenderer.invoke(IPC_CHANNELS.TEST_CONNECTION, keyOverride),
  getAudioDevices: async () => {
    return navigator.mediaDevices.enumerateDevices();
  },
  copyText: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_WRITE, text),

  sendMessage: (payload) => ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, payload),
  cancelResponse: (requestId?: string) => ipcRenderer.send(IPC_CHANNELS.CANCEL_RESPONSE, requestId),
  onResponseStream: (callback: (event: ResponseStreamEvent) => void) => {
    const handler = (_event: any, payload: ResponseStreamEvent) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.RESPONSE_STREAM, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RESPONSE_STREAM, handler);
  },

  respondToolConfirmation: (id: string, confirmed: boolean) => {
    ipcRenderer.send(IPC_CHANNELS.TOOL_CONFIRM_RESPONSE, { id, confirmed });
  },

  onToolConfirmationRequired: (callback: (payload: ToolConfirmationPayload) => void) => {
    const handler = (_event: any, payload: ToolConfirmationPayload) => {
      callback(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.TOOL_CONFIRM_REQUEST, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TOOL_CONFIRM_REQUEST, handler);
    };
  },

  selectApprovedFolder: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_FOLDER),
  openPathInExplorer: (targetPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_PATH, targetPath),

  listNotes: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_NOTES),
  saveNote: (title: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_NOTE, { title, content }),
  deleteNote: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_NOTE, id),

  getAllowedApps: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ALLOWED_APPS),
  launchApp: (appId: string) => ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_APP, appId),

  // Long-term memory
  listMemories: (options) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_LIST, options),
  searchMemories: (query: string, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_SEARCH, { query, limit }),
  createMemory: (input) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CREATE, input),
  updateMemory: (id: string, patch) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_UPDATE, { id, patch }),
  deleteMemory: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DELETE, id),
  getMemoryStats: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_STATS),
  loadConversation: (limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LOAD, limit),
  clearConversation: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_CLEAR),

  // Reminders
  listReminders: (includeDone?: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.REMINDERS_LIST, includeDone),
  completeReminder: (idOrText: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.REMINDERS_COMPLETE, idOrText),
  deleteReminder: (idOrText: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.REMINDERS_DELETE, idOrText),
  onReminderFired: (callback: (reminder: ReminderItem) => void) => {
    const handler = (_event: any, reminder: ReminderItem) => callback(reminder);
    ipcRenderer.on(IPC_CHANNELS.REMINDER_FIRED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.REMINDER_FIRED, handler);
  },
  onRemindersChanged: (callback: (reminders: ReminderItem[]) => void) => {
    const handler = (_event: any, reminders: ReminderItem[]) => callback(reminders);
    ipcRenderer.on(IPC_CHANNELS.REMINDERS_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.REMINDERS_CHANGED, handler);
  },

  // Dashboard
  setDashboardOpen: (open: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.DASHBOARD_SET_OPEN, open),
  onDashboardArtifact: (callback: (artifact: DashboardArtifact) => void) => {
    const handler = (_event: any, artifact: DashboardArtifact) => callback(artifact);
    ipcRenderer.on(IPC_CHANNELS.DASHBOARD_ARTIFACT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DASHBOARD_ARTIFACT, handler);
  },

  // Neural speech output
  synthesizeSpeech: (request: SpeechSynthesisRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.TTS_SYNTHESIZE, request),
  getElevenLabsUsage: (): Promise<ElevenLabsUsage> =>
    ipcRenderer.invoke(IPC_CHANNELS.ELEVENLABS_USAGE),
  cancelSpeech: () => ipcRenderer.send(IPC_CHANNELS.TTS_CANCEL),

  // Tasks
  listTasks: (includeDone?: boolean) => ipcRenderer.invoke(IPC_CHANNELS.TASKS_LIST, includeDone),
  completeTask: (idOrText: string) => ipcRenderer.invoke(IPC_CHANNELS.TASKS_COMPLETE, idOrText),
  onTasksChanged: (callback: (tasks: TaskItem[]) => void) => {
    const handler = (_event: any, tasks: TaskItem[]) => callback(tasks);
    ipcRenderer.on(IPC_CHANNELS.TASKS_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TASKS_CHANGED, handler);
  },

  // System health
  getSystemHealth: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_HEALTH_GET),
  onSystemHealth: (callback: (health: SystemHealthSnapshot) => void) => {
    const handler = (_event: any, health: SystemHealthSnapshot) => callback(health);
    ipcRenderer.on(IPC_CHANNELS.SYSTEM_HEALTH_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SYSTEM_HEALTH_UPDATE, handler);
  },

  // Diagnostics
  openLogsFolder: () => ipcRenderer.invoke(IPC_CHANNELS.LOGS_OPEN_FOLDER),
  readLogs: (limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.LOGS_READ, limit),
  getResourceUsage: () => ipcRenderer.invoke(IPC_CHANNELS.RESOURCE_USAGE_GET),

  // Hands-free standby / wake word
  transcribeUtterance: (audioBase64: string, audioMimeType?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIBE_UTTERANCE, audioBase64, audioMimeType),
  transcribeSpeech: (audioBase64: string, audioMimeType?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIBE_SPEECH, audioBase64, audioMimeType),
  appExit: () => ipcRenderer.send(IPC_CHANNELS.APP_EXIT),
  onStandbyRequested: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.STANDBY_REQUESTED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STANDBY_REQUESTED, handler);
  },

  // Website Accessibility Assistant
  accessibilityGetState: () => ipcRenderer.invoke(IPC_CHANNELS.ACCESSIBILITY_GET_STATE),
  accessibilitySetEnabled: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACCESSIBILITY_SET_ENABLED, enabled),
  accessibilityOpenUrl: (url: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACCESSIBILITY_OPEN_URL, url),
  accessibilityExecuteCommand: (command: string, args?: Record<string, any>) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACCESSIBILITY_EXECUTE_COMMAND, { command, ...args }),
  accessibilitySetReadingSpeed: (speed: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.ACCESSIBILITY_SET_READING_SPEED, speed),
  accessibilityStopReading: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ACCESSIBILITY_STOP_READING),
  onAccessibilityStateChanged: (callback: (state: any) => void) => {
    const handler = (_event: any, state: any) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.ACCESSIBILITY_STATE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ACCESSIBILITY_STATE_CHANGED, handler);
  },

  // Floating Desktop Pet
  petShowMain: () => ipcRenderer.send(IPC_CHANNELS.PET_SHOW_MAIN),
  petToggleMain: () => ipcRenderer.send(IPC_CHANNELS.PET_TOGGLE_MAIN),
  petOpenContextMenu: () => ipcRenderer.send(IPC_CHANNELS.PET_CONTEXT_MENU),
  petGetState: (): Promise<PetCompanionState> => ipcRenderer.invoke(IPC_CHANNELS.PET_GET_STATE),
  onPetStateChanged: (callback: (state: PetCompanionState) => void) => {
    const handler = (_event: any, state: PetCompanionState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.PET_STATE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PET_STATE_CHANGED, handler);
  },
  petQuit: () => ipcRenderer.send(IPC_CHANNELS.PET_QUIT),
  setDesktopPetEnabled: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_SET_ENABLED, enabled),
  updatePetState: (state: Partial<PetCompanionState>) =>
    ipcRenderer.send(IPC_CHANNELS.PET_STATE_CHANGED, state),
  petSetExpanded: (expanded: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_SET_EXPANDED, expanded),
  petGetExpanded: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PET_GET_EXPANDED),

  // Shared Capabilities Registry
  listCapabilities: () => ipcRenderer.invoke(IPC_CHANNELS.CAPABILITIES_LIST),
  executeCapability: (id: string, params?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.CAPABILITIES_EXECUTE, { id, params }),

  // Modular AI Providers
  getAiProviders: () => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_GET_STATUS),
  setAiProvider: (provider, fallback) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_SET_ACTIVE, { provider, fallback }),
  saveProviderConfig: (id, config) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_SAVE_CONFIG, { id, config }),
  testProviderConnection: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_TEST_CONNECTION, id),

  // Screen Understanding & Desktop Control
  captureScreen: (options) => ipcRenderer.invoke(IPC_CHANNELS.SCREEN_CAPTURE, options),
  getActiveWindow: () => ipcRenderer.invoke(IPC_CHANNELS.SCREEN_GET_ACTIVE_WINDOW),
  executeDesktopAction: (action, args) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCREEN_EXECUTE_ACTION, { action, args }),
  onScreenAnalysisState: (callback: (active: boolean) => void) => {
    const handler = (_event: any, active: boolean) => callback(active);
    ipcRenderer.on(IPC_CHANNELS.SCREEN_ANALYSIS_ACTIVE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCREEN_ANALYSIS_ACTIVE, handler);
  },

  // Window-to-Window Conversation Synchronization
  broadcastChatMessage: (message: ChatMessage) =>
    ipcRenderer.send(IPC_CHANNELS.CHAT_BROADCAST_MESSAGE, message),
  onChatMessageBroadcast: (callback: (message: ChatMessage) => void) => {
    const handler = (_event: any, message: ChatMessage) => callback(message);
    ipcRenderer.on(IPC_CHANNELS.CHAT_BROADCAST_MESSAGE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_BROADCAST_MESSAGE, handler);
  },

  // Centralized Voice Session & Audio Pipeline
  voiceTriggerMic: () => ipcRenderer.send(IPC_CHANNELS.VOICE_TRIGGER_MIC),
  voiceInterrupt: () => ipcRenderer.send(IPC_CHANNELS.VOICE_INTERRUPT),
  onVoiceTriggerMic: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.VOICE_TRIGGER_MIC, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.VOICE_TRIGGER_MIC, handler);
  },
  onVoiceInterrupt: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.VOICE_INTERRUPT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.VOICE_INTERRUPT, handler);
  },
  updateVoiceLevel: (level: number) => ipcRenderer.send(IPC_CHANNELS.VOICE_LEVEL_UPDATE, level),
  updateVoiceMouth: (data: any) => ipcRenderer.send(IPC_CHANNELS.VOICE_MOUTH_UPDATE, data),
  updateVoiceState: (payload: any) => ipcRenderer.send(IPC_CHANNELS.VOICE_STATE_CHANGED, payload),
  onVoiceStateChanged: (callback: (state: any) => void) => {
    const handler = (_event: any, state: any) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.VOICE_STATE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.VOICE_STATE_CHANGED, handler);
  },
  onVoiceLevelUpdate: (callback: (level: number) => void) => {
    const handler = (_event: any, level: number) => callback(level);
    ipcRenderer.on(IPC_CHANNELS.VOICE_LEVEL_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.VOICE_LEVEL_UPDATE, handler);
  },
  onVoiceMouthUpdate: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.VOICE_MOUTH_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.VOICE_MOUTH_UPDATE, handler);
  },
  enrollSpeakerVoice: (profile: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.VOICE_SPEAKER_ENROLL, profile),
  clearSpeakerProfile: () => ipcRenderer.invoke(IPC_CHANNELS.VOICE_SPEAKER_CLEAR),
  testAudioPipeline: (durationMs?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.VOICE_TEST_MIC, durationMs),

  minimizeWindow: () => ipcRenderer.send(IPC_CHANNELS.MINIMIZE_WINDOW),
  closeWindow: () => ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW),
  onSettingsUpdated: (cb: (settings: any) => void) => {
    const listener = (_: any, s: any) => cb(s);
    ipcRenderer.on('friday:settings-updated', listener);
    return () => ipcRenderer.removeListener('friday:settings-updated', listener);
  },
  getMainVisibility: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_MAIN_VISIBILITY),
  onMainVisibilityChanged: (callback: (visible: boolean) => void) => {
    const handler = (_event: any, visible: boolean) => callback(visible);
    ipcRenderer.on(IPC_CHANNELS.MAIN_VISIBILITY_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MAIN_VISIBILITY_CHANGED, handler);
  },

  // QuickTools Phase 1
  quickToolsGetDesktopPreview: () => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_GET_DESKTOP_PREVIEW),
  quickToolsGetDownloadsPreview: () => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_GET_DOWNLOADS_PREVIEW),
  quickToolsGetFolderPreview: (folderPath: string) => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_GET_FOLDER_PREVIEW, folderPath),
  quickToolsExecuteOrganize: (preview: any) => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_EXECUTE_ORGANIZE, preview),
  quickToolsUndoLastOrganize: () => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_UNDO_ORGANIZE),
  quickToolsFindDuplicates: (folderPath?: string) => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_FIND_DUPLICATES, folderPath),
  quickToolsGetClipboardHistory: () => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_CLIPBOARD_LIST),
  quickToolsTogglePinClipboard: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_CLIPBOARD_TOGGLE_PIN, id),
  quickToolsDeleteClipboard: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_CLIPBOARD_DELETE, id),
  quickToolsClearClipboard: () => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_CLIPBOARD_CLEAR),
  quickToolsCopyClipboardItem: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_CLIPBOARD_WRITE, text),
  quickToolsGetSnippets: () => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_SNIPPETS_LIST),
  quickToolsSaveSnippet: (snippet: any) => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_SNIPPETS_SAVE, snippet),
  quickToolsDeleteSnippet: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_SNIPPETS_DELETE, id),
  quickToolsExpandSnippet: (shortcutOrId: string, placeholders?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_SNIPPETS_EXPAND, { shortcutOrId, placeholders }),

  // QuickTools Phase 2: Desktop Management
  quickToolsListWindows: () => ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_WINDOWS_LIST),
  quickToolsApplyWindowLayout: (action: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_WINDOWS_LAYOUT, action),
  quickToolsListNotes: (category?: string, query?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_NOTES_LIST, category, query),
  quickToolsSaveNote: (note: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_NOTES_SAVE, note),
  quickToolsDeleteNote: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_NOTES_DELETE, id),
  quickToolsTogglePinNote: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_NOTES_PIN, id),
  quickToolsPreviewRename: (rule: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_RENAME_PREVIEW, rule),
  quickToolsExecuteRename: (preview: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_RENAME_EXECUTE, preview),
  quickToolsUndoRename: () =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_RENAME_UNDO),

  // QuickTools Phase 3: File Intelligence
  quickToolsSearchFiles: (criteria: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_FILES_SEARCH, criteria),
  quickToolsListWorkspaces: () =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_WORKSPACES_LIST),
  quickToolsSaveWorkspace: (workspace: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_WORKSPACES_SAVE, workspace),
  quickToolsLaunchWorkspace: (idOrName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_WORKSPACES_LAUNCH, idOrName),
  quickToolsDeleteWorkspace: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.QUICKTOOLS_WORKSPACES_DELETE, id),

  // FRIDAY VoiceFlow
  voiceFlowGetStatus: () => ipcRenderer.invoke(IPC_CHANNELS.VOICEFLOW_GET_STATUS),
  voiceFlowTranscribe: (audioBase64: string, language?: string, model?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.VOICEFLOW_TRANSCRIBE, audioBase64, language, model),
  voiceFlowEnhance: (rawText: string, mode?: string, options?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.VOICEFLOW_ENHANCE_AND_INSERT, rawText, mode, options),
  voiceFlowCaptureTarget: () => ipcRenderer.invoke(IPC_CHANNELS.VOICEFLOW_CAPTURE_TARGET),
  voiceFlowInsertText: (text: string, target?: any, options?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.VOICEFLOW_INSERT_TEXT, text, target, options),
  voiceFlowEnhanceAndInsert: (rawText: string, mode?: string, target?: any, options?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.VOICEFLOW_ENHANCE_AND_INSERT, rawText, mode, target, options),
  voiceflowTranscribe: (audioBase64: string, language?: string, model?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.VOICEFLOW_TRANSCRIBE, audioBase64, language, model),
  voiceflowEnhanceAndInsert: (rawText: string, mode?: string, target?: any, options?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.VOICEFLOW_ENHANCE_AND_INSERT, rawText, mode, target, options),
  voiceflowCaptureTarget: () => ipcRenderer.invoke(IPC_CHANNELS.VOICEFLOW_CAPTURE_TARGET),
  voiceflowInsertText: (text: string, target?: any, options?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.VOICEFLOW_INSERT_TEXT, text, target, options),
  onVoiceFlowTriggerShortcut: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.VOICEFLOW_TRIGGER_SHORTCUT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.VOICEFLOW_TRIGGER_SHORTCUT, handler);
  },

  // FRIDAY TypeFlow Bridge
  typeFlowTypeClipboard: (config?: any) => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_TYPE_CLIPBOARD, config),
  typeFlowReadSelection: () => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_READ_SELECTION),
  typeFlowExplainSelection: (instruction?: string) => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_EXPLAIN_SELECTION, instruction),
  typeFlowTypeText: (text: string, config?: any) => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_TYPE_TEXT, text, config),
  typeFlowPause: () => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_PAUSE),
  typeFlowResume: () => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_RESUME),
  typeFlowCancel: () => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_CANCEL),
  typeFlowGetState: () => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_GET_STATE),
  typeFlowGetTemplates: () => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_GET_TEMPLATES),
  typeFlowSaveTemplate: (template: any) => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_SAVE_TEMPLATE, template),
  typeFlowDeleteTemplate: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_DELETE_TEMPLATE, id),
  typeFlowGetHistory: () => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_GET_HISTORY),
  typeFlowClearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.TYPEFLOW_CLEAR_HISTORY),
  onTypeFlowProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.TYPEFLOW_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TYPEFLOW_PROGRESS, handler);
  },
  onTypeFlowShortcut: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.TYPEFLOW_TYPE_CLIPBOARD, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TYPEFLOW_TYPE_CLIPBOARD, handler);
  },
};

contextBridge.exposeInMainWorld('fridayAPI', apiBridge);
