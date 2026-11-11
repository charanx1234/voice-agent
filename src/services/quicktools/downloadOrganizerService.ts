import fs from 'fs';
import path from 'path';
import os from 'os';
import { quickActionsService } from './quickActionsService';
import { QuickActionPreview, QuickActionBatchResult } from '../../shared/types';

export class DownloadOrganizerService {
  public getDownloadsPath(): string {
    return path.join(os.homedir(), 'Downloads');
  }

  public previewDownloads(excludedExtensions: string[] = []): QuickActionPreview {
    const downloads = this.getDownloadsPath();
    const preview = quickActionsService.generatePreview(downloads);

    if (excludedExtensions.length > 0) {
      const exts = new Set(
        excludedExtensions.map((e) => (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`))
      );
      preview.proposedMoves = preview.proposedMoves.filter(
        (m) => !exts.has(path.extname(m.fileName).toLowerCase())
      );
      preview.totalFiles = preview.proposedMoves.length;
    }

    return preview;
  }

  public organizeDownloads(preview: QuickActionPreview): QuickActionBatchResult {
    return quickActionsService.executeOrganize(preview);
  }

  public undoLastDownloadsOrganize() {
    return quickActionsService.undoLastOrganize();
  }
}

export const downloadOrganizerService = new DownloadOrganizerService();
