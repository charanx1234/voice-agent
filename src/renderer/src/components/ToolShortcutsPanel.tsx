import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Calculator,
  Terminal,
  Folder,
  Palette,
  ExternalLink,
  Plus,
  Trash2,
  Play,
  Search,
} from 'lucide-react';
import { NoteItem, AllowedApp } from '@/shared/types';

interface ToolShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAskFriday: (prompt: string) => void;
}

export const ToolShortcutsPanel: React.FC<ToolShortcutsPanelProps> = ({
  isOpen,
  onClose,
  onAskFriday,
}) => {
  const [tab, setTab] = useState<'apps' | 'notes'>('apps');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [allowedApps, setAllowedApps] = useState<AllowedApp[]>([]);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isCreatingNote, setIsCreatingNote] = useState(false);

  useEffect(() => {
    if (isOpen && window.fridayAPI) {
      window.fridayAPI.listNotes().then(setNotes);
      window.fridayAPI.getAllowedApps().then(setAllowedApps);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLaunchApp = async (appId: string) => {
    if (window.fridayAPI) {
      await window.fridayAPI.launchApp(appId);
    }
  };

  const handleCreateNote = async () => {
    if (!newNoteTitle.trim() || !newNoteContent.trim() || !window.fridayAPI) return;
    const note = await window.fridayAPI.saveNote(newNoteTitle, newNoteContent);
    setNotes([note, ...notes.filter((n) => n.id !== note.id)]);
    setNewNoteTitle('');
    setNewNoteContent('');
    setIsCreatingNote(false);
  };

  const handleDeleteNote = async (id: string) => {
    if (window.fridayAPI) {
      await window.fridayAPI.deleteNote(id);
      setNotes(notes.filter((n) => n.id !== id));
    }
  };

  const getAppIcon = (id: string) => {
    switch (id) {
      case 'calculator':
        return <Calculator size={18} color="var(--accent)" />;
      case 'notepad':
        return <FileText size={18} color="var(--info)" />;
      case 'paint':
        return <Palette size={18} color="var(--accent)" />;
      case 'explorer':
        return <Folder size={18} color="var(--warning)" />;
      case 'cmd':
        return <Terminal size={18} color="var(--success)" />;
      default:
        return <Play size={18} color="var(--accent)" />;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'color-mix(in srgb, var(--overlay) 82%, transparent)',
        backdropFilter: 'blur(10px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          maxHeight: '85vh',
          backgroundColor: 'var(--surface)',
          border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          borderRadius: '18px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 16px 40px color-mix(in srgb, var(--shadow-color) 70%, transparent)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderBottom: '1px solid color-mix(in srgb, var(--text) 8%, transparent)',
          }}
        >
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setTab('apps')}
              style={{
                background: tab === 'apps' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'none',
                border: tab === 'apps' ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' : '1px solid transparent',
                borderRadius: '8px',
                padding: '4px 12px',
                color: tab === 'apps' ? 'var(--accent)' : 'var(--muted)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Allowed Apps
            </button>
            <button
              onClick={() => setTab('notes')}
              style={{
                background: tab === 'notes' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'none',
                border: tab === 'notes' ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' : '1px solid transparent',
                borderRadius: '8px',
                padding: '4px 12px',
                color: tab === 'notes' ? 'var(--accent)' : 'var(--muted)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Notes ({notes.length})
            </button>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1 }}>
          {tab === 'apps' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--muted-dim)' }}>
                Pre-approved desktop tools that FRIDAY can launch on command:
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {allowedApps.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => handleLaunchApp(app.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      backgroundColor: 'color-mix(in srgb, var(--text) 4%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--text) 8%, transparent)',
                      borderRadius: '12px',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {getAppIcon(app.id)}
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{app.name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--muted-dim)' }}>{app.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'notes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--muted-dim)' }}>
                  Text notes managed by FRIDAY:
                </span>
                <button
                  onClick={() => setIsCreatingNote(!isCreatingNote)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                    color: 'var(--accent)',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={12} />
                  <span>New Note</span>
                </button>
              </div>

              {isCreatingNote && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '10px',
                    backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                    borderRadius: '10px',
                  }}
                >
                  <input
                    type="text"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    placeholder="Note Title"
                    style={{
                      background: 'color-mix(in srgb, var(--shadow-color) 30%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                      borderRadius: '6px',
                      padding: '5px 8px',
                      color: 'var(--text)',
                      fontSize: '0.78rem',
                    }}
                  />
                  <textarea
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Note content..."
                    rows={3}
                    style={{
                      background: 'color-mix(in srgb, var(--shadow-color) 30%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                      borderRadius: '6px',
                      padding: '5px 8px',
                      color: 'var(--text)',
                      fontSize: '0.78rem',
                      fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={handleCreateNote}
                    style={{
                      alignSelf: 'flex-end',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--accent)',
                      border: 'none',
                      color: 'var(--shadow-color)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Save Note
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {notes.length === 0 ? (
                  <div style={{ fontSize: '0.74rem', color: 'var(--muted-dim)', fontStyle: 'italic' }}>
                    No notes yet.
                  </div>
                ) : (
                  notes.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--text) 3%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--text) 6%, transparent)',
                        borderRadius: '10px',
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>
                          {n.title}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            onClick={() => {
                              onAskFriday(`Read my note titled "${n.title}" aloud.`);
                              onClose();
                            }}
                            title="Read note aloud"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent)',
                              cursor: 'pointer',
                              fontSize: '0.7rem',
                            }}
                          >
                            Read Aloud
                          </button>
                          <button
                            onClick={() => handleDeleteNote(n.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <p style={{ fontSize: '0.74rem', color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>
                        {n.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
