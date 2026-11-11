import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  BatchRenameRule,
  BatchRenamePreview,
  BatchRenameResult,
  RenameProposedItem,
} from '../../shared/types';

interface RenameHistoryRecord {
  batchId: string;
  timestamp: string;
  folderPath: string;
  renames: Array<{ originalPath: string; newPath: string }>;
  undone?: boolean;
}

export class BatchRenamerService {
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
      this.historyFile = path.join(dir, 'renamer_history.json');
    }
  }

  public generatePreview(rule: BatchRenameRule): BatchRenamePreview {
    let folder = rule.folderPath;
    if (folder.toLowerCase() === 'desktop') {
      folder = path.join(os.homedir(), 'Desktop');
    } else if (folder.toLowerCase() === 'downloads') {
      folder = path.join(os.homedir(), 'Downloads');
    }

    if (!fs.existsSync(folder)) {
      throw new Error(`Directory "${folder}" does not exist.`);
    }

    const items: RenameProposedItem[] = [];
    const entries = fs.readdirSync(folder, { withFileTypes: true });

    // Filter files
    let fileEntries = entries.filter((e) => e.isFile());
    if (rule.pattern) {
      const p = rule.pattern.toLowerCase().replace('*', '');
      fileEntries = fileEntries.filter((e) => e.name.toLowerCase().endsWith(p));
    }

    let counter = rule.startNumber !== undefined ? rule.startNumber : 1;
    const padding = rule.numberPadding || 3;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const findTarget = (rule as any).findText || rule.replaceText;
    const replacement = (rule as any).findText ? (rule as any).replaceText : (rule.replaceWith || '');
    const isSequential = rule.sequentialNumbering || Boolean((rule as any).addNumber);
    const isDate = rule.datePrefix || Boolean((rule as any).addDate);

    const plannedNewNames = new Set<string>();
    let conflictCount = 0;

    for (const entry of fileEntries) {
      const ext = path.extname(entry.name);
      let base = path.basename(entry.name, ext);

      // 1. Text replacement
      if (findTarget) {
        base = base.split(findTarget).join(replacement || '');
      }

      // 2. Case transformation
      if (rule.changeCase === 'lowercase') {
        base = base.toLowerCase();
      } else if (rule.changeCase === 'uppercase') {
        base = base.toUpperCase();
      } else if (rule.changeCase === 'titlecase') {
        base = base.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
      }

      // 3. Sequential numbering
      if (isSequential) {
        const numStr = String(counter).padStart(padding, '0');
        base = `${base}_${numStr}`;
        counter++;
      }

      // 4. Prefix & Suffix
      if (isDate) {
        base = `${today}_${base}`;
      }
      if (rule.prefix) {
        base = `${rule.prefix}${base}`;
      }
      if (rule.suffix) {
        base = `${base}${rule.suffix}`;
      }

      let newFileName = `${base}${ext}`;
      let sourcePath = path.join(folder, entry.name);
      let destinationPath = path.join(folder, newFileName);

      // Check collision
      let collision = false;
      let status = 'ready';
      if (entry.name !== newFileName) {
        if (fs.existsSync(destinationPath) || plannedNewNames.has(newFileName.toLowerCase())) {
          collision = true;
          conflictCount++;
          // Auto resolve by indexing if collision
          let cIdx = 1;
          while (fs.existsSync(destinationPath) || plannedNewNames.has(newFileName.toLowerCase())) {
            newFileName = `${base}_${cIdx}${ext}`;
            destinationPath = path.join(rule.folderPath, newFileName);
            cIdx++;
          }
          status = 'conflict_resolved';
          collision = false; // Resolved safely
        }
      }

      plannedNewNames.add(newFileName.toLowerCase());

      items.push({
        originalName: entry.name,
        newName: newFileName,
        proposedName: newFileName,
        sourcePath,
        destinationPath,
        collision,
        status,
      } as any);
    }

    return {
      folderPath: rule.folderPath,
      items,
      totalFiles: items.length,
      conflictCount,
    };
  }

  public executeRename(preview: BatchRenamePreview): BatchRenameResult {
    const batchId = `ren_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = new Date().toISOString();
    const successfulRenames: Array<{ originalPath: string; newPath: string }> = [];
    const errors: Array<{ file: string; error: string }> = [];

    // Filter out items that didn't change name or have collisions
    const toRename = preview.items.filter(
      (item) => item.originalName !== item.newName && !item.collision
    );

    for (const item of toRename) {
      try {
        if (!fs.existsSync(item.sourcePath)) {
          errors.push({ file: item.originalName, error: 'Source file no longer exists.' });
          continue;
        }

        fs.renameSync(item.sourcePath, item.destinationPath);
        successfulRenames.push({
          originalPath: item.sourcePath,
          newPath: item.destinationPath,
        });
      } catch (err: any) {
        errors.push({ file: item.originalName, error: err?.message || 'Rename failed' });
      }
    }

    if (successfulRenames.length > 0) {
      this.recordHistory({
        batchId,
        timestamp,
        folderPath: preview.folderPath,
        renames: successfulRenames,
      });
    }

    return {
      batchId,
      timestamp,
      folderPath: preview.folderPath,
      renamedCount: successfulRenames.length,
      successCount: successfulRenames.length,
      failureCount: errors.length,
      items: successfulRenames,
      errors,
    } as any;
  }

  public undoLastRename(): { success: boolean; restoredCount: number; message: string } {
    const history = this.loadHistory();
    const lastRecord = history.reverse().find((r) => !r.undone && r.renames.length > 0);

    if (!lastRecord) {
      return { success: false, restoredCount: 0, message: 'No rename history available to undo.' };
    }

    let restoredCount = 0;
    const remaining: Array<{ originalPath: string; newPath: string }> = [];

    for (const ren of lastRecord.renames) {
      try {
        if (fs.existsSync(ren.newPath)) {
          fs.renameSync(ren.newPath, ren.originalPath);
          restoredCount++;
        }
      } catch {
        remaining.push(ren);
      }
    }

    lastRecord.undone = true;
    lastRecord.renames = remaining;
    this.saveHistory(history.reverse());

    return {
      success: true,
      restoredCount,
      message: `Successfully reverted ${restoredCount} renamed file(s).`,
    };
  }

  private loadHistory(): RenameHistoryRecord[] {
    try {
      if (fs.existsSync(this.historyFile)) {
        const raw = fs.readFileSync(this.historyFile, 'utf8');
        return JSON.parse(raw);
      }
    } catch {}
    return [];
  }

  private saveHistory(records: RenameHistoryRecord[]): void {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(records.slice(-50), null, 2), 'utf8');
    } catch {}
  }

  private recordHistory(record: RenameHistoryRecord): void {
    const history = this.loadHistory();
    history.push(record);
    this.saveHistory(history);
  }
}

export const batchRenamerService = new BatchRenamerService();
