// Shared TypeScript definitions for FRIDAY AI Desktop Companion

export type RobotState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'laughing'
  | 'sleeping'
  | 'interrupted'
  | 'error';

/** Formal voice session lifecycle state machine. */
export type VoiceSessionState =
  | 'STANDBY'
  | 'IDLE'
  | 'WAKE_DETECTED'
  | 'WAKE_WORD_DETECTED'
  | 'LISTENING'
  | 'SPEECH_DETECTED'
  | 'PROCESSING'
  | 'PROCESSING_AUDIO'
  | 'TRANSCRIBING'
  | 'TRANSCRIPT_RECEIVED'
  | 'THINKING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'ERROR'
  | 'PERMISSION_REQUIRED'
  | 'MICROPHONE_ERROR'
  | 'NETWORK_ERROR'
  | 'PROVIDER_ERROR'
  | 'TASK_UNSUPPORTED';

/** Detailed real-time diagnostics data for development and troubleshooting */
export interface VoiceDiagnosticsData {
  selectedMicDevice: string;
  micPermissionStatus: string;
  streamStatus: 'active' | 'inactive' | 'closed' | 'error';
  trackStatus: {
    label: string;
    readyState: string;
    enabled: boolean;
    muted: boolean;
  };
  audioFormat: string;
  sampleRate: number;
  liveLevel: number;
  peakLevel: number;
  ambientNoiseFloor: number;
  isSpeechDetected: boolean;
  capturedDurationMs: number;
  audioBufferSizeKb: number;
  sessionState: VoiceSessionState;
  sttStatus: 'idle' | 'requesting' | 'completed' | 'error' | 'timeout';
  sttModel: string;
  sttLatencyMs?: number;
  sttTranscript: string;
  geminiStatus: 'idle' | 'requesting' | 'streaming' | 'completed' | 'error';
  geminiLatencyMs?: number;
  ttsStatus: 'idle' | 'synthesizing' | 'speaking' | 'interrupted' | 'error';
  lastError: string | null;
  lastErrorTimestamp?: number;
}

export interface EnrolledSpeakerProfile {
  enrolledAt: number;
  pitchMean: number;
  pitchStd: number;
  spectralVector: number[];
  spectralCentroid: number;
  sampleDurationMs: number;
}

export interface SpeakerVerificationResult {
  verified: boolean;
  score: number;
  pitchDistance: number;
  spectralSimilarity: number;
  reason?: string;
}

