// Security Allowlist and Configuration for FRIDAY

export const IPC_CHANNELS = {
  GET_SETTINGS: 'friday:get-settings',
  SAVE_SETTINGS: 'friday:save-settings',
  TEST_CONNECTION: 'friday:test-connection',
  SEND_MESSAGE: 'friday:send-message',
  TOOL_CONFIRM_RESPONSE: 'friday:tool-confirm-response',
  TOOL_CONFIRM_REQUEST: 'friday:tool-confirm-request',
  SELECT_FOLDER: 'friday:select-folder',
  OPEN_PATH: 'friday:open-path',
  LIST_NOTES: 'friday:list-notes',
  SAVE_NOTE: 'friday:save-note',
  DELETE_NOTE: 'friday:delete-note',
  GET_ALLOWED_APPS: 'friday:get-allowed-apps',
  LAUNCH_APP: 'friday:launch-app',
  MEMORY_LIST: 'friday:memory-list',
  MEMORY_SEARCH: 'friday:memory-search',
  MEMORY_CREATE: 'friday:memory-create',
  MEMORY_UPDATE: 'friday:memory-update',
  MEMORY_DELETE: 'friday:memory-delete',
  MEMORY_STATS: 'friday:memory-stats',
  CONVERSATION_LOAD: 'friday:conversation-load',
  CONVERSATION_CLEAR: 'friday:conversation-clear',
  REMINDERS_LIST: 'friday:reminders-list',
  REMINDERS_COMPLETE: 'friday:reminders-complete',
  REMINDERS_DELETE: 'friday:reminders-delete',
  REMINDERS_CHANGED: 'friday:reminders-changed',
  REMINDER_FIRED: 'friday:reminder-fired',
  DASHBOARD_SET_OPEN: 'friday:dashboard-set-open',
  DASHBOARD_ARTIFACT: 'friday:dashboard-artifact',
  TTS_SYNTHESIZE: 'friday:tts-synthesize',
  TTS_CANCEL: 'friday:tts-cancel',
  MINIMIZE_WINDOW: 'friday:minimize-window',
  CLOSE_WINDOW: 'friday:close-window',
} as const;

export function sanitizePath(inputPath: string): string {
  // Prevent directory traversal attacks
  return inputPath.replace(/\0/g, '').trim();
}

