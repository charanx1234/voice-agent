import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Plus,
  Search,
  Trash2,
  Pencil,
  Brain,
  Check,
  AlertTriangle,
  Database,
} from 'lucide-react';
import { MemoryInputPayload, MemoryItem, MemoryKind } from '@/shared/types';

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  memoryEnabled: boolean;
  onToggleMemory: (enabled: boolean) => void;
  onChanged?: (count: number) => void;
}

interface Draft {
  kind: MemoryKind;
  title: string;
  content: string;
  subject: string;
  importance: number;
}

const EMPTY_DRAFT: Draft = {
  kind: 'fact',
  title: '',
  content: '',
  subject: '',
  importance: 3,
};

const KIND_LABELS: Record<MemoryKind, string> = {
  preference: 'Preference',
  personal: 'Personal',
  project: 'Project',
  fact: 'Fact',
  instruction: 'Instruction',
};

const KIND_COLORS: Record<MemoryKind, string> = {
  preference: '#38bdf8',
  personal: '#a78bfa',
  project: '#34d399',
  fact: '#94a3b8',
  instruction: '#fbbf24',
};

export const MemoryPanel: React.FC<MemoryPanelProps> = ({
  isOpen,
  onClose,
  memoryEnabled,
  onToggleMemory,
  onChanged,
}) => {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!window.fridayAPI) return;
    setLoading(true);
    try {
      const memories = await window.fridayAPI.listMemories({ limit: 200 });
      setItems(memories);
      onChanged?.(memories.length);
    } finally {
      setLoading(false);
    }
  }, [onChanged]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setDraft(null);
      setEditingId(null);
      setError('');
      void refresh();
    }
  }, [isOpen, refresh]);

  // Debounced semantic search while the user types.
  useEffect(() => {
    if (!isOpen) return undefined;
    const clean = query.trim();
    if (!clean) return undefined;

    const timer = setTimeout(async () => {
      if (!window.fridayAPI) return;
      setLoading(true);
      try {
        const hits = await window.fridayAPI.searchMemories(clean, 25);
        setItems(hits);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  if (!isOpen) return null;

  const startCreate = () => {
    setDraft({ ...EMPTY_DRAFT });
    setEditingId(null);
    setError('');
  };

  const startEdit = (memory: MemoryItem) => {
    setDraft({
      kind: memory.kind,
      title: memory.title,
      content: memory.content,
      subject: memory.subject,
      importance: memory.importance,
    });
    setEditingId(memory.id);
    setError('');
  };

  const cancelDraft = () => {
    setDraft(null);
    setEditingId(null);
    setError('');
  };

  const saveDraft = async () => {
    if (!draft || !window.fridayAPI) return;
    if (!draft.title.trim() || !draft.content.trim()) {
      setError('Give the memory a title and some content.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const payload: MemoryInputPayload = {
        kind: draft.kind,
        title: draft.title.trim(),
        content: draft.content.trim(),
        subject: draft.subject.trim(),
        importance: draft.importance,
      };

      if (editingId) {
        await window.fridayAPI.updateMemory(editingId, payload);
      } else {
        await window.fridayAPI.createMemory(payload);
      }

      setDraft(null);
      setEditingId(null);
      setQuery('');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Could not save that memory.');
    } finally {
      setBusy(false);
    }
  };

  const removeMemory = async (id: string) => {
    if (!window.fridayAPI) return;
    setBusy(true);
    try {
      await window.fridayAPI.deleteMemory(id);
      setConfirmingId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const total = items.length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(4, 7, 13, 0.82)',
        backdropFilter: 'blur(10px)',
        zIndex: 55,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '430px',
          maxHeight: '86vh',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Brain size={17} color="#00e5ff" />
            <span style={{ fontSize: '0.86rem', fontWeight: 700, letterSpacing: '0.04em' }}>
              LONG-TERM MEMORY
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                color: '#00e5ff',
                backgroundColor: 'rgba(0, 229, 255, 0.12)',
                border: '1px solid rgba(0, 229, 255, 0.3)',
                borderRadius: '999px',
                padding: '1px 8px',
                fontWeight: 600,
              }}
            >
              {total}
            </span>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Controls */}
        <div
          style={{
            padding: '12px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '6px 10px',
              }}
            >
              <Search size={14} color="#64748b" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search memories (semantic search)"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#f8fafc',
                  fontSize: '0.8rem',
                  fontFamily: 'inherit',
                }}
              />
              {loading && <span style={{ fontSize: '0.66rem', color: '#64748b' }}>…</span>}
            </div>

            <button
              onClick={startCreate}
              title="Add memory manually"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '7px 10px',
                borderRadius: '10px',
                backgroundColor: 'rgba(0, 229, 255, 0.12)',
                border: '1px solid rgba(0, 229, 255, 0.35)',
                color: '#00e5ff',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={13} />
              Add
            </button>
          </div>

          {/* Auto-memory toggle */}
          <button
            onClick={() => onToggleMemory(!memoryEnabled)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: '#94a3b8',
              fontSize: '0.72rem',
            }}
          >
            <span>Automatically remember details from conversations</span>
            <span
              style={{
                width: '32px',
                height: '18px',
                borderRadius: '999px',
                backgroundColor: memoryEnabled ? 'rgba(0, 229, 255, 0.7)' : 'rgba(148, 163, 184, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: memoryEnabled ? 'flex-end' : 'flex-start',
                padding: '2px',
                transition: 'all 0.2s ease',
              }}
            >
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  backgroundColor: '#0a0e17',
                }}
              />
            </span>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1 }}>
          {draft && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '12px',
                marginBottom: '12px',
                backgroundColor: 'rgba(0, 229, 255, 0.05)',
                border: '1px solid rgba(0, 229, 255, 0.25)',
                borderRadius: '12px',
              }}
            >
              <span style={{ fontSize: '0.72rem', color: '#00e5ff', fontWeight: 700 }}>
                {editingId ? 'EDIT MEMORY' : 'NEW MEMORY'}
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={draft.kind}
                  onChange={(event) =>
                    setDraft({ ...draft, kind: event.target.value as MemoryKind })
                  }
                  style={{
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    color: '#f1f5f9',
                    fontSize: '0.76rem',
                  }}
                >
                  {(Object.keys(KIND_LABELS) as MemoryKind[]).map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>

                <select
                  value={draft.importance}
                  onChange={(event) =>
                    setDraft({ ...draft, importance: Number(event.target.value) })
                  }
                  style={{
                    width: '118px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    color: '#f1f5f9',
                    fontSize: '0.76rem',
                  }}
                >
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      Importance {value}
                    </option>
                  ))}
                </select>
              </div>

              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Title, e.g. Preferred reply language"
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  color: '#fff',
                  fontSize: '0.78rem',
                  fontFamily: 'inherit',
                }}
              />

              <textarea
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                placeholder="One clear sentence, e.g. User prefers replies in Telugu."
                rows={3}
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  color: '#fff',
                  fontSize: '0.78rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />

              <input
                value={draft.subject}
                onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
                placeholder="Optional dedupe key, e.g. reply-language"
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  color: '#fff',
                  fontSize: '0.74rem',
                  fontFamily: 'inherit',
                }}
              />

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#f43f5e', fontSize: '0.72rem' }}>
                  <AlertTriangle size={12} />
                  <span>{error}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  onClick={cancelDraft}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    color: '#94a3b8',
                    padding: '5px 10px',
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveDraft}
                  disabled={busy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: '#00e5ff',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#04121a',
                    padding: '5px 12px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: busy ? 'default' : 'pointer',
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  <Check size={13} />
                  Save
                </button>
              </div>
            </div>
          )}

          {items.length === 0 && !draft ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                padding: '28px 10px',
                color: '#64748b',
                textAlign: 'center',
              }}
            >
              <Database size={22} />
              <span style={{ fontSize: '0.78rem' }}>
                {query.trim()
                  ? 'No memories match that search yet.'
                  : 'Nothing remembered yet. Tell FRIDAY something lasting — it will remember.'}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {items.map((memory) => {
                const color = KIND_COLORS[memory.kind] || '#94a3b8';
                return (
                  <div
                    key={memory.id}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      borderRadius: '12px',
                      padding: '9px 11px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            color,
                            border: `1px solid ${color}55`,
                            backgroundColor: `${color}18`,
                            borderRadius: '999px',
                            padding: '1px 6px',
                            flexShrink: 0,
                          }}
                        >
                          {KIND_LABELS[memory.kind]}
                        </span>
                        <span
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#f1f5f9',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {memory.title}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <span
                          title={`Importance ${memory.importance} of 5`}
                          style={{ fontSize: '0.62rem', color: '#64748b', letterSpacing: '1px' }}
                        >
                          {'●'.repeat(memory.importance)}
                          {'○'.repeat(5 - memory.importance)}
                        </span>

                        <button
                          onClick={() => startEdit(memory)}
                          title="Edit memory"
                          style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer' }}
                        >
                          <Pencil size={13} />
                        </button>

                        {confirmingId === memory.id ? (
                          <button
                            onClick={() => removeMemory(memory.id)}
                            disabled={busy}
                            style={{
                              background: 'none',
                              border: '1px solid rgba(244, 63, 94, 0.5)',
                              borderRadius: '6px',
                              color: '#f43f5e',
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              cursor: 'pointer',
                            }}
                          >
                            Delete?
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmingId(memory.id)}
                            title="Delete memory"
                            style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    <p style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                      {memory.content}
                    </p>

                    {typeof memory.score === 'number' && query.trim() && (
                      <span style={{ fontSize: '0.66rem', color: '#475569' }}>
                        relevance {(memory.score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '9px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '0.66rem',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Database size={11} />
          <span>Stored locally in SQLite. Only durable details are saved, never every message.</span>
        </div>
      </div>
    </div>
  );
};