/** Visual expression layered over FRIDAY's official face artwork. */
export type FaceExpression =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'crying'
  | 'angry'
  | 'satisfied'
  | 'sarcastic'
  | 'laugh'
  | 'laughing'
  | 'smile'
  | 'not-happy'
  | 'not_happy'
  | 'surprised'
  | 'confused'
  | 'curious'
  | 'sleepy'
  | 'excited'
  | 'thinking';

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
  /** Preferred speech engine; auto uses ElevenLabs when configured, then existing fallbacks. */
  ttsEngine: 'auto' | 'elevenlabs' | 'edge' | 'gemini' | 'system';
  voiceId: string;
  /** Accent used for English speech: American, British or Indian. */
  voiceAccent: 'en-US' | 'en-GB' | 'en-IN';
  /** Chosen neural voice id from the Edge catalogue. */
  ttsVoice: string;
  /** ElevenLabs voice/model settings; the API key is never stored here. */
  elevenLabsVoiceId: string;
  elevenLabsModel: 'eleven_flash_v2_5' | 'eleven_multilingual_v2';
  elevenLabsStability: number;
  elevenLabsSimilarityBoost: number;
  elevenLabsStyle: number;
  elevenLabsSpeakerBoost: boolean;
  /** Safe status only; the secret remains backend-only in ELEVENLABS_API_KEY. */
  elevenLabsConfigured: boolean;
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
  modelName: string; // 'gemini-3.1-pro-preview', 'gemini-3.5-flash'
  soundMuted: boolean;
  /** Long-term memory: extract facts from conversations and use them in replies. */
  memoryEnabled: boolean;
  /** Presentation personality; intelligence and tools are shared by all modes. */
  personalityMode: PersonalityMode;
  /** Hands-free wake-word listener preference. */
  handsFreeEnabled: boolean;
  /** Silence duration before active hands-free mode returns to standby. */
  handsFreeSilenceTimeoutMs: number;
  /** Floating desktop pet overlay enabled. */
  desktopPetEnabled?: boolean;
  /** Stored position for floating desktop pet. */
  petPosition?: PetPosition;
  /** Active primary AI Provider ID. */
  aiProvider?: AiProviderId;
  /** Fallback AI Provider ID if primary is unavailable. */
  fallbackAiProvider?: AiProviderId;
  /** Configurations for multiple AI providers. */
  providerConfigs?: Partial<Record<AiProviderId, Partial<AiProviderConfig>>>;
  /** Windows Screen Understanding and Desktop Control enabled. */
  screenUnderstandingEnabled?: boolean;
  /** Voice isolation: noise suppression level ('off' | 'standard' | 'strong'). */
  noiseSuppression?: 'off' | 'standard' | 'strong';
  /** Acoustic echo cancellation enabled. */
  echoCancellation?: boolean;
  /** Automatic gain control. */
  autoGainControl?: boolean;
  /** Voice activity detection sensitivity ('low' | 'medium' | 'high'). */
  vadSensitivity?: 'low' | 'medium' | 'high';
  /** Speaker verification: only accept commands from enrolled user voice. */
  speakerVerificationEnabled?: boolean;
  /** Enrolled user speaker voice profile / acoustic signature. */
  enrolledVoiceProfile?: EnrolledSpeakerProfile;
  /** Selected microphone device ID. */
  microphoneDeviceId?: string;
  /**
   * High-level listening environment preset.
   * 'quiet'     — normal room, balanced sensitivity.
   * 'noisy'     — fan, TV, background conversation: stronger suppression.
   * 'very_noisy'— maximum suppression; FRIDAY requests repetition when unclear.
   * When set, overrides noiseSuppression and vadSensitivity.
   */
  listeningEnvironment?: 'quiet' | 'noisy' | 'very_noisy';
  /**
   * Minimum peak audio level (0–1) below which a recording is considered silent
   * and not sent to Gemini. Default 0.03.
   */
  audioQualityThreshold?: number;
}

export type AiProviderId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'custom';

export interface AiProviderConfig {
  id: AiProviderId;
  name: string;
  apiKey: string;
  hasKey: boolean;
  model: string;
  availableModels: string[];
  baseUrl?: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'testing';
  lastError?: string;
}

export interface AiProviderStatus {
  activeProvider: AiProviderId;
  fallbackProvider?: AiProviderId;
  providers: Record<AiProviderId, AiProviderConfig>;
}

export interface ScreenCaptureResult {
  success: boolean;
  imageBase64?: string;
  imageMimeType?: string;
  width: number;
  height: number;
  monitorIndex?: number;
  activeWindow?: ActiveWindowInfo;
  elements?: DesktopUiElement[];
  error?: string;
}

export interface ActiveWindowInfo {
  processName: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  handle?: string;
}

export interface DesktopUiElement {
  id: string;
  name: string;
  controlType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isEnabled: boolean;
  isKeyboardFocusable?: boolean;
  value?: string;
}

export interface DesktopActionResult {
  success: boolean;
  action: string;
  target?: string;
  details?: string;
  error?: string;
}

export interface PetPosition {
  x: number;
  y: number;
}

