import React, { useState } from 'react';
import { Edit3, Eye, RotateCcw, Check, AlertTriangle, ArrowRight, Folder, FileText } from 'lucide-react';
import { BatchRenamePreview, BatchRenameResult } from '@/shared/types';

export const BatchRenamerTab: React.FC = () => {
  const [folderType, setFolderType] = useState<'desktop' | 'downloads' | 'custom'>('desktop');
  const [customPath, setCustomPath] = useState('');
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [addNumber, setAddNumber] = useState(false);
  const [addDate, setAddDate] = useState(false);
  const [pattern, setPattern] = useState('');

  const [preview, setPreview] = useState<BatchRenamePreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [executeResult, setExecuteResult] = useState<BatchRenameResult | null>(null);
  const [undoStatus, setUndoStatus] = useState<string | null>(null);

  const getFolderPath = async (): Promise<string> => {
    if (folderType === 'custom' && customPath.trim()) return customPath.trim();
    return folderType; // 'desktop' or 'downloads' alias resolved directly in backend
  };

  const handleGeneratePreview = async () => {
    if (!window.fridayAPI) return;
    setIsLoading(true);
    setExecuteResult(null);
    setUndoStatus(null);

    try {
      const folderPath = await getFolderPath();
      const res = await window.fridayAPI.quickToolsPreviewRename({
        folderPath,
        prefix: prefix || undefined,
        suffix: suffix || undefined,
        findText: findText || undefined,
        replaceText: replaceText || undefined,
        addNumber,
        addDate,
        pattern: pattern || undefined,
      });
      setPreview(res);
    } catch (err: any) {
      setUndoStatus('Preview failed: ' + (err?.message || 'error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!preview || !window.fridayAPI || preview.totalFiles === 0) return;
    setIsLoading(true);
    try {
      const res = await window.fridayAPI.quickToolsExecuteRename(preview);
      setExecuteResult(res);
      // Refresh preview to show updated state
      handleGeneratePreview();
    } catch (err: any) {
      setUndoStatus('Rename failed: ' + (err?.message || 'error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!window.fridayAPI) return;
    try {
      const res = await window.fridayAPI.quickToolsUndoRename();
      setUndoStatus(res.message);
      if (res.success) {
        handleGeneratePreview();
      }
    } catch (err: any) {
      setUndoStatus('Undo failed: ' + (err?.message || 'error'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Folder Selector */}
      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>
          Target Directory
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setFolderType('desktop')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: folderType === 'desktop' ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: folderType === 'desktop' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: folderType === 'desktop' ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            Desktop
          </button>
          <button
            onClick={() => setFolderType('downloads')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: folderType === 'downloads' ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: folderType === 'downloads' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: folderType === 'downloads' ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            Downloads
          </button>
          <button
            onClick={() => setFolderType('custom')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: folderType === 'custom' ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: folderType === 'custom' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              color: folderType === 'custom' ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            Custom Folder
          </button>
        </div>

        {folderType === 'custom' && (
          <input
            type="text"
            placeholder="C:\Users\username\Pictures"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            style={{
              marginTop: '8px',
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '0.82rem',
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>

      {/* Rename Rules Grid */}
      <div
        style={{
          padding: '14px',
          borderRadius: '10px',
          background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
          Renaming Rules
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
              Add Prefix
            </label>
            <input
              type="text"
              placeholder="e.g. Doc_"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '0.8rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
              Add Suffix
            </label>
            <input
              type="text"
              placeholder="e.g. _v1"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '0.8rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
              Find Text
            </label>
            <input
              type="text"
              placeholder="e.g. screenshot"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '0.8rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
              Replace With
            </label>
            <input
              type="text"
              placeholder="e.g. capture"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '0.8rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Checkbox Options */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={addNumber}
              onChange={(e) => setAddNumber(e.target.checked)}
            />
            Sequential numbering (001, 002...)
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={addDate}
              onChange={(e) => setAddDate(e.target.checked)}
            />
            Prepend Date (YYYY-MM-DD)
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Extension Filter:</span>
            <input
              type="text"
              placeholder=".png or *"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              style={{
                width: '80px',
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '0.75rem',
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button
            onClick={handleUndo}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={14} />
            Undo Rename
          </button>

          <button
            onClick={handleGeneratePreview}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: '8px',
              background: 'var(--accent)',
              border: 'none',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Eye size={14} />
            {isLoading ? 'Scanning...' : 'Preview Renames'}
          </button>
        </div>
      </div>

      {undoStatus && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
            border: '1px solid var(--border)',
            fontSize: '0.8rem',
            color: 'var(--text)',
          }}
        >
          {undoStatus}
        </div>
      )}

      {executeResult && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'color-mix(in srgb, var(--success, #22c55e) 15%, transparent)',
            border: '1px solid var(--success, #22c55e)',
            fontSize: '0.8rem',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Check size={16} style={{ color: 'var(--success, #22c55e)' }} />
          Successfully renamed {executeResult.successCount} file(s)!
        </div>
      )}

      {/* Preview Section */}
      {preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Preview ({preview.totalFiles} files to rename
              {preview.conflictCount > 0 ? `, ${preview.conflictCount} conflicts resolved` : ''})
            </div>

            <button
              onClick={handleExecute}
              disabled={isLoading || preview.totalFiles === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 18px',
                borderRadius: '8px',
                background: 'var(--success, #22c55e)',
                border: 'none',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Check size={14} />
              Apply Renaming
            </button>
          </div>

          <div
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'color-mix(in srgb, var(--surface) 40%, transparent)',
            }}
          >
            {preview.items.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>
                No files matched the selected criteria in this folder.
              </div>
            ) : (
              preview.items.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '0.78rem',
                    gap: '12px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                    {item.originalName}
                  </div>
                  <ArrowRight size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--text)' }}>
                    {item.proposedName}
                  </div>
                  {item.status === 'conflict_resolved' && (
                    <span
                      title="Duplicate name detected, safe numbering applied"
                      style={{
                        fontSize: '0.7rem',
                        color: '#eab308',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0,
                      }}
                    >
                      <AlertTriangle size={12} />
                      Numbered
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
