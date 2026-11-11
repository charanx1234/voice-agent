import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  FolderSync,
  Clipboard,
  FileCode,
  Trash2,
  Copy,
  Check,
  Star,
  Search,
  RotateCcw,
  Plus,
  ArrowRight,
  Files,
  FolderOpen,
  AlertCircle,
  Sparkles,
  Layout,
  StickyNote,
  Edit3,
  Compass,
  Layers,
} from 'lucide-react';
import {
  QuickActionPreview,
  QuickActionBatchResult,
  DuplicateScanResult,
  ClipboardHistoryItem,
  TextSnippetItem,
} from '@/shared/types';
import { WindowManagerTab } from './quicktools/WindowManagerTab';
import { QuickNotesTab } from './quicktools/QuickNotesTab';
import { BatchRenamerTab } from './quicktools/BatchRenamerTab';
import { FileFinderTab } from './quicktools/FileFinderTab';
import { WorkspacesTab } from './quicktools/WorkspacesTab';

interface QuickToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAskFriday?: (prompt: string) => void;
}

export type QuickToolsTab =
  | 'actions'
  | 'windows'
  | 'notes'
  | 'renamer'
  | 'finder'
  | 'workspaces'
  | 'clipboard'
  | 'snippets';

export const QuickToolsModal: React.FC<QuickToolsModalProps> = ({ isOpen, onClose, onAskFriday }) => {
  const [activeTab, setActiveTab] = useState<QuickToolsTab>('actions');

  // Quick Actions State
  const [targetFolderType, setTargetFolderType] = useState<'desktop' | 'downloads'>('desktop');
  const [preview, setPreview] = useState<QuickActionPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [executeResult, setExecuteResult] = useState<QuickActionBatchResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [undoStatus, setUndoStatus] = useState<string | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateScanResult | null>(null);
  const [isScanningDuplicates, setIsScanningDuplicates] = useState(false);

  // Clipboard State
  const [clipboardItems, setClipboardItems] = useState<ClipboardHistoryItem[]>([]);
  const [clipSearch, setClipSearch] = useState('');
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);

  // Snippets State
  const [snippets, setSnippets] = useState<TextSnippetItem[]>([]);
  const [snippetSearch, setSnippetSearch] = useState('');
  const [isCreatingSnippet, setIsCreatingSnippet] = useState(false);
  const [newShortcut, setNewShortcut] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);

  // Load data on open
  useEffect(() => {
    if (!isOpen || !window.fridayAPI) return;

    if (activeTab === 'actions') {
      loadPreview(targetFolderType);
    } else if (activeTab === 'clipboard') {
      window.fridayAPI.quickToolsGetClipboardHistory().then(setClipboardItems).catch(() => {});
    } else if (activeTab === 'snippets') {
      window.fridayAPI.quickToolsGetSnippets().then(setSnippets).catch(() => {});
    }
  }, [isOpen, activeTab, targetFolderType]);

  const loadPreview = async (type: 'desktop' | 'downloads') => {
    if (!window.fridayAPI) return;
    setIsLoadingPreview(true);
    setExecuteResult(null);
    setUndoStatus(null);
    try {
      const res =
        type === 'desktop'
          ? await window.fridayAPI.quickToolsGetDesktopPreview()
          : await window.fridayAPI.quickToolsGetDownloadsPreview();
      setPreview(res);
    } catch (err: any) {
      console.error('Failed to load preview:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleExecuteOrganize = async () => {
    if (!preview || !window.fridayAPI || preview.totalFiles === 0) return;
    setIsExecuting(true);
    try {
      const res = await window.fridayAPI.quickToolsExecuteOrganize(preview);
      setExecuteResult(res);
      // Reload preview to show tidy state
      loadPreview(targetFolderType);
    } catch (err: any) {
      console.error('Failed to execute organize:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleUndo = async () => {
    if (!window.fridayAPI) return;
    try {
      const res = await window.fridayAPI.quickToolsUndoLastOrganize();
      setUndoStatus(res.message);
      loadPreview(targetFolderType);
    } catch (err: any) {
      setUndoStatus('Undo failed: ' + (err?.message || 'unknown error'));
    }
  };

  const handleScanDuplicates = async () => {
    if (!window.fridayAPI) return;
    setIsScanningDuplicates(true);
    try {
      const res = await window.fridayAPI.quickToolsFindDuplicates();
      setDuplicateResult(res);
    } catch (err) {
      console.error('Duplicate scan error:', err);
    } finally {
      setIsScanningDuplicates(false);
    }
  };

  // Clipboard handlers
  const handleCopyClip = async (item: ClipboardHistoryItem) => {
    if (!window.fridayAPI) return;
    await window.fridayAPI.quickToolsCopyClipboardItem(item.text);
    setCopiedClipId(item.id);
    setTimeout(() => setCopiedClipId(null), 1800);
  };

  const handleTogglePinClip = async (id: string) => {
    if (!window.fridayAPI) return;
    const updated = await window.fridayAPI.quickToolsTogglePinClipboard(id);
    setClipboardItems(updated);
  };

  const handleDeleteClip = async (id: string) => {
    if (!window.fridayAPI) return;
    const updated = await window.fridayAPI.quickToolsDeleteClipboard(id);
    setClipboardItems(updated);
  };

  const handleClearClipboard = async () => {
    if (!window.fridayAPI) return;
    await window.fridayAPI.quickToolsClearClipboard();
    const updated = await window.fridayAPI.quickToolsGetClipboardHistory();
    setClipboardItems(updated);
  };

  // Snippets handlers
  const handleSaveSnippet = async () => {
    if (!newShortcut.trim() || !newContent.trim() || !window.fridayAPI) return;
    await window.fridayAPI.quickToolsSaveSnippet({
      shortcut: newShortcut,
      title: newTitle || newShortcut,
      content: newContent,
      tags: [],
    });
    const updated = await window.fridayAPI.quickToolsGetSnippets();
    setSnippets(updated);
    setNewShortcut('');
    setNewTitle('');
    setNewContent('');
    setIsCreatingSnippet(false);
  };

  const handleDeleteSnippet = async (id: string) => {
    if (!window.fridayAPI) return;
    await window.fridayAPI.quickToolsDeleteSnippet(id);
    const updated = await window.fridayAPI.quickToolsGetSnippets();
    setSnippets(updated);
  };

  const handleExpandAndCopySnippet = async (shortcut: string, id: string) => {
    if (!window.fridayAPI) return;
    const res = await window.fridayAPI.quickToolsExpandSnippet(shortcut);
    if (res.success) {
      setCopiedSnippetId(id);
      setTimeout(() => setCopiedSnippetId(null), 1800);
    }
  };

  if (!isOpen) return null;

  const filteredClips = clipboardItems.filter((i) =>
    clipSearch ? i.text.toLowerCase().includes(clipSearch.toLowerCase()) : true
  );

  const filteredSnippets = snippets.filter((s) =>
    snippetSearch
      ? s.shortcut.toLowerCase().includes(snippetSearch.toLowerCase()) ||
        s.title.toLowerCase().includes(snippetSearch.toLowerCase()) ||
        s.content.toLowerCase().includes(snippetSearch.toLowerCase())
      : true
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '740px',
          maxHeight: '88vh',
          background: 'color-mix(in srgb, var(--surface) 95%, transparent)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--text)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
              }}
            >
              <Zap size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>QuickTools</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                Desktop productivity & file automation
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            padding: '10px 16px',
            background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
            borderBottom: '1px solid var(--border)',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          <button
            onClick={() => setActiveTab('actions')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: activeTab === 'actions' ? '1px solid var(--accent)' : '1px solid transparent',
              background: activeTab === 'actions' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: activeTab === 'actions' ? 'var(--accent)' : 'var(--muted)',
              flexShrink: 0,
            }}
          >
            <FolderSync size={14} />
            Quick Actions
          </button>

          <button
            onClick={() => setActiveTab('windows')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: activeTab === 'windows' ? '1px solid var(--accent)' : '1px solid transparent',
              background: activeTab === 'windows' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: activeTab === 'windows' ? 'var(--accent)' : 'var(--muted)',
              flexShrink: 0,
            }}
          >
            <Layout size={14} />
            Window Manager
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: activeTab === 'notes' ? '1px solid var(--accent)' : '1px solid transparent',
              background: activeTab === 'notes' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: activeTab === 'notes' ? 'var(--accent)' : 'var(--muted)',
              flexShrink: 0,
            }}
          >
            <StickyNote size={14} />
            Quick Notes
          </button>

          <button
            onClick={() => setActiveTab('renamer')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: activeTab === 'renamer' ? '1px solid var(--accent)' : '1px solid transparent',
              background: activeTab === 'renamer' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: activeTab === 'renamer' ? 'var(--accent)' : 'var(--muted)',
              flexShrink: 0,
            }}
          >
            <Edit3 size={14} />
            Batch Renamer
          </button>

          <button
            onClick={() => setActiveTab('finder')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: activeTab === 'finder' ? '1px solid var(--accent)' : '1px solid transparent',
              background: activeTab === 'finder' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: activeTab === 'finder' ? 'var(--accent)' : 'var(--muted)',
              flexShrink: 0,
            }}
          >
            <Search size={14} />
            File Finder
          </button>

          <button
            onClick={() => setActiveTab('workspaces')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: activeTab === 'workspaces' ? '1px solid var(--accent)' : '1px solid transparent',
              background: activeTab === 'workspaces' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: activeTab === 'workspaces' ? 'var(--accent)' : 'var(--muted)',
              flexShrink: 0,
            }}
          >
            <Layers size={14} />
            Workspaces
          </button>

          <button
            onClick={() => setActiveTab('clipboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: activeTab === 'clipboard' ? '1px solid var(--accent)' : '1px solid transparent',
              background: activeTab === 'clipboard' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: activeTab === 'clipboard' ? 'var(--accent)' : 'var(--muted)',
              flexShrink: 0,
            }}
          >
            <Clipboard size={14} />
            Clipboard
          </button>

          <button
            onClick={() => setActiveTab('snippets')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: activeTab === 'snippets' ? '1px solid var(--accent)' : '1px solid transparent',
              background: activeTab === 'snippets' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: activeTab === 'snippets' ? 'var(--accent)' : 'var(--muted)',
              flexShrink: 0,
            }}
          >
            <FileCode size={14} />
            Snippets
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* TAB 1: QUICK ACTIONS */}
          {activeTab === 'actions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Folder Selector & Controls */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setTargetFolderType('desktop')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      border: targetFolderType === 'desktop' ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: targetFolderType === 'desktop' ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'var(--surface)',
                      color: targetFolderType === 'desktop' ? 'var(--accent)' : 'var(--text)',
                    }}
                  >
                    Desktop
                  </button>
                  <button
                    onClick={() => setTargetFolderType('downloads')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      border: targetFolderType === 'downloads' ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: targetFolderType === 'downloads' ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'var(--surface)',
                      color: targetFolderType === 'downloads' ? 'var(--accent)' : 'var(--text)',
                    }}
                  >
                    Downloads
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleUndo}
                    title="Undo previous organize operation"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      background: 'color-mix(in srgb, var(--text) 6%, transparent)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    <RotateCcw size={13} />
                    Undo
                  </button>

                  <button
                    onClick={handleScanDuplicates}
                    disabled={isScanningDuplicates}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      background: 'color-mix(in srgb, var(--text) 6%, transparent)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    <Files size={13} />
                    {isScanningDuplicates ? 'Scanning...' : 'Find Duplicates'}
                  </button>
                </div>
              </div>

              {undoStatus && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                    border: '1px solid var(--accent)',
                    fontSize: '0.8rem',
                    color: 'var(--accent)',
                  }}
                >
                  {undoStatus}
                </div>
              )}

              {/* Duplicate Scanner Results */}
              {duplicateResult && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'color-mix(in srgb, var(--warning, #eab308) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--warning, #eab308) 30%, transparent)',
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '6px' }}>
                    Duplicate Scanner: Found {duplicateResult.duplicateGroups.length} set(s) of duplicates (wasting {(duplicateResult.wastedBytes / (1024 * 1024)).toFixed(1)} MB)
                  </div>
                  {duplicateResult.duplicateGroups.slice(0, 3).map((group, idx) => (
                    <div key={idx} style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '4px' }}>
                      • {group.files.length} duplicate copies ({(group.size / 1024).toFixed(0)} KB each): {group.files.map((f) => f.split('\\').pop()).join(', ')}
                    </div>
                  ))}
                </div>
              )}

              {/* Preview Card */}
              {isLoadingPreview ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  Scanning folder...
                </div>
              ) : preview ? (
                <div
                  style={{
                    background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                        {preview.totalFiles} unorganized file(s) found
                      </span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        Target: {preview.targetFolder}
                      </div>
                    </div>

                    <button
                      onClick={handleExecuteOrganize}
                      disabled={preview.totalFiles === 0 || isExecuting}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        background: preview.totalFiles > 0 ? 'var(--accent)' : 'color-mix(in srgb, var(--text) 10%, transparent)',
                        border: 'none',
                        color: preview.totalFiles > 0 ? '#000' : 'var(--muted)',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: preview.totalFiles > 0 ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {isExecuting ? 'Organizing...' : 'Clean & Organize Now'}
                    </button>
                  </div>

                  {/* Category Breakdown */}
                  {preview.totalFiles > 0 ? (
                    <>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        {Object.entries(preview.categoryCounts).map(([cat, count]) => (
                          <span
                            key={cat}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '12px',
                              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                              fontSize: '0.75rem',
                              color: 'var(--accent)',
                            }}
                          >
                            {cat}: {count}
                          </span>
                        ))}
                      </div>

                      {/* File List Sample */}
                      <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {preview.proposedMoves.slice(0, 15).map((move, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
                              fontSize: '0.75rem',
                            }}
                          >
                            <span style={{ fontWeight: 500, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {move.fileName}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--muted)' }}>
                              <ArrowRight size={12} />
                              <span>Organized/{move.category}/</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: '0.85rem' }}>
                      Everything is clean and tidy! No unorganized loose files found.
                    </div>
                  )}
                </div>
              ) : null}

              {executeResult && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'color-mix(in srgb, var(--success, #22c55e) 15%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--success, #22c55e) 40%, transparent)',
                    fontSize: '0.85rem',
                    color: 'var(--text)',
                  }}
                >
                  Successfully organized {executeResult.successCount} files! Click "Undo" anytime if you want them back.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CLIPBOARD HISTORY */}
          {activeTab === 'clipboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flex: 1,
                    background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                  }}
                >
                  <Search size={14} color="var(--muted)" />
                  <input
                    type="text"
                    value={clipSearch}
                    onChange={(e) => setClipSearch(e.target.value)}
                    placeholder="Search clipboard history..."
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                      width: '100%',
                    }}
                  />
                </div>

                <button
                  onClick={handleClearClipboard}
                  title="Clear unpinned clipboard history"
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--muted)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Trash2 size={13} />
                  Clear
                </button>
              </div>

              {filteredClips.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  No copied text in history. Copy something in any app to see it here!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredClips.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
                        border: item.isPinned ? '1px solid color-mix(in srgb, var(--accent) 50%, transparent)' : '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.85rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.text}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '2px' }}>
                          {item.charCount} chars • {new Date(item.copiedAt).toLocaleTimeString()}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleTogglePinClip(item.id)}
                          title={item.isPinned ? 'Unpin' : 'Pin item'}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: item.isPinned ? 'var(--accent)' : 'var(--muted)',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                        >
                          <Star size={14} fill={item.isPinned ? 'var(--accent)' : 'none'} />
                        </button>

                        <button
                          onClick={() => handleCopyClip(item)}
                          title="Copy to clipboard"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'color-mix(in srgb, var(--text) 8%, transparent)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '0.75rem',
                            color: copiedClipId === item.id ? 'var(--success, #22c55e)' : 'var(--text)',
                            cursor: 'pointer',
                          }}
                        >
                          {copiedClipId === item.id ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedClipId === item.id ? 'Copied' : 'Copy'}</span>
                        </button>

                        <button
                          onClick={() => handleDeleteClip(item.id)}
                          title="Delete from history"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--muted)',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SMART SNIPPETS */}
          {activeTab === 'snippets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flex: 1,
                    background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                  }}
                >
                  <Search size={14} color="var(--muted)" />
                  <input
                    type="text"
                    value={snippetSearch}
                    onChange={(e) => setSnippetSearch(e.target.value)}
                    placeholder="Search text snippets..."
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                      width: '100%',
                    }}
                  />
                </div>

                <button
                  onClick={() => setIsCreatingSnippet(!isCreatingSnippet)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    borderRadius: '8px',
                    background: 'var(--accent)',
                    border: 'none',
                    color: '#000',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  New Snippet
                </button>
              </div>

              {/* Create Snippet Box */}
              {isCreatingSnippet && (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
                    border: '1px solid var(--accent)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="Shortcut (e.g. ;mail or ;phone)"
                      value={newShortcut}
                      onChange={(e) => setNewShortcut(e.target.value)}
                      style={{
                        flex: '0 0 160px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '0.85rem',
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Title / Description"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>

                  <textarea
                    placeholder="Snippet Template. Use tags like {name}, {date}, {time}, {subject}, {clipboard}"
                    rows={4}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '0.85rem',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => setIsCreatingSnippet(false)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--muted)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveSnippet}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        background: 'var(--accent)',
                        border: 'none',
                        color: '#000',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Save Snippet
                    </button>
                  </div>
                </div>
              )}

              {/* Snippet List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredSnippets.map((snippet) => (
                  <div
                    key={snippet.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <code
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                            color: 'var(--accent)',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          {snippet.shortcut}
                        </code>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{snippet.title}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleExpandAndCopySnippet(snippet.shortcut, snippet.id)}
                          title="Expand template and copy to clipboard"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                            border: '1px solid var(--accent)',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            color: copiedSnippetId === snippet.id ? 'var(--success, #22c55e)' : 'var(--accent)',
                            cursor: 'pointer',
                            fontWeight: 500,
                          }}
                        >
                          {copiedSnippetId === snippet.id ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedSnippetId === snippet.id ? 'Copied' : 'Insert / Copy'}</span>
                        </button>

                        <button
                          onClick={() => handleDeleteSnippet(snippet.id)}
                          title="Delete snippet"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--muted)',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--muted)',
                        whiteSpace: 'pre-wrap',
                        background: 'color-mix(in srgb, var(--surface) 30%, transparent)',
                        padding: '8px 10px',
                        borderRadius: '6px',
                      }}
                    >
                      {snippet.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: WINDOW MANAGER */}
          {activeTab === 'windows' && <WindowManagerTab />}

          {/* TAB 4: QUICK NOTES */}
          {activeTab === 'notes' && <QuickNotesTab />}

          {/* TAB 5: BATCH RENAMER */}
          {activeTab === 'renamer' && <BatchRenamerTab />}

          {/* TAB 6: FILE FINDER */}
          {activeTab === 'finder' && <FileFinderTab />}

          {/* TAB 7: WORKSPACES */}
          {activeTab === 'workspaces' && <WorkspacesTab />}
        </div>
      </div>
    </div>
  );
};