export interface PetCompanionState {
  robotState: RobotState;
  voiceSessionState?: VoiceSessionState;
  amplitude: number;
  expression: FaceExpression;
  mood: ConversationMood;
  soundMuted: boolean;
  handsFreeEnabled: boolean;
  isSpeaking: boolean;
  isVerifiedSpeaker?: boolean;
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
  elevenLabsVoiceId?: string;
  elevenLabsModel?: 'eleven_flash_v2_5' | 'eleven_multilingual_v2';
  elevenLabsStability?: number;
  elevenLabsSimilarityBoost?: number;
  elevenLabsStyle?: number;
  elevenLabsSpeakerBoost?: boolean;
}

export interface SpeechSynthesisResult {
  audioBase64: string;
  mimeType: string;
  voice: string;
  engine: 'elevenlabs' | 'edge' | 'gemini';
}

export interface ElevenLabsUsage {
  configured: boolean;
  available: boolean;
  tier?: string;
  status?: string;
  characterCount?: number;
  characterLimit?: number;
  remainingCharacters?: number;
  resetAt?: number | null;
  error?: string;
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


export interface FridayProcessMetric {
  pid: number;
  type: string;
  cpuPercent: number;
  ramMb: number;
}

export interface FridayResourceMetrics {
  totalCpuPercent: number;
  totalRamMb: number;
  processCount: number;
  processes: FridayProcessMetric[];
  pythonProcesses: number;
  pythonStatus: string;
  wakeWordStatus: string;
  operatingState: 'idle' | 'listening' | 'thinking' | 'speaking' | 'standby';
  gpuStatus: string;
  timestamp: string;
}

export interface FridayApiBridge {
  // Settings & Status
  getSettings: () => Promise<FridaySettings>;
  saveSettings: (settings: Partial<FridaySettings>) => Promise<{ success: boolean; error?: string }>;
  testGeminiConnection: (keyOverride?: string) => Promise<{ success: boolean; message: string; model?: string }>;
  getAudioDevices: () => Promise<MediaDeviceInfo[]>;
  copyText: (text: string) => Promise<{ success: boolean; error?: string }>;
  
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
  getElevenLabsUsage: () => Promise<ElevenLabsUsage>;
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
  getResourceUsage: () => Promise<FridayResourceMetrics>;

  // Hands-free standby / wake word
  transcribeUtterance: (audioBase64: string, audioMimeType?: string) => Promise<{ success: boolean; reply?: string; error?: string }>;
  transcribeSpeech: (audioBase64: string, audioMimeType?: string) => Promise<{ success: boolean; text: string; error?: string }>;
  appExit: () => void;
  onStandbyRequested: (callback: () => void) => () => void;

  // Website Accessibility Assistant
  accessibilityGetState: () => Promise<WebsiteAccessibilityState>;
  accessibilitySetEnabled: (enabled: boolean) => Promise<WebsiteAccessibilityState>;
  accessibilityOpenUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
  accessibilityExecuteCommand: (command: string, args?: Record<string, any>) => Promise<AccessibilityCommandResult>;
  accessibilitySetReadingSpeed: (speed: number) => Promise<number>;
  accessibilityStopReading: () => Promise<boolean>;
  onAccessibilityStateChanged: (callback: (state: WebsiteAccessibilityState) => void) => () => void;

  // Floating Desktop Pet
  petShowMain: () => void;
  petToggleMain: () => void;
  petOpenContextMenu: () => void;
  petGetState: () => Promise<PetCompanionState>;
  onPetStateChanged: (callback: (state: PetCompanionState) => void) => () => void;
  petQuit: () => void;
  setDesktopPetEnabled: (enabled: boolean) => Promise<boolean>;
  updatePetState: (state: Partial<PetCompanionState>) => void;
  petSetExpanded: (expanded: boolean) => Promise<boolean>;
  petGetExpanded: () => Promise<boolean>;

  // Shared Capabilities Registry
  listCapabilities: () => Promise<any[]>;
  executeCapability: (id: string, params?: any) => Promise<any>;

  // Modular AI Providers
  getAiProviders: () => Promise<AiProviderStatus>;
  setAiProvider: (provider: AiProviderId, fallback?: AiProviderId) => Promise<boolean>;
  saveProviderConfig: (id: AiProviderId, config: Partial<AiProviderConfig>) => Promise<boolean>;
  testProviderConnection: (id: AiProviderId) => Promise<{ success: boolean; message: string; model?: string }>;

