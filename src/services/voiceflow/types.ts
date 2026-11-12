export type VoiceFlowState =
  | 'IDLE_READY'
  | 'ACTIVATED'
  | 'RECORDING'
  | 'TRANSCRIBING'
  | 'ENHANCING'
  | 'INSERTING'
  | 'COMPLETED'
  | 'ERROR'
  | 'CANCELLED';

export type VoiceFlowMode =
  | 'natural'
  | 'professional'
  | 'concise'
  | 'code'
  | 'verbatim';

export interface VoiceFlowSettings {
  enabled: boolean;
  activationPhrase: string; // e.g. "Friday, type this"
  shortcutEnabled: boolean;
  globalShortcut: string; // e.g. "Control+Alt+Space"
  model: 'tiny' | 'base' | 'small' | 'turbo';
  language: string; // 'auto' | 'en' | 'te' | ...
  mode: VoiceFlowMode;
  directTranscription: boolean; // if true, skip AI enhancement
  silenceTimeoutMs: number; // default 700ms
  keepHistory: boolean;
  restoreClipboard: boolean;
}

export const DEFAULT_VOICEFLOW_SETTINGS: VoiceFlowSettings = {
  enabled: true,
  activationPhrase: 'Friday, type this',
  shortcutEnabled: false,
  globalShortcut: 'Control+Alt+Space',
  model: 'base',
  language: 'auto',
  mode: 'natural',
  directTranscription: false,
  silenceTimeoutMs: 700,
  keepHistory: true,
  restoreClipboard: true,
};

export interface VoiceFlowTranscriptResult {
  text: string;
  language: string;
  languageProbability: number;
  durationMs: number;
  latencyMs: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}

export interface VoiceFlowHistoryItem {
  id: string;
  timestamp: number;
  rawTranscript: string;
  enhancedText: string;
  mode: VoiceFlowMode;
  language: string;
  inserted: boolean;
  targetApp?: string;
  latencyMs: number;
}

export type VoiceFlowHistoryEntry = VoiceFlowHistoryItem;

export interface TargetWindowInfo {
  hwnd: number;
  pid?: number;
  title: string;
  process: string;
  isPassword: boolean;
  isTerminal: boolean;
}

export interface VoiceFlowInsertionResult {
  success: boolean;
  targetProcess: string;
  charsInserted: number;
  multiline: boolean;
  restoredClipboard: boolean;
  error?: string;
}

export interface VoiceFlowStatus {
  state: VoiceFlowState;
  isRecording: boolean;
  currentMode: VoiceFlowMode;
  model: string;
  modelLoaded: boolean;
  targetApp?: string;
  error?: string;
}
