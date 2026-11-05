import { VoiceSessionState } from '../../shared/types';

export enum FridayErrorKind {
  UNSUPPORTED_CAPABILITY = 'UNSUPPORTED_CAPABILITY',
  MISSING_PERMISSION = 'MISSING_PERMISSION',
  MISSING_CONFIG = 'MISSING_CONFIG',
  NETWORK_FAILURE = 'NETWORK_FAILURE',
  MODEL_API_ERROR = 'MODEL_API_ERROR',
  DESKTOP_AUTOMATION_FAILURE = 'DESKTOP_AUTOMATION_FAILURE',
  AMBIGUOUS_INSTRUCTION = 'AMBIGUOUS_INSTRUCTION',
  INTERNAL_BUG = 'INTERNAL_BUG',
}

export interface FridayErrorResponse {
  kind: FridayErrorKind;
  userMessage: string;
  voiceSessionState: VoiceSessionState;
  technicalMessage: string;
  stack?: string;
  context?: Record<string, any>;
}

/**
 * Sanitizes any raw string to guarantee NO stack traces, internal paths,
 * JSON blocks, or developer jargon leak into normal conversations.
 */
export function sanitizeForUser(raw: string): string {
  if (!raw) return '';
  let clean = String(raw);

  // Remove stack traces
  clean = clean.split(/\n\s*at\s+/)[0];

  // Remove file system paths
  clean = clean.replace(/[a-zA-Z]:\\[^\s"']+/g, '');
  clean = clean.replace(/\/[\w\-.]+\/[\w\-.]+/g, '');

  // Remove JSON blobs
  clean = clean.replace(/\{[\s\S]*?\}/g, '');

  // Remove raw HTTP status codes and tech prefixes
  clean = clean.replace(/\[GoogleGenAI Error\]/gi, '');
  clean = clean.replace(/HTTP\s+\d{3}/gi, '');
  clean = clean.replace(/\bstatus\s*(?:code)?\s*[:=]?\s*\d{3}\b/gi, '');

  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

/**
 * Centralized classifier converting raw technical failures, tool errors,
 * network faults, and missing permissions into clear natural conversation.
 */
export function classifyFridayError(
  err: any,
  context: {
    action?: string;
    toolName?: string;
    query?: string;
    permission?: string;
    appId?: string;
    provider?: string;
  } = {}
): FridayErrorResponse {
  const rawMsg = String(err?.message || err || '');
  const stack = err?.stack || undefined;
  const lower = rawMsg.toLowerCase();
  const actionLower = String(context.action || context.toolName || context.query || '').toLowerCase();

  let kind: FridayErrorKind = FridayErrorKind.INTERNAL_BUG;
  let userMessage = "Something unexpected went wrong on my end while processing that. I've logged the details and can try again.";
  let voiceSessionState: VoiceSessionState = 'TASK_UNSUPPORTED';

  // 1. Unsupported Capability / Unrecognized Action
  if (
    lower.includes('unsupported') ||
    lower.includes('not supported') ||
    lower.includes('unrecognized tool') ||
    lower.includes('unknown screen control tool') ||
    lower.includes('cannot perform that action') ||
    actionLower.includes('unsupported') ||
    actionLower.includes("don't support") ||
    actionLower.includes('does not support')
  ) {
    kind = FridayErrorKind.UNSUPPORTED_CAPABILITY;
    userMessage = "I can't perform that action yet. I can help with something else.";
    voiceSessionState = 'TASK_UNSUPPORTED';
  }
  // 2. Missing Permission / Confirmation Rejection
  else if (
    lower.includes('permission') ||
    lower.includes('denied') ||
    lower.includes('rejectedbyuser') ||
    lower.includes('cancelled or denied by the user') ||
    lower.includes('not-allowed') ||
    lower.includes('access is denied') ||
    lower.includes('screen-reading') ||
    context.permission
  ) {
    kind = FridayErrorKind.MISSING_PERMISSION;
    voiceSessionState = 'PERMISSION_REQUIRED';

    if (context.toolName === 'read_screen' || lower.includes('screen')) {
      userMessage = 'Screen access is currently unavailable. Please grant screen-reading permission so I can see your display.';
    } else if (context.toolName === 'search_project_folder' || lower.includes('folder')) {
      userMessage = "I don't have permission to access that folder. You can add it to your approved folders in Settings.";
    } else if (lower.includes('microphone') || lower.includes('audio')) {
      userMessage = 'Microphone access is unavailable. Please check your microphone permissions in system settings.';
      voiceSessionState = 'MICROPHONE_ERROR';
    } else if (lower.includes('cancelled') || lower.includes('denied')) {
      userMessage = 'I cancelled that action because permission was not granted.';
    } else {
      userMessage = `I need permission to complete that action. ${context.permission || 'Please grant permission in Settings.'}`;
    }
  }
  // 3. Missing API Key / Configuration
  else if (
    lower.includes('api key') ||
    lower.includes('api_key') ||
    lower.includes('apikey') ||
    lower.includes('not configured') ||
    lower.includes('unauthenticated') ||
    lower.includes('invalid api key') ||
    lower.includes('no key')
  ) {
    kind = FridayErrorKind.MISSING_CONFIG;
    voiceSessionState = 'PROVIDER_ERROR';
    const providerName = context.provider ? context.provider.toUpperCase() : 'AI';
    userMessage = `My ${providerName} service is not configured yet. Please add your API key in Settings to continue.`;
  }
  // 4. Temporary Network Failure / Offline
  else if (
    lower.includes('network') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('fetch failed') ||
    lower.includes('offline') ||
    lower.includes('internet') ||
    lower.includes('socket hang up') ||
    context.toolName === 'search_web' && lower.includes('failed')
  ) {
    kind = FridayErrorKind.NETWORK_FAILURE;
    voiceSessionState = 'NETWORK_ERROR';
    userMessage = 'I cannot access the internet right now. Please check your connection and try again.';
  }
  // 5. Model/API Error (503 High demand, 429 Rate limit, Overloaded)
  else if (
    lower.includes('503') ||
    lower.includes('429') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('quota')
  ) {
    kind = FridayErrorKind.MODEL_API_ERROR;
    voiceSessionState = 'PROVIDER_ERROR';
    userMessage = 'The AI service is experiencing high traffic right now. Please try again in a moment.';
  }
  // 6. Desktop Automation / Missing Application
  else if (
    lower.includes('could not find an application') ||
    lower.includes('is it installed') ||
    context.toolName === 'launch_allowed_app' ||
    lower.includes('no foreground window') ||
    lower.includes('element not found') ||
    lower.includes('automation')
  ) {
    kind = FridayErrorKind.DESKTOP_AUTOMATION_FAILURE;
    voiceSessionState = 'TASK_UNSUPPORTED';
    if (context.toolName === 'launch_allowed_app' || lower.includes('application')) {
      userMessage = "I couldn't find that application on your computer.";
    } else if (lower.includes('element')) {
      userMessage = "I couldn't locate that element on your screen to click it.";
    } else if (lower.includes('window')) {
      userMessage = "I couldn't find an active window to complete that action.";
    } else {
      userMessage = "I couldn't complete that desktop action on your screen.";
    }
  }
  // 7. Ambiguous User Instruction
  else if (
    lower.includes('ambiguous') ||
    lower.includes('clarif') ||
    lower.includes('which application') ||
    lower.includes('please specify')
  ) {
    kind = FridayErrorKind.AMBIGUOUS_INSTRUCTION;
    voiceSessionState = 'STANDBY';
    userMessage = "I'm not quite sure which action you'd like me to take. Could you clarify what you need?";
  }

  // Privately log full technical details with stack trace for developer inspection
  console.error('[FRIDAY ErrorHandler] Technical error occurred:', {
    kind,
    rawMsg,
    context,
    stack,
    resolvedUserMessage: userMessage,
  });

  return {
    kind,
    userMessage,
    voiceSessionState,
    technicalMessage: rawMsg,
    stack,
    context,
  };
}
