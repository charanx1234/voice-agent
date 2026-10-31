import fs from 'fs';
import path from 'path';
import { settingsStore } from '../storage/settingsStore';
import { SearchMatch } from '../../shared/types';

// Supported text file extensions safe to inspect
const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx', '.py',
  '.html', '.css', '.scss', '.yaml', '.yml', '.xml', '.csv',
  '.ini', '.env.example', '.conf', '.sh', '.bat', '.ps1', '.c', '.cpp', '.java',
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', 'dist-renderer',
  'build', '.idea', '.vscode', 'coverage', '.cache',
]);

export const projectSearchToolDefinition = {
  name: 'search_project_folder',
  description:
    'Searches for files and text content within the user-approved project folders only. Never searches the entire computer.',
  parameters: {
    type: 'OBJECT',
    properties: {
      query: {
        type: 'STRING',
        description: 'The keyword, filename, or text snippet to search for inside the approved project folder.',
      },
      fileExtension: {
        type: 'STRING',
        description: 'Optional file extension filter, e.g. ".ts", ".md", ".json".',
      },
    },
    required: ['query'],
  },
};

/** True when `childPath` is strictly inside `parentPath` (both already resolved). */
export function isInsideDirectory(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export async function executeProjectSearchTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  const settings = settingsStore.getSettings();
  const approvedFolders = settings.approvedFolders || [];

  if (approvedFolders.length === 0) {
    return {
      success: false,
      error:
        'No approved project folder has been configured yet. Please open Settings in FRIDAY and select an approved project folder.',
    };
  }

  const query = (args.query || '').toLowerCase().trim();
  const targetExt = args.fileExtension ? args.fileExtension.toLowerCase().trim() : null;

  if (!query && !targetExt) {
    return { error: 'Please provide a search query or a file extension.' };
  }

  // Resolve real (symlink-free) roots once; the boundary checks compare against these.
  const approvedRoots: Array<{ configured: string; real: string }> = [];
  for (const folder of approvedFolders) {
    if (!fs.existsSync(folder)) continue;
    try {
      approvedRoots.push({ configured: folder, real: fs.realpathSync.native(folder) });
    } catch {
      // Unresolvable root: skip rather than risk searching the wrong tree.
    }
  }

  const matches: SearchMatch[] = [];
  const maxMatches = 25; // Prevent overwhelming responses

  function traverseDir(currentDir: string, rootReal: string, depth = 0) {
    if (depth > 6 || matches.length >= maxMatches) return;
    if (!isInsideDirectory(currentDir, rootReal) && currentDir !== rootReal) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return; // permission denied or inaccessible
    }

    for (const entry of entries) {
      if (matches.length >= maxMatches) break;

      const fullPath = path.join(currentDir, entry.name);

      // Reparse points (symlinks and Windows junctions) can point outside the
      // approved folder, so they are never followed.
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          traverseDir(fullPath, rootReal, depth + 1);
        }
        continue;
      }

      if (!entry.isFile()) continue;

      // Defence in depth: verify the file's real location is still inside the root.
      let realFilePath: string;
      try {
        realFilePath = fs.realpathSync.native(fullPath);
      } catch {
        continue;
      }
      if (!isInsideDirectory(realFilePath, rootReal)) continue;

      const ext = path.extname(entry.name).toLowerCase();

      // Check file extension filter if specified
      if (targetExt && ext !== targetExt) {
        continue;
      }

      const fileNameMatches = entry.name.toLowerCase().includes(query);

      // Check file content if supported text extension and under 1MB
      let contentMatches = false;
      let previewSnippet = '';
      let matchedLine = 1;

      if (SUPPORTED_EXTENSIONS.has(ext)) {
        try {
          const stat = fs.statSync(realFilePath);
          if (stat.size < 1024 * 1024) {
            const content = fs.readFileSync(realFilePath, 'utf-8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(query)) {
                contentMatches = true;
                matchedLine = i + 1;
                previewSnippet = lines[i].trim().slice(0, 150);
                break;
              }
            }
          }
        } catch {
          // Ignore unreadable files
        }
      }

      if (fileNameMatches || contentMatches) {
        matches.push({
          filePath: fullPath,
          fileName: entry.name,
          line: contentMatches ? matchedLine : undefined,
          previewSnippet: previewSnippet || `Filename match: ${entry.name}`,
        });
      }
    }
  }

  for (const root of approvedRoots) {
    traverseDir(root.real, root.real);
  }

  return {
    success: true,
    query,
    searchedFolders: approvedRoots.map((r) => r.configured),
    totalFound: matches.length,
    matches,
  };
}

