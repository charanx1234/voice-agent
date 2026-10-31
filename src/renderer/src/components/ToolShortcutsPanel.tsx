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
        return <Calculator size={18} color="#00e5ff" />;
      case 'notepad':
        return <FileText size={18} color="#38bdf8" />;
      case 'paint':
        return <Palette size={18} color="#f472b6" />;
      case 'explorer':
        return <Folder size={18} color="#fbbf24" />;
      case 'cmd':
        return <Terminal size={18} color="#34d399" />;
      default:
        return <Play size={18} color="#00e5ff" />;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(4, 7, 13, 0.82)',
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
          backgroundColor: '#0c121d',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          borderRadius: '18px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7)',
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
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setTab('apps')}
              style={{
                background: tab === 'apps' ? 'rgba(0, 229, 255, 0.15)' : 'none',
                border: tab === 'apps' ? '1px solid rgba(0, 229, 255, 0.4)' : '1px solid transparent',
                borderRadius: '8px',
                padding: '4px 12px',
                color: tab === 'apps' ? '#00e5ff' : '#94a3b8',
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
                background: tab === 'notes' ? 'rgba(0, 229, 255, 0.15)' : 'none',
                border: tab === 'notes' ? '1px solid rgba(0, 229, 255, 0.4)' : '1px solid transparent',
                borderRadius: '8px',
                padding: '4px 12px',
                color: tab === 'notes' ? '#00e5ff' : '#94a3b8',
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
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1 }}>
          {tab === 'apps' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
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
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {getAppIcon(app.id)}
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{app.name}</div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{app.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'notes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
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
                    backgroundColor: 'rgba(0, 229, 255, 0.1)',
                    border: '1px solid rgba(0, 229, 255, 0.3)',
                    color: '#00e5ff',
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
                    backgroundColor: 'rgba(0, 229, 255, 0.05)',
                    border: '1px solid rgba(0, 229, 255, 0.2)',
                    borderRadius: '10px',
                  }}
                >
                  <input
                    type="text"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    placeholder="Note Title"
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      padding: '5px 8px',
                      color: '#fff',
                      fontSize: '0.78rem',
                    }}
                  />
                  <textarea
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Note content..."
                    rows={3}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      padding: '5px 8px',
                      color: '#fff',
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
                      backgroundColor: '#00e5ff',
                      border: 'none',
                      color: '#000',
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
                  <div style={{ fontSize: '0.74rem', color: '#64748b', fontStyle: 'italic' }}>
                    No notes yet. Ask FRIDAY to save a note or click New Note above!
                  </div>
                ) : (
                  notes.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '10px',
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9' }}>
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
                              color: '#00e5ff',
                              cursor: 'pointer',
                              fontSize: '0.7rem',
                            }}
                          >
                            Read Aloud
                          </button>
                          <button
                            onClick={() => handleDeleteNote(n.id)}
                            style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <p style={{ fontSize: '0.74rem', color: '#94a3b8', whiteSpace: 'pre-wrap' }}>
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
