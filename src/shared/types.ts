// Shared TypeScript definitions for FRIDAY AI Desktop Companion

export type RobotState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'error';

export type PersonalityMode = 'simple' | 'moderate' | 'roast';

export type ConversationMood =
  | 'calm'
  | 'enthusiastic'
  | 'patient'
  | 'supportive'
  | 'focused'
  | 'playful';

/** Local, uncertain voice/context cues used only to shape presentation. */
export interface VoiceProsodySummary {
  peakLevel: number;
  durationMs: number;
  speechRate?: number;
  pauseRatio?: number;
}

export interface ResponseStreamEvent {
  requestId: string;
  type: 'delta' | 'complete' | 'cancelled' | 'error';
  text?: string;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  language?: string;
  toolCalls?: ToolCallRecord[];
  isVoice?: boolean;
  /** True when the reply is a failure report rather than a real answer. */
  isError?: boolean;
}

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, any>;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'rejected';
}

export interface FridaySettings {
  apiKey: string; // masked in UI, stored safely in AppData
  hasCustomKey: boolean;
  preferredLanguage: string; // e.g. 'te-IN' (Telugu), 'en-IN' (Indian English), 'hi-IN' (Hindi), 'ta-IN', 'kn-IN'
  speechSpeed: number; // 0.8 to 1.5 (default 1.0)
  speechVolume: number; // 0 to 1 (default 1.0)
  /** Pitch offset in semitones (-3 to +3). */
  pitch: number;
  /** Preferred speech engine; 'auto' tries Edge, then Gemini, then the system voice. */
  ttsEngine: 'auto' | 'edge' | 'gemini' | 'system';
  voiceId: string;
  /** Accent used for English speech: American, British or Indian. */
  voiceAccent: 'en-US' | 'en-GB' | 'en-IN';
  /** Chosen neural voice id from the Edge catalogue. */
  ttsVoice: string;
  ttsProvider: 'webspeech' | 'cloud' | 'auto';
  /** 'auto' follows the Windows theme; 'light' and 'dark' are manual overrides. */
  themeMode: 'auto' | 'light' | 'dark';
  approvedFolders: string[];
  requireToolConfirmations: {
    notes: boolean;
    folderSearch: boolean;
    webResearch: boolean;
    launchApps: boolean;
  };
  modelName: string; // 'gemini-3.5-flash-lite', 'gemini-2.5-flash'
  soundMuted: boolean;
  /** Long-term memory: extract facts from conversations and use them in replies. */
  memoryEnabled: boolean;
  /** Presentation personality; intelligence and tools are shared by all modes. */
  personalityMode: PersonalityMode;
  /** Hands-free wake-word listener preference. */
  handsFreeEnabled: boolean;
  /** Silence duration before active hands-free mode returns to standby. */
  handsFreeSilenceTimeoutMs: number;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** Long-term memory categories. */
export type MemoryKind = 'preference' | 'personal' | 'project' | 'fact' | 'instruction';

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  subject: string;
  title: string;
  content: string;
  /** 1 (minor) to 5 (core identity or explicit instruction). */
  importance: number;
  source: 'chat' | 'manual' | 'tool';
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  /** Present on search results. */
  score?: number;
}

export interface MemoryStats {
  total: number;
  byKind: Record<string, number>;
  embedded: number;
  databaseBytes: number;
}

export interface MemoryInputPayload {
  kind: MemoryKind;
  title: string;
  content: string;
  subject?: string;
  importance?: number;
}

/** Reminder created from a spoken or typed request. */
export interface ReminderItem {
  id: string;
  text: string;
  dueAt: string;
  status: 'pending' | 'done' | 'cancelled';
  createdAt: string;
  notifiedAt?: string;
}

export type TaskPriority = 'high' | 'medium' | 'low';

export interface TaskItem {
  id: string;
  text: string;
  priority: TaskPriority;
  dueAt?: string;
  status: 'pending' | 'done';
  createdAt: string;
  completedAt?: string;
}

export interface SystemHealthSnapshot {
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  ramPercent: number;
  batteryPercent: number | null;
  charging: boolean | null;
  diskUsedPercent: number | null;
  diskFreeGb: number | null;
  networkOnline: boolean;
  temperatureC: number | null;
  uptimeHours: number;
  sampledAt: string;
}

/** Visual output FRIDAY sends to the dashboard while voice keeps running. */
export type DashboardArtifactKind = 'code' | 'document' | 'list' | 'table' | 'markdown';

export interface DashboardArtifact {
  id: string;
  title: string;
  kind: DashboardArtifactKind;
  content: string;
  language?: string;
  createdAt: string;
}

