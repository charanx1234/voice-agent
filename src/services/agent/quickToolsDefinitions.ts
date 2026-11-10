import { quickActionsService } from '../quicktools/quickActionsService';
import { clipboardHistoryService } from '../quicktools/clipboardHistoryService';
import { snippetsService } from '../quicktools/snippetsService';
import { QuickActionPreview } from '../../shared/types';

export const quickToolsDefinitions = [
  {
    name: 'organize_desktop_folder',
    description:
      'Organizes files in the Desktop, Downloads, or a user-specified folder into categorized folders (Documents, Images, Screenshots, Videos, Audio, Archives, Code, etc.). Supports generating a non-destructive preview, executing the organization, or undoing the last organization operation.',
    parameters: {
      type: 'OBJECT',
      properties: {
        target: {
          type: 'STRING',
          description:
            'Target folder to organize: "desktop", "downloads", or an absolute directory path. Default is "desktop".',
        },
        action: {
          type: 'STRING',
          enum: ['preview', 'execute', 'undo'],
          description:
            'Operation to perform: "preview" to inspect planned moves safely, "execute" to move files, or "undo" to revert previous organization.',
        },
        category_filter: {
          type: 'STRING',
          description:
            'Optional specific category to organize (e.g. "Screenshots", "Documents", "Images").',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'find_duplicate_files',
    description:
      'Scans a specified folder (Desktop, Downloads, or custom path) to identify duplicate files based on file size and cryptographic content hashing.',
    parameters: {
      type: 'OBJECT',
      properties: {
        target: {
          type: 'STRING',
          description:
            'Folder to search for duplicates: "downloads", "desktop", or an absolute directory path. Default is "downloads".',
        },
      },
      required: [],
    },
  },
  {
    name: 'manage_clipboard_history',
    description:
      'Searches, reviews, copies, or clears local clipboard history entries safely. Never exposes sensitive passwords or tokens.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: ['list', 'search', 'copy_latest', 'clear'],
          description:
            'Clipboard action: "list" for recent items, "search" with a query, "copy_latest" to re-copy previous item, or "clear" to clear history.',
        },
        query: {
          type: 'STRING',
          description: 'Search string when action is "search".',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_text_snippets',
    description:
      'Expands, lists, or creates smart text templates and shortcuts (e.g., ;mail, ;phone, ;intro) with placeholders like {name}, {date}, and {subject}.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: ['list', 'expand', 'create'],
          description:
            'Action to perform: "list" to view snippets, "expand" to retrieve filled template, or "create" to save a new shortcut.',
        },
        shortcut: {
          type: 'STRING',
          description: 'Shortcut name (e.g., ";mail" or "mail").',
        },
        placeholders: {
          type: 'OBJECT',
          description: 'Key-value map of placeholder substitutions (e.g. { name: "Alex" }).',
        },
        title: {
          type: 'STRING',
          description: 'Snippet title when creating.',
        },
        content: {
          type: 'STRING',
          description: 'Snippet content when creating.',
        },
      },
      required: ['action'],
    },
  },
];

