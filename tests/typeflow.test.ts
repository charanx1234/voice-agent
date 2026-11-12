import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TypeFlowController, IClipboardAdapter } from '../src/services/typeflow/typeflowController';
import { typeFlowAi } from '../src/services/typeflow/typeflowAiIntelligence';
import { typeFlowService } from '../src/services/typeflow/typeflowService';
import { typingEngineManager } from '../src/services/typeflow/typingEngineManager';
import { fastLocalIntentRouter } from '../src/services/agent/fastLocalIntent';

class MockClipboardAdapter implements IClipboardAdapter {
  private content = '';
  public readText(): string {
    return this.content;
  }
  public writeText(text: string): void {
    this.content = text;
  }
  public clear(): void {
    this.content = '';
  }
}

describe('FRIDAY TypeFlow End-to-End Suite', () => {
  let mockClipboard: MockClipboardAdapter;
  let controller: TypeFlowController;

  beforeEach(() => {
    mockClipboard = new MockClipboardAdapter();
    controller = TypeFlowController.getInstance();
    controller.setClipboardAdapter(mockClipboard);
    controller.clearContext();
    controller.clearQueue();
  });

  // 1. Plain-text clipboard typing & reading
  it('reads and handles plain-text clipboard content safely', async () => {
    mockClipboard.writeText('Hello FRIDAY TypeFlow!');
    expect(controller.getClipboardText()).toBe('Hello FRIDAY TypeFlow!');
  });

  // 2. Multiline clipboard typing
  it('preserves multiline linebreaks and carriage returns', async () => {
    const multiline = 'Line 1\nLine 2\nLine 3\n';
    mockClipboard.writeText(multiline);
    expect(controller.getClipboardText()).toBe(multiline);
  });

  // 3. Code formatting preservation
  it('preserves code formatting, tabs, and indentation', async () => {
    const code = `function calculateSum(a: number, b: number): number {\n\tconst result = a + b;\n\treturn result;\n}`;
    mockClipboard.writeText(code);
    expect(controller.getClipboardText()).toBe(code);
  });

  // 4. Unicode text handling
  it('handles Unicode characters, emojis, and multilingual scripts accurately', async () => {
    const unicodeText = 'FRIDAY శుభోదయం! 🚀 नमस्ते World ✨ (Ω ≈ 3.14)';
    mockClipboard.writeText(unicodeText);
    expect(controller.getClipboardText()).toBe(unicodeText);
  });

  // 5. Smart chunking on large text
  it('divides large content into manageable chunks along paragraph boundaries', () => {
    const longParagraph = 'Word '.repeat(500); // 2500 chars
    const chunks = controller.chunkText(longParagraph, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('').length).toBe(longParagraph.length);
  });

  // 6. Empty clipboard handling
  it('detects empty clipboard and rejects safely without crashing', async () => {
    mockClipboard.clear();
    await expect(controller.typeClipboard()).rejects.toThrow('Clipboard is empty or contains non-text data.');
  });

  // 7. Typing Queue management
  it('supports adding, retrieving, and clearing items in the typing queue', () => {
    controller.addToQueue('Block 1');
    controller.addToQueue('Block 2');
    expect(controller.getQueue()).toEqual(['Block 1', 'Block 2']);
    controller.clearQueue();
    expect(controller.getQueue()).toEqual([]);
  });

  // 8. Reusable Templates system
  it('loads default templates and renders variables accurately', () => {
    const templates = controller.getTemplates();
    expect(templates.length).toBeGreaterThan(0);
    const emailTpl = templates.find((t) => t.id === 'tpl_email_ack')!;
    const rendered = controller.renderTemplate(emailTpl.id, {
      name: 'Charan',
      topic: 'TypeFlow Deployment',
      sender: 'FRIDAY',
    });
    expect(rendered).toContain('Hi Charan,');
    expect(rendered).toContain('TypeFlow Deployment');
    expect(rendered).toContain('FRIDAY');
  });

  // 9. AI Content Classification
  it('classifies various content types correctly', () => {
    expect(typeFlowAi.classifyContent('What is the time complexity of QuickSort?')).toBe('question');
    expect(typeFlowAi.classifyContent('const express = require("express");\napp.listen(3000);')).toBe('source_code');
    expect(typeFlowAi.classifyContent('TypeError: Cannot read properties of undefined (reading "map")')).toBe('error_message');
    expect(typeFlowAi.classifyContent('Hi Team,\nPlease find attached notes.\nThanks.')).toBe('email');
    expect(typeFlowAi.classifyContent('2 + 3 * (4 - 1) = 11')).toBe('math');
  });

  // 10. Natural-Language Voice Commands Router
  it('routes "type my clipboard" via Fast Local Intent', async () => {
    mockClipboard.writeText('Simulated Clipboard Text');
    const result = await fastLocalIntentRouter.tryRoute('Hey Friday, type my clipboard', 'en-US');
    expect(result).not.toBeNull();
    expect(result?.intent).toBe('typeflow');
    expect(result?.matched).toBe(true);
  });

  it('routes "read the selected text" via Fast Local Intent', async () => {
    const result = await fastLocalIntentRouter.tryRoute('Friday, read the selected text', 'en-US');
    expect(result).not.toBeNull();
    expect(result?.intent).toBe('typeflow');
  });

  it('routes "pause typing", "resume typing", and "cancel typing" commands', async () => {
    const pauseRes = await fastLocalIntentRouter.tryRoute('Friday, pause typing', 'en-US');
    expect(pauseRes?.intent).toBe('typeflow');
    expect(pauseRes?.matched).toBe(true);

    const resumeRes = await fastLocalIntentRouter.tryRoute('Friday, resume typing', 'en-US');
    expect(resumeRes?.intent).toBe('typeflow');
    expect(resumeRes?.matched).toBe(true);

    const cancelRes = await fastLocalIntentRouter.tryRoute('Friday, cancel the session', 'en-US');
    expect(cancelRes?.intent).toBe('typeflow');
    expect(cancelRes?.matched).toBe(true);
  });

  it('routes "type this in Notepad" directly to TypeFlow', async () => {
    mockClipboard.writeText('Direct Notepad Text');
    const result = await fastLocalIntentRouter.tryRoute('Friday, type this in Notepad', 'en-US');
    expect(result).not.toBeNull();
    expect(result?.intent).toBe('typeflow');
    expect(result?.matched).toBe(true);
  });

  // 11. Target Validation & Security Safeguards
  it('blocks typing when target window is marked as password or examination browser', async () => {
    const passwordTarget = {
      hwnd: 1234,
      title: 'Sign In',
      process: 'login.exe',
      isPassword: true,
    };
    const validation = await typeFlowService.validateTarget(passwordTarget);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('password');

    const examTarget = {
      hwnd: 5678,
      title: 'Online Exam Proctored',
      process: 'examora.exe',
      isPassword: false,
    };
    const examValidation = await typeFlowService.validateTarget(examTarget);
    expect(examValidation.valid).toBe(false);
    expect(examValidation.reason).toContain('restricted');
  });

  // 12. Active Context state management
  it('manages and clears active selection context cleanly', () => {
    controller.setActiveContext('Sample problem text', 'CodeEditor.exe');
    expect(controller.getActiveContext()?.selectedText).toBe('Sample problem text');
    controller.clearContext();
    expect(controller.getActiveContext()).toBeNull();
  });
});
