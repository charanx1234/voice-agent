export type TypingEngineType = 'win32' | 'ahk';

export type TypingSessionStatus =
  | 'idle'
  | 'validating'
  | 'typing'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface TargetWindowInfo {
  hwnd: number;
  pid?: number;
  title: string;
  process: string;
  isPassword?: boolean;
  isTerminal?: boolean;
  notRunning?: boolean;
}

export interface TypingSessionConfig {
  speedWpm?: number;
  charDelayMs?: number;
  preserveIndentation?: boolean;
  newlineMode?: 'enter' | 'shift-enter' | 'crlf';
  engine?: TypingEngineType;
  restoreClipboard?: boolean;
  chunkSize?: number;
  autoValidateTarget?: boolean;
  targetApp?: string;
  source?: string;
}

export interface TypingProgress {
  sessionId: string;
  totalChars: number;
  typedChars: number;
  percent: number;
  currentChunk: number;
  totalChunks: number;
  status: TypingSessionStatus;
  targetProcess: string;
  errorMessage?: string;
}

export interface TypingResult {
  sessionId: string;
  success: boolean;
  charsTyped: number;
  totalChars: number;
  durationMs: number;
  status: TypingSessionStatus;
  targetProcess: string;
  errorMessage?: string;
}

export interface ITypingEngine {
  readonly id: TypingEngineType;
  initialize(): Promise<void>;
  validateTarget(target?: TargetWindowInfo): Promise<{ valid: boolean; reason?: string }>;
  startTyping(
    text: string,
    config: TypingSessionConfig,
    onProgress?: (progress: TypingProgress) => void
  ): Promise<TypingResult>;
  pauseTyping(): Promise<boolean>;
  resumeTyping(): Promise<boolean>;
  cancelTyping(): Promise<boolean>;
  getStatus(): TypingSessionStatus;
  shutdown(): Promise<void>;
}

export interface TypeFlowClipboardItem {
  id: string;
  text: string;
  timestamp: number;
  charCount: number;
  lineCount: number;
  isSnippet?: boolean;
}

export interface TypeFlowTemplate {
  id: string;
  title: string;
  category: string;
  content: string;
  variables: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TypeFlowHistoryItem {
  id: string;
  timestamp: number;
  textPreview: string;
  fullText?: string;
  charCount: number;
  source: 'clipboard' | 'selected-text' | 'ai-generated' | 'template' | 'manual';
  targetProcess: string;
  status: TypingSessionStatus;
  durationMs: number;
}

export interface SelectedTextResult {
  text: string;
  source: 'ui-automation' | 'clipboard-fallback' | 'none';
  application: string;
  windowTitle: string;
  timestamp: number;
  isPassword?: boolean;
  error?: string;
}

export type TextContentType =
  | 'question'
  | 'code_question'
  | 'source_code'
  | 'error_message'
  | 'article'
  | 'email'
  | 'documentation'
  | 'math'
  | 'instructions'
  | 'general';

export interface ContextUnderstandingResult {
  category: TextContentType;
  summary: string;
  keyPoints: string[];
  detectedLanguage?: string;
  suggestedActions: string[];
  confidence: number;
}
