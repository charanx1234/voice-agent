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

  // Hands-free standby / wake word
  transcribeUtterance: (audioBase64: string, audioMimeType?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIBE_UTTERANCE, audioBase64, audioMimeType),
  onStandbyRequested: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.STANDBY_REQUESTED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STANDBY_REQUESTED, handler);
  },

  minimizeWindow: () => ipcRenderer.send(IPC_CHANNELS.MINIMIZE_WINDOW),
  closeWindow: () => ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW),
};

contextBridge.exposeInMainWorld('fridayAPI', apiBridge);
