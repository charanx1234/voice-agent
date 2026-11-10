import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ClipboardHistoryService } from '../src/services/quicktools/clipboardHistoryService';

describe('ClipboardHistoryService', () => {
  let tempDir: string;
  let testHistoryFile: string;
  let service: ClipboardHistoryService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'friday_clipboard_test_'));
    testHistoryFile = path.join(tempDir, 'clipboard.json');
    service = new ClipboardHistoryService(testHistoryFile, 10);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('adds non-sensitive text and maintains history order', () => {
    const item1 = service.addText('First copied line');
    const item2 = service.addText('https://github.com/charanx1234/voice-agent');

    expect(item1).toBeDefined();
    expect(item2).toBeDefined();
    expect(item2?.isUrl).toBe(true);

    const items = service.getItems();
    expect(items.length).toBe(2);
    expect(items[0].text).toBe('https://github.com/charanx1234/voice-agent');
    expect(items[1].text).toBe('First copied line');
  });

  it('filters out sensitive data like JWTs, API keys, passwords, and bearer tokens', () => {
    // Sensitive JWT
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0';
    expect(service.isSensitive(jwt)).toBe(true);
    expect(service.addText(jwt)).toBeNull();

    // Sensitive Bearer token
    expect(service.isSensitive('Bearer abcdef1234567890qwertyuiop')).toBe(true);
    expect(service.addText('Bearer abcdef1234567890qwertyuiop')).toBeNull();

    // Sensitive API key
    expect(service.isSensitive('api_key=AIzaSyA12345678901234567890123456789012')).toBe(true);
    expect(service.addText('api_key=AIzaSyA12345678901234567890123456789012')).toBeNull();

    // Sensitive Password label
    expect(service.isSensitive('password = MySecret1234!')).toBe(true);
    expect(service.addText('password = MySecret1234!')).toBeNull();

    // Regular text should pass through
    expect(service.isSensitive('Just a normal note or email draft')).toBe(false);
    expect(service.addText('Just a normal note or email draft')).not.toBeNull();
  });

  it('pins, deletes, and clears unpinned clipboard items', () => {
    const item1 = service.addText('Item 1')!;
    const item2 = service.addText('Item 2')!;
    const item3 = service.addText('Item 3')!;

    // Pin item 2
    service.togglePin(item2.id);
    let items = service.getItems();
    const pinned = items.find((i) => i.id === item2.id);
    expect(pinned?.isPinned).toBe(true);

    // Delete item 1
    service.deleteItem(item1.id);
    items = service.getItems();
    expect(items.some((i) => i.id === item1.id)).toBe(false);

    // Clear history: pinned items must be preserved!
    service.clearHistory();
    items = service.getItems();
    expect(items.length).toBe(1);
    expect(items[0].id).toBe(item2.id);
  });

  it('searches clipboard history by text keyword', () => {
    service.addText('Meeting at 5 PM with team');
    service.addText('Grocery shopping list: milk, eggs, bread');
    service.addText('Bug report in SQLite memory service');

    const searchResults = service.search('grocery');
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].text).toContain('Grocery');

    const noMatches = service.search('nonexistent_query_xyz');
    expect(noMatches.length).toBe(0);
  });
});
