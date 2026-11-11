import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { FileFinderService } from '../src/services/quicktools/fileFinderService';

describe('FileFinderService', () => {
  let tempDir: string;
  let finder: FileFinderService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finder-test-'));
    finder = new FileFinderService();

    // Create nested mock files
    fs.writeFileSync(path.join(tempDir, 'quarterly_report.pdf'), 'binary pdf content');
    fs.writeFileSync(path.join(tempDir, 'notes.txt'), 'Secret API Key inside this document');
    const sub = path.join(tempDir, 'subfolder');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'project_invoice.docx'), 'invoice document');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('searches files by query name', () => {
    const result = finder.searchFiles({
      folderPath: tempDir,
      query: 'report',
    });

    expect(result.totalMatches).toBe(1);
    expect(result.results[0].fileName).toBe('quarterly_report.pdf');
  });

  it('filters files by extension', () => {
    const result = finder.searchFiles({
      folderPath: tempDir,
      extension: 'docx',
    });

    expect(result.totalMatches).toBe(1);
    expect(result.results[0].fileName).toBe('project_invoice.docx');
  });

  it('searches inside file content when searchContent is true', () => {
    const result = finder.searchFiles({
      folderPath: tempDir,
      query: 'Secret API Key',
      searchContent: true,
    });

    expect(result.totalMatches).toBe(1);
    expect(result.results[0].fileName).toBe('notes.txt');
    expect(result.results[0].previewSnippet).toBeDefined();
    expect(result.results[0].previewSnippet).toContain('Secret API Key');
  });
});