export async function executeQuickToolsAgent(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'organize_desktop_folder': {
      const action = args.action || 'preview';
      let targetPath = quickActionsService.getDesktopPath();
      if (args.target) {
        const t = String(args.target).toLowerCase();
        if (t === 'downloads') {
          targetPath = quickActionsService.getDownloadsPath();
        } else if (t !== 'desktop') {
          targetPath = args.target;
        }
      }

      if (action === 'undo') {
        const undoResult = quickActionsService.undoLastOrganize();
        return {
          success: undoResult.success,
          message: undoResult.message,
          restoredCount: undoResult.restoredCount,
        };
      }

      const preview = quickActionsService.generatePreview(targetPath);
      if (args.category_filter) {
        const filter = String(args.category_filter).toLowerCase();
        preview.proposedMoves = preview.proposedMoves.filter(
          (m) => m.category.toLowerCase() === filter
        );
        preview.totalFiles = preview.proposedMoves.length;
      }

      if (action === 'preview') {
        return {
          success: true,
          mode: 'preview',
          targetFolder: preview.targetFolder,
          totalFilesToMove: preview.totalFiles,
          categorySummary: preview.categoryCounts,
          files: preview.proposedMoves.slice(0, 15).map((m) => ({
            name: m.fileName,
            category: m.category,
            destination: m.destinationPath,
          })),
          confirmationNeeded: preview.totalFiles > 0,
        };
      }

      if (action === 'execute') {
        const execResult = quickActionsService.executeOrganize(preview);
        return {
          success: execResult.successCount > 0,
          mode: 'executed',
          targetFolder: execResult.targetFolder,
          movedCount: execResult.successCount,
          failedCount: execResult.failureCount,
          batchId: execResult.batchId,
        };
      }
      break;
    }

    case 'find_duplicate_files': {
      let targetPath = quickActionsService.getDownloadsPath();
      if (args.target) {
        const t = String(args.target).toLowerCase();
        if (t === 'desktop') {
          targetPath = quickActionsService.getDesktopPath();
        } else if (t !== 'downloads') {
          targetPath = args.target;
        }
      }

      const dupResult = quickActionsService.findDuplicates(targetPath);
      return {
        success: true,
        targetFolder: targetPath,
        scannedCount: dupResult.scannedCount,
        duplicateCount: dupResult.duplicateGroups.length,
        wastedBytes: dupResult.wastedBytes,
        wastedFormatted: `${(dupResult.wastedBytes / (1024 * 1024)).toFixed(2)} MB`,
        groups: dupResult.duplicateGroups.slice(0, 10).map((g) => ({
          fileCount: g.files.length,
          sizePerFile: g.size,
          files: g.files,
        })),
      };
    }

    case 'manage_clipboard_history': {
      const action = args.action || 'list';
      if (action === 'clear') {
        clipboardHistoryService.clearHistory();
        return { success: true, message: 'Clipboard history cleared (pinned items preserved).' };
      }
      if (action === 'search' && args.query) {
        const results = clipboardHistoryService.search(args.query);
        return {
          success: true,
          query: args.query,
          matchCount: results.length,
          matches: results.slice(0, 10).map((r) => ({
            text: r.text.length > 80 ? r.text.slice(0, 80) + '...' : r.text,
            isPinned: r.isPinned,
            copiedAt: r.copiedAt,
          })),
        };
      }
      if (action === 'copy_latest') {
        const items = clipboardHistoryService.getItems();
        if (items.length > 0) {
          clipboardHistoryService.copyToClipboard(items[0].text);
          return { success: true, copiedText: items[0].text };
        }
        return { success: false, message: 'Clipboard history is empty.' };
      }
      const items = clipboardHistoryService.getItems();
      return {
        success: true,
        totalItems: items.length,
        items: items.slice(0, 10).map((i) => ({
          text: i.text.length > 80 ? i.text.slice(0, 80) + '...' : i.text,
          isPinned: i.isPinned,
          copiedAt: i.copiedAt,
        })),
      };
    }

    case 'manage_text_snippets': {
      const action = args.action || 'list';
      if (action === 'expand' && args.shortcut) {
        const res = snippetsService.expandSnippet(args.shortcut, args.placeholders || {});
        if (res.success) {
          return {
            success: true,
            expandedText: res.expandedText,
            shortcut: res.snippet?.shortcut,
          };
        }
        return { success: false, message: `Snippet "${args.shortcut}" not found.` };
      }
      if (action === 'create' && args.shortcut && args.content) {
        const created = snippetsService.saveSnippet({
          shortcut: args.shortcut,
          title: args.title || args.shortcut,
          content: args.content,
          tags: [],
        });
        return { success: true, snippet: created };
      }
      const all = snippetsService.getSnippets();
      return {
        success: true,
        snippets: all.map((s) => ({
          id: s.id,
          shortcut: s.shortcut,
          title: s.title,
          contentPreview: s.content.length > 60 ? s.content.slice(0, 60) + '...' : s.content,
        })),
      };
    }
  }

  return { success: false, error: `Unknown tool: ${name}` };
}
