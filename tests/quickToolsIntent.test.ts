import { describe, it, expect } from 'vitest';
import { fastLocalIntentRouter } from '../src/services/agent/fastLocalIntent';
import { toolRegistry } from '../src/services/agent/toolRegistry';

describe('Fast Local Intent & Tool Registry — QuickTools Phase 1', () => {
  it('routes "clean my desktop" and "organise my desktop"', async () => {
    const res1 = await fastLocalIntentRouter.tryRoute('clean my desktop');
    expect(res1?.matched).toBe(true);
    expect(res1?.intent).toBe('quicktools');
    expect(res1?.toolCalls?.[0]?.toolName).toBe('organize_desktop_folder');

    const res2 = await fastLocalIntentRouter.tryRoute('Friday, organise my desktop');
    expect(res2?.matched).toBe(true);
    expect(res2?.intent).toBe('quicktools');
  });

  it('routes "organise my downloads"', async () => {
    const res = await fastLocalIntentRouter.tryRoute('organise my downloads');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0]?.args?.target).toBe('downloads');
  });

  it('routes "move all pdfs into documents"', async () => {
    const res = await fastLocalIntentRouter.tryRoute('move all pdfs into documents');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0]?.args?.category_filter).toBe('Documents');
  });

  it('routes "organise my screenshots"', async () => {
    const res = await fastLocalIntentRouter.tryRoute('organise my screenshots');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0]?.args?.category_filter).toBe('Screenshots');
  });

  it('routes "find duplicate files"', async () => {
    const res = await fastLocalIntentRouter.tryRoute('Friday, find duplicate files');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0]?.toolName).toBe('find_duplicate_files');
  });

  it('routes "undo organization"', async () => {
    const res = await fastLocalIntentRouter.tryRoute('undo organization');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0]?.args?.action).toBe('undo');
  });

  it('routes "show my clipboard history"', async () => {
    const res = await fastLocalIntentRouter.tryRoute('show my clipboard history');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0]?.toolName).toBe('manage_clipboard_history');
  });

  it('routes "clear clipboard"', async () => {
    const res = await fastLocalIntentRouter.tryRoute('clear my clipboard');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0]?.args?.action).toBe('clear');
  });

  it('routes "list snippets" and "expand snippet mail"', async () => {
    const res1 = await fastLocalIntentRouter.tryRoute('list snippets');
    expect(res1?.matched).toBe(true);
    expect(res1?.intent).toBe('quicktools');

    const res2 = await fastLocalIntentRouter.tryRoute('insert snippet mail');
    expect(res2?.matched).toBe(true);
    expect(res2?.intent).toBe('quicktools');
    expect(res2?.toolCalls?.[0]?.args?.action).toBe('expand');
  });

  it('executes quick tools via toolRegistry', async () => {
    // organize preview
    const previewRes = await toolRegistry.executeTool('organize_desktop_folder', {
      target: 'desktop',
      action: 'preview',
    });
    expect(previewRes?.success).toBe(true);
    expect(previewRes?.mode).toBe('preview');

    // duplicates
    const dupRes = await toolRegistry.executeTool('find_duplicate_files', {
      target: 'downloads',
    });
    expect(dupRes?.success).toBe(true);

    // clipboard list
    const clipRes = await toolRegistry.executeTool('manage_clipboard_history', {
      action: 'list',
    });
    expect(clipRes?.success).toBe(true);

    // snippets list
    const snipRes = await toolRegistry.executeTool('manage_text_snippets', {
      action: 'list',
    });
    expect(snipRes?.success).toBe(true);
  });
});
