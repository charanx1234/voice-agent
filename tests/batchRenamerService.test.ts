import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BatchRenamerService } from '../src/services/quicktools/batchRenamerService';

describe('BatchRenamerService', () => {
  let tempDir: string;
  let historyFile: string;
  let renamer: BatchRenamerService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renamer-test-'));
    historyFile = path.join(tempDir, 'history.json');
    renamer = new BatchRenamerService(historyFile);

    // Create mock files
    fs.writeFileSync(path.join(tempDir, 'photo_a.jpg'), 'image a');
    fs.writeFileSync(path.join(tempDir, 'photo_b.jpg'), 'image b');
    fs.writeFileSync(path.join(tempDir, 'doc.txt'), 'document text');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('generates a preview with prefix and sequential numbering', () => {
    const preview = renamer.generatePreview({
      folderPath: tempDir,
      prefix: 'Vacation_',
      addNumber: true,
      pattern: '.jpg',
    });

    expect(preview.totalFiles).toBe(2);
    expect(preview.items.some((i) => i.proposedName === 'Vacation_photo_a_001.jpg')).toBe(true);
    expect(preview.items.some((i) => i.proposedName === 'Vacation_photo_b_002.jpg')).toBe(true);
  });

  it('generates search and replace renaming preview', () => {
    const preview = renamer.generatePreview({
      folderPath: tempDir,
      findText: 'photo',
      replaceText: 'pic',
    });

    expect(preview.items.some((i) => i.proposedName === 'pic_a.jpg')).toBe(true);
    expect(preview.items.some((i) => i.proposedName === 'pic_b.jpg')).toBe(true);
    expect(preview.items.some((i) => i.originalName === 'doc.txt' && i.proposedName === 'doc.txt')).toBe(true);
  });

  it('executes renaming and records undo history safely', () => {
    const preview = renamer.generatePreview({
      folderPath: tempDir,
      prefix: 'Renamed_',
      pattern: '.jpg',
    });

    const result = renamer.executeRename(preview);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);

    // Check files on disk
    expect(fs.existsSync(path.join(tempDir, 'Renamed_photo_a.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'photo_a.jpg'))).toBe(false);

    // Revert with undo
    const undoResult = renamer.undoLastRename();
    expect(undoResult.success).toBe(true);
    expect(undoResult.restoredCount).toBe(2);

    expect(fs.existsSync(path.join(tempDir, 'photo_a.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'Renamed_photo_a.jpg'))).toBe(false);
  });

  it('handles name collisions gracefully by appending index', () => {
    // photo_b renamed to photo_a (which already exists on disk)
    const preview = renamer.generatePreview({
      folderPath: tempDir,
      findText: 'photo_b',
      replaceText: 'photo_a',
      pattern: '.jpg',
    });

    // Should detect collision and auto-resolve
    expect(preview.conflictCount).toBeGreaterThanOrEqual(1);
    const result = renamer.executeRename(preview);
    expect(result.successCount).toBe(1);
  });
});
