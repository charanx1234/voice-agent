import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SnippetsService } from '../src/services/quicktools/snippetsService';

describe('SnippetsService', () => {
  let tempDir: string;
  let testSnippetsFile: string;
  let service: SnippetsService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'friday_snippets_test_'));
    testSnippetsFile = path.join(tempDir, 'snippets.json');
    service = new SnippetsService(testSnippetsFile);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('loads default snippets on first run', () => {
    const list = service.getSnippets();
    expect(list.length).toBeGreaterThan(0);
    const mailSnip = service.getSnippetByShortcut(';mail');
    expect(mailSnip).toBeDefined();
    expect(mailSnip?.content).toContain('{name}');
  });

  it('saves and normalizes shortcuts with leading semicolon', () => {
    const created = service.saveSnippet({
      shortcut: 'phone2',
      title: 'Secondary Phone',
      content: '+91 99999 88888',
      tags: ['contact'],
    });

    expect(created.shortcut).toBe(';phone2');

    // Retrieve by shortcut with or without semicolon
    expect(service.getSnippetByShortcut(';phone2')).toBeDefined();
    expect(service.getSnippetByShortcut('phone2')).toBeDefined();
  });

  it('expands placeholders dynamically', () => {
    service.saveSnippet({
      shortcut: ';greeting',
      title: 'Personal Greeting',
      content: 'Hello {name}, today is {date} and the topic is {subject}.',
      tags: ['test'],
    });

    const expanded = service.expandSnippet(';greeting', {
      name: 'Charan',
      subject: 'FRIDAY QuickTools',
      date: 'November 10, 2026',
    });

    expect(expanded.success).toBe(true);
    expect(expanded.expandedText).toBe(
      'Hello Charan, today is November 10, 2026 and the topic is FRIDAY QuickTools.'
    );
  });

  it('deletes snippets cleanly', () => {
    const created = service.saveSnippet({
      shortcut: ';temp',
      title: 'Temporary',
      content: 'Temp text',
      tags: [],
    });

    expect(service.getSnippetById(created.id)).toBeDefined();
    const deleted = service.deleteSnippet(created.id);
    expect(deleted).toBe(true);
    expect(service.getSnippetById(created.id)).toBeUndefined();
  });
});
