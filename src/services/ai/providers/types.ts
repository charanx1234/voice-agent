import {
  AiProviderConfig,
  AiProviderId,
  ChatMessage,
  ConversationMood,
  PersonalityMode,
  ResponseStreamEvent,
  ToolCallRecord,
  VoiceProsodySummary,
} from '../../../shared/types';

export interface ProviderGenerateParams {
  message: string;
  conversationHistory: ChatMessage[];
  audioBase64?: string;
  audioMimeType?: string;
  imageBase64?: string;
  imageMimeType?: string;
  language?: string;
  prosody?: VoiceProsodySummary;
  personalityMode?: PersonalityMode;
  mood?: ConversationMood;
  requestId?: string;
  signal?: AbortSignal;
}

export interface ProviderGenerateResult {
  text: string;
  detectedLanguage?: string;
  toolCalls?: ToolCallRecord[];
  mood?: ConversationMood;
  safetyOverride?: boolean;
  modelUsed?: string;
  providerUsed?: AiProviderId;
  error?: string;
  cancelled?: boolean;
}

export interface ProviderConnectionTestResult {
  success: boolean;
  message: string;
  model?: string;
}

export interface IAiProvider {
  readonly id: AiProviderId;
  readonly name: string;
  testConnection(apiKey?: string, model?: string, baseUrl?: string): Promise<ProviderConnectionTestResult>;
  generate(
    params: ProviderGenerateParams,
    config: AiProviderConfig,
    onStream?: (event: Omit<ResponseStreamEvent, 'requestId'>) => void
  ): Promise<ProviderGenerateResult>;
}
