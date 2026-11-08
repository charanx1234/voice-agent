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
  getMainVisibility: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_MAIN_VISIBILITY),
  onMainVisibilityChanged: (callback: (visible: boolean) => void) => {
    const handler = (_event: any, visible: boolean) => callback(visible);
    ipcRenderer.on(IPC_CHANNELS.MAIN_VISIBILITY_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MAIN_VISIBILITY_CHANGED, handler);
  },
};

contextBridge.exposeInMainWorld('fridayAPI', apiBridge);