  // Screen Understanding & Desktop Control
  captureScreen: (options?: { monitorIndex?: number; includeUiElements?: boolean }) => Promise<ScreenCaptureResult>;
  getActiveWindow: () => Promise<ActiveWindowInfo | null>;
  executeDesktopAction: (action: string, args?: Record<string, any>) => Promise<DesktopActionResult>;
  onScreenAnalysisState: (callback: (active: boolean) => void) => () => void;

  // Window-to-Window Conversation Synchronization
  broadcastChatMessage: (message: ChatMessage) => void;
  onChatMessageBroadcast: (callback: (message: ChatMessage) => void) => () => void;

  // Centralized Voice Session & Audio Pipeline
  voiceTriggerMic: () => void;
  voiceInterrupt: () => void;
  onVoiceTriggerMic?: (callback: () => void) => () => void;
  onVoiceInterrupt?: (callback: () => void) => () => void;
  updateVoiceLevel?: (level: number) => void;
  updateVoiceMouth?: (data: { mouthOpenness: number; amplitude: number; frequencies: number[] }) => void;
  updateVoiceState?: (payload: { sessionState: VoiceSessionState; expression?: FaceExpression; mood?: ConversationMood; isSpeaking?: boolean; isVerifiedSpeaker?: boolean }) => void;
  onVoiceStateChanged: (
    callback: (state: {
      sessionState: VoiceSessionState;
      robotState: RobotState;
      expression: FaceExpression;
      mood: ConversationMood;
    }) => void
  ) => () => void;
  onVoiceLevelUpdate: (callback: (level: number) => void) => () => void;
  onVoiceMouthUpdate: (
    callback: (data: { mouthOpenness: number; amplitude: number; frequencies: number[] }) => void
  ) => () => void;
  enrollSpeakerVoice: (
    audioBase64: string,
    mimeType?: string
  ) => Promise<{ success: boolean; profile?: EnrolledSpeakerProfile; error?: string }>;
  clearSpeakerProfile: () => Promise<boolean>;
  testAudioPipeline: (
    durationMs?: number
  ) => Promise<{
    success: boolean;
    snrDb: number;
    peakLevel: number;
    noiseFloor: number;
    voiceDetected: boolean;
    playbackBase64?: string;
    mimeType?: string;
    error?: string;
  }>;

  // Window Controls
  minimizeWindow: () => void;
  closeWindow: () => void;
  getMainVisibility?: () => Promise<boolean>;
  onMainVisibilityChanged?: (callback: (visible: boolean) => void) => () => void;
  onSettingsUpdated?: (callback: (settings: Partial<FridaySettings>) => void) => () => void;

