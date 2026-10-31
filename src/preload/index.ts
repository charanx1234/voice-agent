import { contextBridge, ipcRenderer } from 'electron';
import { FridayApiBridge, ToolConfirmationPayload } from '../shared/types';
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

  sendMessage: (payload) => ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, payload),

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

  minimizeWindow: () => ipcRenderer.send(IPC_CHANNELS.MINIMIZE_WINDOW),
  closeWindow: () => ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW),
};

contextBridge.exposeInMainWorld('fridayAPI', apiBridge);