export interface SpeechSynthesisRequest {
  text: string;
  language?: string;
  voice?: string;
  accent?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface SpeechSynthesisResult {
  audioBase64: string;
  mimeType: string;
  voice: string;
  engine: 'edge' | 'gemini';
}

export interface SearchMatch {
  filePath: string;
  fileName: string;
  line?: number;
  previewSnippet: string;
}

export interface WebSearchResultItem {
  title: string;
  snippet: string;
  url: string;
}

export interface AllowedApp {
  id: string;
  name: string;
  description: string;
  command: string;
  icon?: string;
}

export interface ToolConfirmationPayload {
  id: string;
  toolName: string;
  description: string;
  details: Record<string, any>;
}

export interface FridayApiBridge {
  // Settings & Status
  getSettings: () => Promise<FridaySettings>;
  saveSettings: (settings: Partial<FridaySettings>) => Promise<{ success: boolean; error?: string }>;
  testGeminiConnection: (keyOverride?: string) => Promise<{ success: boolean; message: string; model?: string }>;
  getAudioDevices: () => Promise<MediaDeviceInfo[]>;
  
  // AI Conversation
  sendMessage: (payload: {
    message: string;
    audioBase64?: string;
    audioMimeType?: string;
    conversationHistory: ChatMessage[];
    language?: string;
    prosody?: VoiceProsodySummary;
    requestId?: string;
  }) => Promise<{
    text: string;
    detectedLanguage?: string;
    toolCalls?: ToolCallRecord[];
    audioBase64?: string;
    mood?: ConversationMood;
    safetyOverride?: boolean;
    error?: string;
    cancelled?: boolean;
  }>;
  cancelResponse: (requestId?: string) => void;
  onResponseStream: (callback: (event: ResponseStreamEvent) => void) => () => void;

  // Tool Confirmations
  respondToolConfirmation: (id: string, confirmed: boolean) => void;
  onToolConfirmationRequired: (callback: (payload: ToolConfirmationPayload) => void) => () => void;

  // Folder selection
  selectApprovedFolder: () => Promise<string | null>;
  openPathInExplorer: (targetPath: string) => Promise<boolean>;

  // Notes
  listNotes: () => Promise<NoteItem[]>;
  saveNote: (title: string, content: string) => Promise<NoteItem>;
  deleteNote: (id: string) => Promise<boolean>;

  // App Launcher
  getAllowedApps: () => Promise<AllowedApp[]>;
  launchApp: (appId: string) => Promise<{ success: boolean; error?: string }>;

  // Long-term memory
  listMemories: (options?: { kind?: MemoryKind; limit?: number }) => Promise<MemoryItem[]>;
  searchMemories: (query: string, limit?: number) => Promise<MemoryItem[]>;
  createMemory: (input: MemoryInputPayload) => Promise<{ memory: MemoryItem; action: 'created' | 'updated' }>;
  updateMemory: (
    id: string,
    patch: Partial<MemoryInputPayload>
  ) => Promise<MemoryItem | null>;
  deleteMemory: (id: string) => Promise<boolean>;
  getMemoryStats: () => Promise<MemoryStats>;
  loadConversation: (limit?: number) => Promise<ChatMessage[]>;
  clearConversation: () => Promise<boolean>;

  // Reminders
  listReminders: (includeDone?: boolean) => Promise<ReminderItem[]>;
  completeReminder: (idOrText: string) => Promise<ReminderItem | null>;
  deleteReminder: (idOrText: string) => Promise<boolean>;
  onReminderFired: (callback: (reminder: ReminderItem) => void) => () => void;
  onRemindersChanged: (callback: (reminders: ReminderItem[]) => void) => () => void;

  // Dashboard
  setDashboardOpen: (open: boolean) => void;
  onDashboardArtifact: (callback: (artifact: DashboardArtifact) => void) => () => void;

  // Neural speech output
  synthesizeSpeech: (request: SpeechSynthesisRequest) => Promise<SpeechSynthesisResult>;
  cancelSpeech: () => void;

  // Tasks
  listTasks: (includeDone?: boolean) => Promise<TaskItem[]>;
  completeTask: (idOrText: string) => Promise<TaskItem | null>;
  onTasksChanged: (callback: (tasks: TaskItem[]) => void) => () => void;

  // System health
  getSystemHealth: () => Promise<SystemHealthSnapshot | null>;
  onSystemHealth: (callback: (health: SystemHealthSnapshot) => void) => () => void;

  // Diagnostics
  openLogsFolder: () => Promise<boolean>;
  readLogs: (limit?: number) => Promise<string[]>;

  // Hands-free standby / wake word
  transcribeUtterance: (audioBase64: string, audioMimeType?: string) => Promise<{ success: boolean; reply?: string; error?: string }>;
  onStandbyRequested: (callback: () => void) => () => void;

  // Window Controls
  minimizeWindow: () => void;
  closeWindow: () => void;
}

declare global {
  interface Window {
    fridayAPI: FridayApiBridge;
  }
}
