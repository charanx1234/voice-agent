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
  preference: 'var(--info)',
  personal: 'var(--accent)',
  project: 'var(--success)',
  fact: 'var(--muted)',
  instruction: 'var(--warning)',
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
        backgroundColor: 'color-mix(in srgb, var(--overlay) 82%, transparent)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Brain size={17} color="var(--accent)" />
            <span style={{ fontSize: '0.86rem', fontWeight: 700, letterSpacing: '0.04em' }}>
              LONG-TERM MEMORY
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                color: 'var(--accent)',
                backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
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
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
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
            borderBottom: '1px solid color-mix(in srgb, var(--text) 6%, transparent)',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'color-mix(in srgb, var(--shadow-color) 35%, transparent)',
                border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                borderRadius: '10px',
                padding: '6px 10px',
              }}
            >
              <Search size={14} color="var(--muted-dim)" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search memories"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  fontSize: '0.8rem',
                  fontFamily: 'inherit',
                }}
              />
              {loading && <span style={{ fontSize: '0.66rem', color: 'var(--muted-dim)' }}>…</span>}
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
                backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                color: 'var(--accent)',
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
              color: 'var(--muted)',
              fontSize: '0.72rem',
            }}
          >
            <span>Automatically remember details from conversations</span>
            <span
              style={{
                width: '32px',
                height: '18px',
                borderRadius: '999px',
                backgroundColor: memoryEnabled ? 'color-mix(in srgb, var(--accent) 70%, transparent)' : 'color-mix(in srgb, var(--muted) 30%, transparent)',
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
                  backgroundColor: 'var(--bg)',
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
                backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                borderRadius: '12px',
              }}
            >
              <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 700 }}>
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
                    background: 'color-mix(in srgb, var(--shadow-color) 40%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--text) 12%, transparent)',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    color: 'var(--text)',
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
                    background: 'color-mix(in srgb, var(--shadow-color) 40%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--text) 12%, transparent)',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    color: 'var(--text)',
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
                placeholder="Title"
                style={{
                  background: 'color-mix(in srgb, var(--shadow-color) 40%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--text) 12%, transparent)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  color: 'var(--text)',
                  fontSize: '0.78rem',
                  fontFamily: 'inherit',
                }}
              />

              <textarea
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                placeholder="Content"
                rows={3}
                style={{
                  background: 'color-mix(in srgb, var(--shadow-color) 40%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--text) 12%, transparent)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  color: 'var(--text)',
                  fontSize: '0.78rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />

              <input
                value={draft.subject}
                onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
                placeholder="Optional key"
                style={{
                  background: 'color-mix(in srgb, var(--shadow-color) 40%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--text) 12%, transparent)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  color: 'var(--text)',
                  fontSize: '0.74rem',
                  fontFamily: 'inherit',
                }}
              />

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--danger)', fontSize: '0.72rem' }}>
                  <AlertTriangle size={12} />
                  <span>{error}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  onClick={cancelDraft}
                  style={{
                    background: 'none',
                    border: '1px solid color-mix(in srgb, var(--text) 15%, transparent)',
                    borderRadius: '8px',
                    color: 'var(--muted)',
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
                    backgroundColor: 'var(--accent)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'var(--on-accent)',
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
                color: 'var(--muted-dim)',
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
                const color = KIND_COLORS[memory.kind] || 'var(--muted)';
                return (
                  <div
                    key={memory.id}
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--text) 3%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--text) 7%, transparent)',
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
                            color: 'var(--text)',
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
                          style={{ fontSize: '0.62rem', color: 'var(--muted-dim)', letterSpacing: '1px' }}
                        >
                          {'●'.repeat(memory.importance)}
                          {'○'.repeat(5 - memory.importance)}
                        </span>

                        <button
                          onClick={() => startEdit(memory)}
                          title="Edit memory"
                          style={{ background: 'none', border: 'none', color: 'var(--info)', cursor: 'pointer' }}
                        >
                          <Pencil size={13} />
                        </button>

                        {confirmingId === memory.id ? (
                          <button
                            onClick={() => removeMemory(memory.id)}
                            disabled={busy}
                            style={{
                              background: 'none',
                              border: '1px solid color-mix(in srgb, var(--danger) 50%, transparent)',
                              borderRadius: '6px',
                              color: 'var(--danger)',
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
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                      {memory.content}
                    </p>

                    {typeof memory.score === 'number' && query.trim() && (
                      <span style={{ fontSize: '0.66rem', color: 'var(--muted-dim)' }}>
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
            borderTop: '1px solid color-mix(in srgb, var(--text) 6%, transparent)',
            fontSize: '0.66rem',
            color: 'var(--muted-dim)',
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
