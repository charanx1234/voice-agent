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
  public searchFiles(criteria: FileSearchCriteria, maxResults = 40): FileSearchResult {
    const rootDir = criteria.folderPath && fs.existsSync(criteria.folderPath)
      ? criteria.folderPath
      : os.homedir();

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

    const traverse = (dir: string, depth = 0) => {
      if (depth > 3 || results.length >= maxResults) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (results.length >= maxResults) break;

          const baseNameLower = entry.name.toLowerCase();
          if (IGNORED_DIRS.has(baseNameLower)) continue;
          if (baseNameLower.startsWith('.')) continue;

          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            traverse(fullPath, depth + 1);
          } else if (entry.isFile()) {
            scannedCount++;

            const ext = path.extname(entry.name).toLowerCase();
            if (extFilter && ext !== extFilter) continue;

            try {
              const stats = fs.statSync(fullPath);

              if (stats.size < minBytes || stats.size > maxBytes) continue;
              if (cutoffDate && stats.mtime < cutoffDate) continue;

              let matches = false;
              let snippet: string | undefined;

              // Filename match
              if (!queryLower || baseNameLower.includes(queryLower)) {
                matches = true;
              }

              // Content search if requested and file is a supported text type
              if (!matches && criteria.searchContent && TEXT_SEARCH_EXTS.has(ext) && stats.size <= 2 * 1024 * 1024) {
                try {
                  const content = fs.readFileSync(fullPath, 'utf8');
                  const idx = content.toLowerCase().indexOf(queryLower);
                  if (idx >= 0) {
                    matches = true;
                    const start = Math.max(0, idx - 30);
                    const end = Math.min(content.length, idx + queryLower.length + 50);
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

    traverse(rootDir);

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
