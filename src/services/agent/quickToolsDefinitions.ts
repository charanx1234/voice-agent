import { quickActionsService } from '../quicktools/quickActionsService';
import { clipboardHistoryService } from '../quicktools/clipboardHistoryService';
import { snippetsService } from '../quicktools/snippetsService';
import { windowManagerService } from '../quicktools/windowManagerService';
import { quickNotesService } from '../quicktools/quickNotesService';
import { batchRenamerService } from '../quicktools/batchRenamerService';
import { fileFinderService } from '../quicktools/fileFinderService';
import { workspacesService } from '../quicktools/workspacesService';
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
  {
    name: 'arrange_windows',
    description:
      'Manages and snaps application windows on the screen. Supports splitting left/right, side-by-side app arrangement (e.g. Chrome on left, VS Code on right), maximizing, minimizing, centering, or listing open windows.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: ['split_left', 'split_right', 'side_by_side', 'maximize', 'minimize', 'restore', 'center', 'list'],
          description: 'Window layout action.',
        },
        windowTarget: {
          type: 'STRING',
          description: 'Title or app name of the first target window (e.g. "Chrome", "Code", "Notepad").',
        },
        secondTarget: {
          type: 'STRING',
          description: 'Title or app name of the second window for side-by-side layout (e.g. "VS Code").',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'batch_rename_files',
    description:
      'Safely previews, renames, or undoes batch file renaming with sequential numbering, prefixes/suffixes, and search/replace in a folder.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: ['preview', 'execute', 'undo'],
          description: '"preview" to inspect planned new names, "execute" to apply, or "undo" to revert.',
        },
        folderPath: {
          type: 'STRING',
          description: 'Absolute path to the target folder.',
        },
        prefix: {
          type: 'STRING',
          description: 'Prefix to prepend to file names.',
        },
        suffix: {
          type: 'STRING',
          description: 'Suffix to append before file extension.',
        },
        findText: {
          type: 'STRING',
          description: 'Text string to find and replace in file names.',
        },
        replaceText: {
          type: 'STRING',
          description: 'Replacement text for findText.',
        },
        addNumber: {
          type: 'BOOLEAN',
          description: 'Whether to append sequential numbers (001, 002, ...).',
        },
        pattern: {
          type: 'STRING',
          description: 'Optional file extension filter (e.g. ".jpg", ".png").',
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

    case 'arrange_windows': {
      const action = args.action || 'list';
      if (action === 'list') {
        const windows = await windowManagerService.getOpenWindows();
        return {
          success: true,
          windowCount: windows.length,
          windows: windows.map((w) => ({
            title: w.title,
            process: w.processName,
          })),
        };
      }

      const res = await windowManagerService.arrangeWindow({
        action: action as any,
        windowTarget: args.windowTarget,
        secondTarget: args.secondTarget,
      });
      return res;
    }

    case 'manage_quick_notes': {
      const action = args.action || 'list';
      if (action === 'create' && (args.content || args.title)) {
        const note = quickNotesService.saveNote({
          title: args.title || 'Quick Note',
          content: args.content || args.title || '',
          category: args.category || 'General',
          tags: [],
          isPinned: false,
        });
        return {
          success: true,
          message: `Saved note "${note.title}".`,
          note,
        };
      }
      if (action === 'search' && args.query) {
        const notes = quickNotesService.getNotes(args.category, args.query);
        return {
          success: true,
          query: args.query,
          matchCount: notes.length,
          notes: notes.slice(0, 10),
        };
      }
      if (action === 'delete' && args.id) {
        const ok = quickNotesService.deleteNote(args.id);
        return { success: ok, message: ok ? 'Note deleted.' : 'Note not found.' };
      }
      if (action === 'pin' && args.id) {
        const updated = quickNotesService.togglePin(args.id);
        return { success: true, notes: updated.slice(0, 10) };
      }
      const notes = quickNotesService.getNotes(args.category);
      return {
        success: true,
        noteCount: notes.length,
        notes: notes.slice(0, 10),
      };
    }

    case 'batch_rename_files': {
      const action = args.action || 'preview';
      if (action === 'undo') {
        const undoRes = batchRenamerService.undoLastRename();
        return undoRes;
      }

      const folderPath = args.folderPath || quickActionsService.getDesktopPath();
      const preview = batchRenamerService.generatePreview({
        folderPath,
        prefix: args.prefix,
        suffix: args.suffix,
        findText: args.findText,
        replaceText: args.replaceText,
        addNumber: args.addNumber,
        pattern: args.pattern,
      });

      if (action === 'preview') {
        return {
          success: true,
          mode: 'preview',
          totalFiles: preview.totalFiles,
          conflicts: preview.conflictCount,
          items: preview.items.slice(0, 15).map((i) => ({
            original: i.originalName,
            renamed: i.proposedName,
            status: i.status,
          })),
        };
      }

      if (action === 'execute') {
        const result = batchRenamerService.executeRename(preview);
        return {
          success: result.renamedCount > 0,
          renamedCount: result.renamedCount,
          skippedCount: result.skippedCount ?? 0,
          batchId: result.batchId,
        };
      }
      break;
    }

    case 'search_files_nlp': {
      const result = fileFinderService.searchFiles({
        query: args.query || '',
        folderPath: args.folderPath,
        extension: args.extension,
        searchContent: Boolean(args.searchContent),
        modifiedWithinDays: args.modifiedWithinDays,
      });

      return {
        success: true,
        totalMatches: result.totalMatches,
        scannedCount: result.scannedCount,
        files: result.results.slice(0, 15).map((r) => ({
          name: r.fileName,
          path: r.filePath,
          size: r.sizeFormatted,
          modified: r.modifiedAt,
          snippet: r.previewSnippet,
        })),
      };
    }

    case 'manage_workspaces': {
      const action = args.action || 'list';
      if (action === 'launch' && args.idOrName) {
        const res = await workspacesService.launchWorkspace(args.idOrName);
        return res;
      }
      if (action === 'delete' && args.idOrName) {
        const ok = workspacesService.deleteWorkspace(args.idOrName);
        return { success: ok, message: ok ? 'Workspace deleted.' : 'Workspace not found.' };
      }
      const workspaces = workspacesService.getWorkspaces();
      return {
        success: true,
        workspaces: workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          appCount: w.apps.length,
        })),
      };
    }
  }

  return { success: false, error: `Unknown tool: ${name}` };
}
