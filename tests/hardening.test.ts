import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import {
  assembleStreamedResponse,
  buildModelCandidates,
  buildToolResponsePart,
  buildToolResponseTurn,
  getFunctionCalls,
  getModelToolCallContent,
  isModelUnavailableError,
  normalizeConversationHistory,
} from '../src/services/ai/gemini';
import { isInsideDirectory } from '../src/services/agent/projectSearchTool';
import { GeminiService } from '../src/services/ai/gemini';
import { toolRegistry } from '../src/services/agent/toolRegistry';

describe('Gemini model fallback', () => {
  it('tries the configured model first', () => {
    expect(buildModelCandidates('gemini-3.8-flash')[0]).toBe('gemini-3.8-flash');
  });

  it('de-duplicates candidates while keeping fallbacks', () => {
    const candidates = buildModelCandidates('gemini-2.5-flash');
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates.length).toBeGreaterThan(1);
  });

  it('falls back to a default when nothing is configured', () => {
    expect(buildModelCandidates(undefined)[0]).toBe('gemini-3.5-flash-lite');
    expect(buildModelCandidates('   ')[0]).toBe('gemini-3.5-flash-lite');
  });

  it('recognises a missing-model error', () => {
    expect(isModelUnavailableError(new Error('404 model not found'))).toBe(true);
    expect(isModelUnavailableError(new Error('INVALID_ARGUMENT: model does not exist'))).toBe(true);
  });

  it('does not retry a different model for rate limits or auth failures', () => {
    expect(isModelUnavailableError(new Error('429 quota exceeded'))).toBe(false);
    expect(isModelUnavailableError(new Error('API key not valid'))).toBe(false);
  });
});

