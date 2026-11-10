import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { QuickActionsService } from '../src/services/quicktools/quickActionsService';

describe('QuickActionsService', () => {
  let tempDir: string;
  let testHistoryFile: string;
  let service: QuickActionsService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'friday_quickactions_test_'));
    testHistoryFile = path.join(tempDir, 'history.json');
    service = new QuickActionsService(testHistoryFile);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('classifies files correctly by extension and filename', () => {
    expect(service.classifyFile('report.pdf')).toBe('Documents');
    expect(service.classifyFile('budget.xlsx')).toBe('Documents');
    expect(service.classifyFile('vacation.jpg')).toBe('Images');
    expect(service.classifyFile('Screenshot 2026-11-10.png')).toBe('Screenshots');
    expect(service.classifyFile('Snip_image.jpeg')).toBe('Screenshots');
    expect(service.classifyFile('tutorial.mp4')).toBe('Videos');
    expect(service.classifyFile('podcast.mp3')).toBe('Audio');
    expect(service.classifyFile('archive.zip')).toBe('Archives');
    expect(service.classifyFile('script.py')).toBe('Code');
    expect(service.classifyFile('installer.exe')).toBe('Executables');
    expect(service.classifyFile('unknown.xyzabc')).toBe('Others');
  });

  it('generates non-destructive preview and executes organization with undo', () => {
    // Create test loose files
    const file1 = path.join(tempDir, 'doc1.pdf');
    const file2 = path.join(tempDir, 'photo.png');
    const file3 = path.join(tempDir, 'song.mp3');
    fs.writeFileSync(file1, 'pdf content');
    fs.writeFileSync(file2, 'image bytes');
    fs.writeFileSync(file3, 'audio bytes');

    // Generate preview
    const preview = service.generatePreview(tempDir);
    expect(preview.totalFiles).toBe(3);
    expect(preview.categoryCounts.Documents).toBe(1);
    expect(preview.categoryCounts.Images).toBe(1);
    expect(preview.categoryCounts.Audio).toBe(1);

    // Execute organize
    const result = service.executeOrganize(preview);
    expect(result.successCount).toBe(3);
    expect(result.failureCount).toBe(0);

    // Verify files moved to Organized/Category
    expect(fs.existsSync(file1)).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'Organized', 'Documents', 'doc1.pdf'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'Organized', 'Images', 'photo.png'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'Organized', 'Audio', 'song.mp3'))).toBe(true);

    // Test Undo
    const undoRes = service.undoLastOrganize();
    expect(undoRes.success).toBe(true);
    expect(undoRes.restoredCount).toBe(3);

    // Verify files are back in root tempDir
    expect(fs.existsSync(file1)).toBe(true);
    expect(fs.existsSync(file2)).toBe(true);
    expect(fs.existsSync(file3)).toBe(true);
  });

  it('handles duplicate file collision safely without overwriting', () => {
    // Pre-create destination file
    const destDir = path.join(tempDir, 'Organized', 'Documents');
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'notes.txt'), 'original content');

    // Create source file with same name
    const sourceFile = path.join(tempDir, 'notes.txt');
    fs.writeFileSync(sourceFile, 'new content');

    const preview = service.generatePreview(tempDir);
    const result = service.executeOrganize(preview);
    expect(result.successCount).toBe(1);

    // Both files must exist safely
    expect(fs.existsSync(path.join(destDir, 'notes.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(destDir, 'notes.txt'), 'utf8')).toBe('original content');

    expect(fs.existsSync(path.join(destDir, 'notes (1).txt'))).toBe(true);
    expect(fs.readFileSync(path.join(destDir, 'notes (1).txt'), 'utf8')).toBe('new content');
  });

  it('detects duplicate files by size and hash', () => {
    const original = path.join(tempDir, 'report.docx');
    const copy1 = path.join(tempDir, 'report_copy.docx');
    const unique = path.join(tempDir, 'other.docx');

    const sharedContent = 'This is identical file content across two files';
    fs.writeFileSync(original, sharedContent);
    fs.writeFileSync(copy1, sharedContent);
    fs.writeFileSync(unique, 'Different content completely');

    const dupResult = service.findDuplicates(tempDir);
    expect(dupResult.duplicateGroups.length).toBe(1);
    expect(dupResult.duplicateGroups[0].files.length).toBe(2);
    expect(dupResult.wastedBytes).toBe(Buffer.byteLength(sharedContent));
  });
});
