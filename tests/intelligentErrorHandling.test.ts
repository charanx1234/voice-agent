import { describe, expect, it } from 'vitest';
import {
  classifyFridayError,
  FridayErrorKind,
  sanitizeForUser,
} from '../src/services/error/errorHandler';

describe('Intelligent Error Handling Service', () => {
  describe('sanitizeForUser', () => {
    it('strips javascript stack traces', () => {
      const raw = 'Error: Network timeout\n    at fetchData (C:\\app\\fetch.ts:45:10)\n    at process (C:\\app\\index.ts:12:3)';
      const sanitized = sanitizeForUser(raw);
      expect(sanitized).toBe('Error: Network timeout');
      expect(sanitized).not.toContain('at fetchData');
      expect(sanitized).not.toContain('C:\\');
    });

    it('strips file system paths', () => {
      const raw = 'Failed to load module C:\\25r11a6760\\FRIDAY\\dist\\bundle.js';
      const sanitized = sanitizeForUser(raw);
      expect(sanitized).not.toContain('C:\\25r11a6760');
      expect(sanitized).toBe('Failed to load module');
    });

    it('strips raw JSON blobs and HTTP status errors', () => {
      const raw = '[GoogleGenAI Error] HTTP 503 {"error":{"code":503,"message":"Model overloaded"}}';
      const sanitized = sanitizeForUser(raw);
      expect(sanitized).not.toContain('GoogleGenAI');
      expect(sanitized).not.toContain('HTTP 503');
      expect(sanitized).not.toContain('{"error"');
    });

    it('handles empty or null input gracefully', () => {
      expect(sanitizeForUser('')).toBe('');
      expect(sanitizeForUser(null as any)).toBe('');
    });
  });

  describe('classifyFridayError', () => {
    it('classifies unsupported capability naturally', () => {
      const result = classifyFridayError(new Error('This capability is unsupported on this platform'), {
        action: 'hack_satellite',
      });
      expect(result.kind).toBe(FridayErrorKind.UNSUPPORTED_CAPABILITY);
      expect(result.voiceSessionState).toBe('TASK_UNSUPPORTED');
      expect(result.userMessage).toBe("I can't perform that action yet. I can help with something else.");
    });

    it('classifies missing screen-reading permission', () => {
      const result = classifyFridayError(new Error('Access denied to screen capture buffer'), {
        toolName: 'read_screen',
      });
      expect(result.kind).toBe(FridayErrorKind.MISSING_PERMISSION);
      expect(result.voiceSessionState).toBe('PERMISSION_REQUIRED');
      expect(result.userMessage).toContain('Screen access is currently unavailable');
    });

    it('classifies missing folder access permission', () => {
      const result = classifyFridayError(new Error('EACCES: permission denied, scandir'), {
        toolName: 'search_project_folder',
      });
      expect(result.kind).toBe(FridayErrorKind.MISSING_PERMISSION);
      expect(result.voiceSessionState).toBe('PERMISSION_REQUIRED');
      expect(result.userMessage).toContain("I don't have permission to access that folder");
    });

    it('classifies missing API key configuration', () => {
      const result = classifyFridayError(new Error('GEMINI_API_KEY is not configured or unauthenticated'), {
        provider: 'gemini',
      });
      expect(result.kind).toBe(FridayErrorKind.MISSING_CONFIG);
      expect(result.voiceSessionState).toBe('PROVIDER_ERROR');
      expect(result.userMessage).toContain('My GEMINI service is not configured yet');
    });

    it('classifies temporary network disconnection', () => {
      const result = classifyFridayError(new Error('getaddrinfo ENOTFOUND generativelanguage.googleapis.com'));
      expect(result.kind).toBe(FridayErrorKind.NETWORK_FAILURE);
      expect(result.voiceSessionState).toBe('NETWORK_ERROR');
      expect(result.userMessage).toBe('I cannot access the internet right now. Please check your connection and try again.');
    });

    it('classifies model overload and 503 / 429 rate limit errors naturally without tech codes', () => {
      const result = classifyFridayError(new Error('HTTP 503 The model is overloaded. Please try again later.'));
      expect(result.kind).toBe(FridayErrorKind.MODEL_API_ERROR);
      expect(result.voiceSessionState).toBe('PROVIDER_ERROR');
      expect(result.userMessage).toBe('The AI service is experiencing high traffic right now. Please try again in a moment.');
      expect(result.userMessage).not.toContain('503');
    });

    it('classifies missing desktop applications', () => {
      const result = classifyFridayError(new Error('Could not find an application executable'), {
        toolName: 'launch_allowed_app',
        appId: 'blender',
      });
      expect(result.kind).toBe(FridayErrorKind.DESKTOP_AUTOMATION_FAILURE);
      expect(result.voiceSessionState).toBe('TASK_UNSUPPORTED');
      expect(result.userMessage).toBe("I couldn't find that application on your computer.");
    });

    it('classifies ambiguous user instructions', () => {
      const result = classifyFridayError(new Error('Query is ambiguous, please specify which application'));
      expect(result.kind).toBe(FridayErrorKind.AMBIGUOUS_INSTRUCTION);
      expect(result.voiceSessionState).toBe('STANDBY');
      expect(result.userMessage).toContain("Could you clarify what you need?");
    });

    it('classifies general unexpected bugs into clean polite messages with technical logs preserved', () => {
      const err = new TypeError('Cannot read properties of undefined (reading of map)');
      const result = classifyFridayError(err);
      expect(result.kind).toBe(FridayErrorKind.INTERNAL_BUG);
      expect(result.voiceSessionState).toBe('TASK_UNSUPPORTED');
      expect(result.userMessage).toContain("Something unexpected went wrong on my end");
      expect(result.technicalMessage).toContain('Cannot read properties of undefined');
    });
  });
});