  // QuickTools Phase 1
  quickToolsGetDesktopPreview: () => Promise<QuickActionPreview>;
  quickToolsGetDownloadsPreview: () => Promise<QuickActionPreview>;
  quickToolsGetFolderPreview: (folderPath: string) => Promise<QuickActionPreview>;
  quickToolsExecuteOrganize: (preview: QuickActionPreview) => Promise<QuickActionBatchResult>;
  quickToolsUndoLastOrganize: () => Promise<{ success: boolean; restoredCount: number; message: string }>;
  quickToolsFindDuplicates: (folderPath?: string) => Promise<DuplicateScanResult>;
  quickToolsGetClipboardHistory: () => Promise<ClipboardHistoryItem[]>;
  quickToolsTogglePinClipboard: (id: string) => Promise<ClipboardHistoryItem[]>;
  quickToolsDeleteClipboard: (id: string) => Promise<ClipboardHistoryItem[]>;
  quickToolsClearClipboard: () => Promise<void>;
  quickToolsCopyClipboardItem: (text: string) => Promise<boolean>;
  quickToolsGetSnippets: () => Promise<TextSnippetItem[]>;
  quickToolsSaveSnippet: (snippet: Omit<TextSnippetItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<TextSnippetItem>;
  quickToolsDeleteSnippet: (id: string) => Promise<boolean>;
  quickToolsExpandSnippet: (shortcutOrId: string, placeholders?: Record<string, string>) => Promise<{ success: boolean; expandedText: string }>;

  // QuickTools Phase 2: Desktop Management
  quickToolsListWindows: () => Promise<WindowInfo[]>;
  quickToolsApplyWindowLayout: (action: WindowLayoutAction) => Promise<{ success: boolean; message: string }>;
  quickToolsListNotes: (category?: string, query?: string) => Promise<QuickNoteItem[]>;
  quickToolsSaveNote: (note: Omit<QuickNoteItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<QuickNoteItem>;
  quickToolsDeleteNote: (id: string) => Promise<boolean>;
  quickToolsTogglePinNote: (id: string) => Promise<QuickNoteItem[]>;
  quickToolsPreviewRename: (rule: BatchRenameRule) => Promise<BatchRenamePreview>;
  quickToolsExecuteRename: (preview: BatchRenamePreview) => Promise<BatchRenameResult>;
  quickToolsUndoRename: () => Promise<{ success: boolean; restoredCount: number; message: string }>;

  // QuickTools Phase 3: File Intelligence
  quickToolsSearchFiles: (criteria: FileSearchCriteria) => Promise<FileSearchResult>;
  quickToolsListWorkspaces: () => Promise<WorkspaceConfig[]>;
  quickToolsSaveWorkspace: (workspace: Omit<WorkspaceConfig, 'id' | 'createdAt'> & { id?: string }) => Promise<WorkspaceConfig>;
  quickToolsLaunchWorkspace: (idOrName: string) => Promise<{ success: boolean; launchedCount: number; errors: string[] }>;
  quickToolsDeleteWorkspace: (id: string) => Promise<boolean>;
}

export type WebsiteElementType =
  | 'heading'
  | 'paragraph'
  | 'button'
  | 'link'
  | 'form_field'
  | 'menu'
  | 'landmark';

export interface WebsiteElement {
  id: string;
  type: WebsiteElementType;
  tagName: string;
  text: string;
  role?: string;
  level?: number;
  href?: string;
  inputType?: string;
  inputValue?: string;
  placeholder?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  isSensitive?: boolean;
  validationMessage?: string;
  selector: string;
  label?: string;
  index: number;
}

export interface WebsitePageStructure {
  url: string;
  title: string;
  headings: WebsiteElement[];
  paragraphs: WebsiteElement[];
  buttons: WebsiteElement[];
  links: WebsiteElement[];
  formFields: WebsiteElement[];
  interactiveCount: number;
  summary?: string;
}

export interface WebsiteAccessibilityState {
  enabled: boolean;
  connected: boolean;
  browserName: string;
  currentUrl: string;
  currentTitle: string;
  readingStatus: 'idle' | 'reading' | 'paused';
  readingSpeed: number;
  currentElement: WebsiteElement | null;
  currentIndex: number;
  totalElements: number;
  lastCommand: string;
  statusMessage: string;
  language: string;
}

export interface AccessibilityCommandResult {
  success: boolean;
  action: string;
  speechText?: string;
  element?: WebsiteElement | null;
  needsDisambiguation?: boolean;
  options?: string[];
  error?: string;
  summary?: string;
}

// ==========================================
// QUICKTOOLS PHASE 1 TYPES
// ==========================================

export type FileCategory =
  | 'Documents'
  | 'Images'
  | 'Screenshots'
  | 'Videos'
  | 'Audio'
  | 'Archives'
  | 'Code'
  | 'Executables'
  | 'Others';

export interface ProposedFileMove {
  fileName: string;
  sourcePath: string;
  destinationPath: string;
  category: FileCategory;
  fileSize: number;
}

export interface QuickActionPreview {
  targetFolder: string;
  proposedMoves: ProposedFileMove[];
  categoryCounts: Record<string, number>;
  totalFiles: number;
  totalBytes: number;
}

export interface QuickActionBatchResult {
  batchId: string;
  timestamp: string;
  targetFolder: string;
  successCount: number;
  failureCount: number;
  movedFiles: Array<{ source: string; destination: string }>;
  errors: Array<{ file: string; error: string }>;
}

export interface DuplicateFileGroup {
  hash: string;
  size: number;
  files: string[];
}

export interface DuplicateScanResult {
  scannedCount: number;
  duplicateGroups: DuplicateFileGroup[];
  wastedBytes: number;
}

export interface ClipboardHistoryItem {
  id: string;
  text: string;
  copiedAt: string;
  isPinned: boolean;
  charCount: number;
  isUrl: boolean;
}

export interface TextSnippetItem {
  id: string;
  shortcut: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// QUICKTOOLS PHASE 2 TYPES: DESKTOP MANAGEMENT
// ==========================================

export interface WindowInfo {
  id: number;
  processName: string;
  title: string;
  handle: number;
}

export interface WindowLayoutAction {
  action: 'split_left' | 'split_right' | 'maximize' | 'minimize' | 'restore' | 'center' | 'split_top' | 'split_bottom' | 'grid_quad';
  windowTarget?: string;
  secondTarget?: string;
  monitorIndex?: number;
}

export interface QuickNoteItem {
  id: string;
  title: string;
  content: string;
  category: 'Coding' | 'Work' | 'Personal' | 'Ideas' | 'Study' | 'General';
  tags: string[];
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BatchRenameRule {
  folderPath: string;
  pattern?: string;
  prefix?: string;
  suffix?: string;
  findText?: string;
  replaceText?: string;
  replaceWith?: string;
  sequentialNumbering?: boolean;
  addNumber?: boolean;
  startNumber?: number;
  numberPadding?: number;
  datePrefix?: boolean;
  addDate?: boolean;
  changeCase?: 'lowercase' | 'uppercase' | 'titlecase' | 'none';
}

export interface RenameProposedItem {
  originalName: string;
  newName: string;
  proposedName?: string;
  sourcePath: string;
  destinationPath: string;
  collision: boolean;
  status?: string;
}

export interface BatchRenamePreview {
  folderPath: string;
  items: RenameProposedItem[];
  totalFiles: number;
  conflictCount: number;
}

export interface BatchRenameResult {
  batchId: string;
  timestamp: string;
  folderPath: string;
  renamedCount: number;
  successCount?: number;
  failureCount: number;
  skippedCount?: number;
  items: Array<{ originalPath: string; newPath: string }>;
  errors: Array<{ file: string; error: string }>;
}

// ==========================================
// QUICKTOOLS PHASE 3 TYPES: FILE INTELLIGENCE
// ==========================================

export interface FileSearchCriteria {
  query: string;
  folderPath?: string;
  extension?: string;
  minSizeMb?: number;
  maxSizeMb?: number;
  modifiedWithinDays?: number;
  searchContent?: boolean;
}

export interface FileSearchResultItem {
  fileName: string;
  filePath: string;
  extension: string;
  sizeBytes: number;
  sizeFormatted: string;
  modifiedAt: string;
  previewSnippet?: string;
}

export interface FileSearchResult {
  criteria: FileSearchCriteria;
  results: FileSearchResultItem[];
  totalMatches: number;
  scannedCount: number;
}

export interface WorkspaceAppConfig {
  appId: string;
  name: string;
  args?: string[];
  launchDelayMs?: number;
  layoutPosition?: 'left' | 'right' | 'maximize' | 'center' | 'normal';
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  description: string;
  folderPath?: string;
  apps: WorkspaceAppConfig[];
  createdAt: string;
  lastUsedAt?: string;
}

declare global {
  interface Window {
    fridayAPI: FridayApiBridge;
  }
}