describe('Conversation history normalisation', () => {
  const msg = (role: 'user' | 'assistant', text: string, isError = false) => ({
    id: `${role}-${text}`,
    role,
    text,
    timestamp: Date.now(),
    isError,
  });

  it('drops the opening greeting so history starts with the user', () => {
    const history = normalizeConversationHistory([
      msg('assistant', 'నమస్కారం! నేను FRIDAY.'),
      msg('user', 'హలో'),
      msg('assistant', 'హాయ్!'),
    ]);

    expect(history[0].role).toBe('user');
    expect(history.map((m) => m.text)).toEqual(['హలో', 'హాయ్!']);
  });

  it('merges consecutive same-role turns so roles alternate', () => {
    const history = normalizeConversationHistory([
      msg('user', 'one'),
      msg('user', 'two'),
      msg('assistant', 'reply'),
    ]);

    expect(history.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(history[0].text).toBe('one\n\ntwo');
  });

  it('skips error bubbles, which are not real model output', () => {
    const history = normalizeConversationHistory([
      msg('user', 'hello'),
      msg('assistant', 'I could not complete that request', true),
      msg('assistant', 'real answer'),
    ]);

    expect(history.map((m) => m.text)).toEqual(['hello', 'real answer']);
  });

  it('returns an empty list when there is nothing usable', () => {
    expect(normalizeConversationHistory([])).toEqual([]);
    expect(normalizeConversationHistory([msg('assistant', 'only a greeting')])).toEqual([]);
  });
});

describe('Tool result turns', () => {
  it('sends tool results with the user role, which the API accepts', () => {
    const turn = buildToolResponseTurn([
      { functionResponse: { name: 'save_note', response: { success: true } } },
    ]);

    expect(turn.role).toBe('user');
    expect(turn.parts).toHaveLength(1);
    // The legacy SDK used role 'function', which the API now rejects with a 400.
    expect(turn.role).not.toBe('function');
  });

  it('keeps streamed function-call parts and thought signatures intact', () => {
    const firstCallPart = {
      functionCall: { id: 'call-1', name: 'enter_standby', args: {} },
      thoughtSignature: 'signature-1',
      partMetadata: { providerField: 'keep-me' },
    };
    const secondCallPart = {
      functionCall: { id: 'call-2', name: 'save_note', args: { title: 'x', content: 'y' } },
      thoughtSignature: 'signature-2',
    };

    const response = assembleStreamedResponse([
      { candidates: [{ content: { role: 'model', parts: [{ text: 'Working…' }] } }] },
      { candidates: [{ content: { role: 'model', parts: [firstCallPart] } }] },
      { candidates: [{ content: { role: 'model', parts: [secondCallPart] } }] },
    ]);

    const modelContent = getModelToolCallContent(response);
    expect(modelContent).toBe(response.candidates[0].content);
    expect(modelContent.parts[1]).toBe(firstCallPart);
    expect(modelContent.parts[1].thoughtSignature).toBe('signature-1');
    expect(modelContent.parts[1].partMetadata).toEqual({ providerField: 'keep-me' });
    expect(getFunctionCalls(response)).toEqual([firstCallPart.functionCall, secondCallPart.functionCall]);

    const toolResponses = getFunctionCalls(response).map((call) => buildToolResponsePart(call, { success: true }));
    expect(toolResponses.map((part) => part.functionResponse.name)).toEqual(['enter_standby', 'save_note']);
    expect(toolResponses.map((part) => part.functionResponse.id)).toEqual(['call-1', 'call-2']);
  });

  it('executes enter_standby and consecutive tools in API order', async () => {
    const standbyPart = {
      functionCall: { id: 'standby-1', name: 'enter_standby', args: {} },
      thoughtSignature: 'standby-signature',
    };
    const notePart = {
      functionCall: { id: 'note-1', name: 'save_note', args: { title: 'x', content: 'y' } },
      thoughtSignature: 'note-signature',
    };
    const listPart = {
      functionCall: { id: 'list-1', name: 'list_notes', args: {} },
      thoughtSignature: 'list-signature',
    };
    const stream = (...chunks: any[]) =>
      (async function* () {
        for (const chunk of chunks) yield chunk;
      })();
    const fakeClient = {
      models: {
        generateContentStream: vi
          .fn()
          .mockResolvedValueOnce(
            stream({ candidates: [{ content: { role: 'model', parts: [standbyPart, notePart] } }] })
          )
          .mockResolvedValueOnce(stream({ candidates: [{ content: { role: 'model', parts: [listPart] } }] }))
          .mockResolvedValueOnce(stream({ candidates: [{ content: { role: 'model', parts: [{ text: 'All set.' }] } }] })),
      },
    };
    const executeTool = vi.spyOn(toolRegistry, 'executeTool').mockImplementation(async (name) => ({ success: true, tool: name }));
    const service = new GeminiService();
    (service as any).getClient = () => fakeClient;

    try {
      const result = await (service as any).runConversation(
        { message: 'go offline and save this', conversationHistory: [] },
        'gemini-test-model',
        'en-IN',
        { toolsExecuted: false }
      );

      expect(result.text).toBe('All set.');
      expect(executeTool.mock.calls.map(([name]) => name)).toEqual(['enter_standby', 'save_note', 'list_notes']);

      const secondRequest = fakeClient.models.generateContentStream.mock.calls[1][0];
      const firstModelTurn = secondRequest.contents.find((content: any) => content.role === 'model');
      expect(firstModelTurn.parts).toEqual([standbyPart, notePart]);
      expect(firstModelTurn.parts[0].thoughtSignature).toBe('standby-signature');
      expect(firstModelTurn.parts[1].thoughtSignature).toBe('note-signature');
      expect(secondRequest.contents[secondRequest.contents.indexOf(firstModelTurn) + 1].parts).toEqual([
        { functionResponse: { id: 'standby-1', name: 'enter_standby', response: { success: true, tool: 'enter_standby' } } },
        { functionResponse: { id: 'note-1', name: 'save_note', response: { success: true, tool: 'save_note' } } },
      ]);

      const thirdRequest = fakeClient.models.generateContentStream.mock.calls[2][0];
      const secondModelTurn = thirdRequest.contents.filter((content: any) => content.role === 'model')[1];
      expect(secondModelTurn.parts).toEqual([listPart]);
      expect(secondModelTurn.parts[0].thoughtSignature).toBe('list-signature');
    } finally {
      executeTool.mockRestore();
    }
  });
});

describe('Approved folder boundary', () => {
  const root = path.resolve('C:/projects/app');

  it('accepts a path nested inside the approved folder', () => {
    expect(isInsideDirectory(path.join(root, 'src', 'a.ts'), root)).toBe(true);
  });

  it('rejects the root itself and its siblings', () => {
    expect(isInsideDirectory(root, root)).toBe(false);
    expect(isInsideDirectory(path.resolve('C:/projects/other/a.ts'), root)).toBe(false);
  });

  it('rejects traversal out of the approved folder', () => {
    expect(isInsideDirectory(path.join(root, '..', 'secret.txt'), root)).toBe(false);
  });
});
