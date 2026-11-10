import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  FileCategory,
  ProposedFileMove,
  QuickActionPreview,
  QuickActionBatchResult,
  DuplicateScanResult,
  DuplicateFileGroup,
} from '../../shared/types';

interface HistoryJournalRecord {
  batchId: string;
  timestamp: string;
  targetFolder: string;
  moves: Array<{ source: string; destination: string }>;
  undone?: boolean;
}

const CATEGORY_EXTENSIONS: Record<FileCategory, string[]> = {
  Screenshots: [], // Evaluated dynamically by filename
  Documents: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.epub', '.pages'],
  Images: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.heic'],
  Videos: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'],
  Audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'],
  Archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso'],
  Code: ['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.cs', '.html', '.css', '.json', '.xml', '.sql', '.md', '.sh', '.yml', '.yaml'],
  Executables: ['.exe', '.msi', '.bat', '.cmd', '.ps1', '.apk'],
  Others: [],
};

const IGNORED_NAMES = new Set(['desktop.ini', 'thumbs.db', '.ds_store', 'organized']);

export class QuickActionsService {
  private historyFile: string;

  constructor(customHistoryPath?: string) {
    if (customHistoryPath) {
      this.historyFile = customHistoryPath;
    } else {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const dir = path.join(appData, 'friday-ai-companion');
      if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      }
      this.historyFile = path.join(dir, 'quicktools_history.json');
    }
  }

  public getDesktopPath(): string {
    const defaultDesktop = path.join(os.homedir(), 'Desktop');
    const oneDriveDesktop = path.join(os.homedir(), 'OneDrive', 'Desktop');
    if (fs.existsSync(oneDriveDesktop)) return oneDriveDesktop;
    return defaultDesktop;
  }

  public getDownloadsPath(): string {
    return path.join(os.homedir(), 'Downloads');
  }

  public classifyFile(fileName: string): FileCategory {
    const ext = path.extname(fileName).toLowerCase();
    const base = path.basename(fileName, ext).toLowerCase();

    // Check if screenshot
    if (
      (base.startsWith('screenshot') ||
        base.startsWith('screen shot') ||
        base.startsWith('snip') ||
        base.startsWith('capture')) &&
      CATEGORY_EXTENSIONS.Images.includes(ext)
    ) {
      return 'Screenshots';
    }

    for (const [category, extensions] of Object.entries(CATEGORY_EXTENSIONS) as [FileCategory, string[]][]) {
      if (category === 'Screenshots' || category === 'Others') continue;
      if (extensions.includes(ext)) {
        return category;
      }
    }

    return 'Others';
  }

  public generatePreview(targetFolder: string): QuickActionPreview {
    if (!fs.existsSync(targetFolder)) {
      throw new Error(`Target directory "${targetFolder}" does not exist.`);
    }

    const proposedMoves: ProposedFileMove[] = [];
    const categoryCounts: Record<string, number> = {};
    let totalBytes = 0;

    const entries = fs.readdirSync(targetFolder, { withFileTypes: true });

    for (const entry of entries) {
      // Do not organize subdirectories or protected system files or shortcuts
      if (entry.isDirectory()) continue;
      if (IGNORED_NAMES.has(entry.name.toLowerCase())) continue;
      if (entry.name.toLowerCase().endsWith('.lnk')) continue;

      const sourcePath = path.join(targetFolder, entry.name);
      try {
        const stats = fs.statSync(sourcePath);
        if (!stats.isFile()) continue;

        const category = this.classifyFile(entry.name);
        const destinationDir = path.join(targetFolder, 'Organized', category);
        const destinationPath = this.getUniqueDestinationPath(destinationDir, entry.name);

        proposedMoves.push({
          fileName: entry.name,
          sourcePath,
          destinationPath,
          category,
          fileSize: stats.size,
        });

        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        totalBytes += stats.size;
      } catch {}
    }

    return {
      targetFolder,
      proposedMoves,
      categoryCounts,
      totalFiles: proposedMoves.length,
      totalBytes,
    };
  }

  public executeOrganize(preview: QuickActionPreview): QuickActionBatchResult {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = new Date().toISOString();
    const movedFiles: Array<{ source: string; destination: string }> = [];
    const errors: Array<{ file: string; error: string }> = [];

    for (const item of preview.proposedMoves) {
      try {
        if (!fs.existsSync(item.sourcePath)) {
          errors.push({ file: item.fileName, error: 'Source file no longer exists.' });
          continue;
        }

        const destDir = path.dirname(item.destinationPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        // Avoid overwrite if a file appeared meanwhile
        const safeDestination = fs.existsSync(item.destinationPath)
          ? this.getUniqueDestinationPath(destDir, item.fileName)
          : item.destinationPath;

        fs.renameSync(item.sourcePath, safeDestination);
        movedFiles.push({ source: item.sourcePath, destination: safeDestination });
      } catch (err: any) {
        errors.push({ file: item.fileName, error: err?.message || 'Move failed' });
      }
    }

    if (movedFiles.length > 0) {
      this.recordHistory({
        batchId,
        timestamp,
        targetFolder: preview.targetFolder,
        moves: movedFiles,
      });
    }

    return {
      batchId,
      timestamp,
      targetFolder: preview.targetFolder,
      successCount: movedFiles.length,
      failureCount: errors.length,
      movedFiles,
      errors,
    };
  }

  public undoLastOrganize(): { success: boolean; restoredCount: number; message: string } {
    const history = this.loadHistory();
    const lastRecord = history.reverse().find((r) => !r.undone && r.moves.length > 0);

    if (!lastRecord) {
      return { success: false, restoredCount: 0, message: 'No organization history found to undo.' };
    }

    let restoredCount = 0;
    const remainingMoves: Array<{ source: string; destination: string }> = [];

    for (const move of lastRecord.moves) {
      try {
        if (fs.existsSync(move.destination)) {
          const originalDir = path.dirname(move.source);
          if (!fs.existsSync(originalDir)) {
            fs.mkdirSync(originalDir, { recursive: true });
          }

          const safeRestorePath = fs.existsSync(move.source)
            ? this.getUniqueDestinationPath(originalDir, path.basename(move.source))
            : move.source;

          fs.renameSync(move.destination, safeRestorePath);
          restoredCount++;
        }
      } catch {
        remainingMoves.push(move);
      }
    }

    // Mark as undone
    lastRecord.undone = true;
    lastRecord.moves = remainingMoves;
    this.saveHistory(history.reverse());

    return {
      success: true,
      restoredCount,
      message: `Successfully restored ${restoredCount} file(s) to original location.`,
    };
  }

  public findDuplicates(folderPath?: string): DuplicateScanResult {
    const target = folderPath || this.getDownloadsPath();
    if (!fs.existsSync(target)) {
      return { scannedCount: 0, duplicateGroups: [], wastedBytes: 0 };
    }

    const filesBySize = new Map<number, string[]>();
    let scannedCount = 0;

    const scanDirectory = (dir: string, depth = 0) => {
      if (depth > 2) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (IGNORED_NAMES.has(entry.name.toLowerCase())) continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDirectory(fullPath, depth + 1);
          } else if (entry.isFile()) {
            scannedCount++;
            const stats = fs.statSync(fullPath);
            if (stats.size > 0) {
              const list = filesBySize.get(stats.size) || [];
              list.push(fullPath);
              filesBySize.set(stats.size, list);
            }
          }
        }
      } catch {}
    };

    scanDirectory(target);

    const duplicateGroups: DuplicateFileGroup[] = [];
    let wastedBytes = 0;

    for (const [size, files] of filesBySize.entries()) {
      if (files.length < 2) continue;

      const hashes = new Map<string, string[]>();
      for (const file of files) {
        try {
          const hash = this.calculateFileHash(file);
          const group = hashes.get(hash) || [];
          group.push(file);
          hashes.set(hash, group);
        } catch {}
      }

      for (const [hash, matchingFiles] of hashes.entries()) {
        if (matchingFiles.length > 1) {
          duplicateGroups.push({
            hash,
            size,
            files: matchingFiles,
          });
          wastedBytes += size * (matchingFiles.length - 1);
        }
      }
    }

    return {
      scannedCount,
      duplicateGroups,
      wastedBytes,
    };
  }

  private calculateFileHash(filePath: string): string {
    const stats = fs.statSync(filePath);
    // For small files, hash entire file. For large files (> 5MB), sample chunks to keep it fast
    if (stats.size <= 5 * 1024 * 1024) {
      const buf = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(buf).digest('hex');
    }

    const fd = fs.openSync(filePath, 'r');
    try {
      const hash = crypto.createHash('sha256');
      hash.update(stats.size.toString());
      const buffer = Buffer.alloc(64 * 1024);
      // Read header
      const read1 = fs.readSync(fd, buffer, 0, buffer.length, 0);
      hash.update(buffer.subarray(0, read1));
      // Read middle
      const middlePos = Math.floor(stats.size / 2);
      const read2 = fs.readSync(fd, buffer, 0, buffer.length, middlePos);
      hash.update(buffer.subarray(0, read2));
      // Read footer
      const footerPos = Math.max(0, stats.size - buffer.length);
      const read3 = fs.readSync(fd, buffer, 0, buffer.length, footerPos);
      hash.update(buffer.subarray(0, read3));
      return hash.digest('hex');
    } finally {
      fs.closeSync(fd);
    }
  }

  private getUniqueDestinationPath(destDir: string, originalFileName: string): string {
    const ext = path.extname(originalFileName);
    const base = path.basename(originalFileName, ext);
    let candidate = path.join(destDir, originalFileName);
    let counter = 1;

    while (fs.existsSync(candidate)) {
      candidate = path.join(destDir, `${base} (${counter})${ext}`);
      counter++;
    }

    return candidate;
  }

  private loadHistory(): HistoryJournalRecord[] {
    try {
      if (fs.existsSync(this.historyFile)) {
        const raw = fs.readFileSync(this.historyFile, 'utf8');
        return JSON.parse(raw);
      }
    } catch {}
    return [];
  }

  private saveHistory(records: HistoryJournalRecord[]): void {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(records.slice(-50), null, 2), 'utf8');
    } catch {}
  }

  private recordHistory(record: HistoryJournalRecord): void {
    const history = this.loadHistory();
    history.push(record);
    this.saveHistory(history);
  }
}

export const quickActionsService = new QuickActionsService();
