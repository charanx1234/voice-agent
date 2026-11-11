import fs from 'fs';
import path from 'path';
import os from 'os';
import { FileSearchCriteria, FileSearchResult, FileSearchResultItem } from '../../shared/types';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.vscode',
  '$recycle.bin',
  'system volume information',
  'appdata',
  'program files',
  'program files (x86)',
  'windows',
  'dist',
  'dist-electron',
  'dist-renderer',
  'dist-release',
]);

const TEXT_SEARCH_EXTS = new Set([
  '.txt',
  '.md',
  '.json',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.cs',
  '.html',
  '.css',
  '.csv',
  '.xml',
  '.sql',
  '.env',
  '.log',
]);

export class FileFinderService {
  public searchFiles(criteria: FileSearchCriteria, maxResults = 30): FileSearchResult {
    const results: FileSearchResultItem[] = [];
    let scannedCount = 0;
    const queryLower = (criteria.query || '').toLowerCase().trim();
    const extFilter = criteria.extension
      ? (criteria.extension.startsWith('.') ? criteria.extension : `.${criteria.extension}`).toLowerCase()
      : null;

    const cutoffDate = criteria.modifiedWithinDays
      ? new Date(Date.now() - criteria.modifiedWithinDays * 24 * 60 * 60 * 1000)
      : null;

    const minBytes = criteria.minSizeMb ? criteria.minSizeMb * 1024 * 1024 : 0;
    const maxBytes = criteria.maxSizeMb ? criteria.maxSizeMb * 1024 * 1024 : Infinity;

    // Search targets: specific folder or user standard work folders
    const targetDirs: string[] = [];
    if (criteria.folderPath && fs.existsSync(criteria.folderPath)) {
      targetDirs.push(criteria.folderPath);
    } else {
      const desktop = path.join(os.homedir(), 'Desktop');
      const downloads = path.join(os.homedir(), 'Downloads');
      const docs = path.join(os.homedir(), 'Documents');
      if (fs.existsSync(desktop)) targetDirs.push(desktop);
      if (fs.existsSync(downloads)) targetDirs.push(downloads);
      if (fs.existsSync(docs)) targetDirs.push(docs);
    }

    const traverse = (dir: string, depth = 0) => {
      // Limit depth to 2 and max scanned items to 300 to ensure fast sub-50ms execution
      if (depth > 2 || results.length >= maxResults || scannedCount >= 300) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (results.length >= maxResults || scannedCount >= 300) break;
          scannedCount++;

          const fullPath = path.join(dir, entry.name);
          const nameLower = entry.name.toLowerCase();

          if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(nameLower) && !entry.name.startsWith('.')) {
              traverse(fullPath, depth + 1);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();

            // Filter extension
            if (extFilter && ext !== extFilter) continue;

            try {
              const stats = fs.statSync(fullPath);

              // Filter size
              if (stats.size < minBytes || stats.size > maxBytes) continue;

              // Filter modified date
              if (cutoffDate && stats.mtime < cutoffDate) continue;

              let matches = false;
              let snippet: string | undefined = undefined;

              // Match by name
              if (!queryLower || nameLower.includes(queryLower)) {
                matches = true;
              }

              // Optional search in content for text files
              if (criteria.searchContent && queryLower && !matches && TEXT_SEARCH_EXTS.has(ext)) {
                try {
                  const content = fs.readFileSync(fullPath, 'utf8');
                  const idx = content.toLowerCase().indexOf(queryLower);
                  if (idx !== -1) {
                    matches = true;
                    const start = Math.max(0, idx - 30);
                    const end = Math.min(content.length, idx + queryLower.length + 30);
                    snippet = `...${content.slice(start, end).replace(/[\r\n]+/g, ' ')}...`;
                  }
                } catch {}
              }

              if (matches) {
                results.push({
                  fileName: entry.name,
                  filePath: fullPath,
                  extension: ext,
                  sizeBytes: stats.size,
                  sizeFormatted: this.formatBytes(stats.size),
                  modifiedAt: stats.mtime.toISOString(),
                  previewSnippet: snippet,
                });
              }
            } catch {}
          }
        }
      } catch {}
    };

    for (const d of targetDirs) {
      traverse(d);
    }

    return {
      criteria,
      results,
      totalMatches: results.length,
      scannedCount,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

export const fileFinderService = new FileFinderService();
