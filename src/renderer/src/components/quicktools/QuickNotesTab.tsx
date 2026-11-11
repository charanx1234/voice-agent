import React, { useState, useEffect } from 'react';
import { Plus, Search, Star, Trash2, Tag, Check, Calendar, StickyNote } from 'lucide-react';
import { QuickNoteItem } from '@/shared/types';

const CATEGORIES = ['All', 'General', 'Ideas', 'Work', 'Todo'];

export const QuickNotesTab: React.FC = () => {
  const [notes, setNotes] = useState<QuickNoteItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // New Note State
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('General');

  const loadNotes = async () => {
    if (!window.fridayAPI) return;
    try {
      const list = await window.fridayAPI.quickToolsListNotes(
        selectedCategory === 'All' ? undefined : selectedCategory,
        searchQuery
      );
      setNotes(list);
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  };

  useEffect(() => {
    loadNotes();
  }, [selectedCategory, searchQuery]);

  const handleSaveNote = async () => {
    if (!newTitle.trim() && !newContent.trim()) return;
    if (!window.fridayAPI) return;

    try {
      await window.fridayAPI.quickToolsSaveNote({
        title: newTitle.trim() || 'Untitled Note',
        content: newContent.trim(),
        category: newCategory,
        tags: [newCategory.toLowerCase()],
        isPinned: false,
      });

      setNewTitle('');
      setNewContent('');
      setIsCreating(false);
      loadNotes();
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  };

  const handleTogglePin = async (id: string) => {
    if (!window.fridayAPI) return;
    try {
      const updated = await window.fridayAPI.quickToolsTogglePinNote(id);
      setNotes(updated);
    } catch (err) {
      console.error('Failed to pin note:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.fridayAPI) return;
    try {
      await window.fridayAPI.quickToolsDeleteNote(id);
      loadNotes();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Bar: Search, Category Filters, New Note Button */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
              border: '1px solid var(--border)',
              flex: 1,
            }}
          >
            <Search size={14} style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              placeholder="Search notes or ideas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text)',
                fontSize: '0.82rem',
                width: '100%',
              }}
            />
          </div>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '8px',
            background: 'var(--accent)',
            border: 'none',
            color: '#fff',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          {isCreating ? 'Cancel' : 'New Note'}
        </button>
      </div>

      {/* Categories Chips */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              padding: '4px 12px',
              borderRadius: '16px',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: selectedCategory === cat ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: selectedCategory === cat ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
              color: selectedCategory === cat ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Create Note Card */}
      {isCreating && (
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Note title (e.g. Project brainstorm)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '0.85rem',
              }}
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '0.82rem',
              }}
            >
              {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <textarea
            placeholder="Write your note content here..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '0.82rem',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              onClick={() => setIsCreating(false)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveNote}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                background: 'var(--accent)',
                border: 'none',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save Note
            </button>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto' }}>
        {notes.length === 0 ? (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: '0.85rem',
              borderRadius: '8px',
              background: 'color-mix(in srgb, var(--surface) 30%, transparent)',
            }}
          >
            No notes found. Create a note above or say &quot;Friday, remember this note: ...&quot;
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
                border: note.isPinned ? '1px solid var(--accent)' : '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <StickyNote size={15} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{note.title}</span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                      color: 'var(--accent)',
                    }}
                  >
                    {note.category}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={() => handleTogglePin(note.id)}
                    title={note.isPinned ? 'Unpin note' : 'Pin to top'}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: note.isPinned ? '#eab308' : 'var(--muted)',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                  >
                    <Star size={15} fill={note.isPinned ? '#eab308' : 'none'} />
                  </button>
                  <button
                    onClick={() => handleDelete(note.id)}
                    title="Delete note"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--text)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.4',
                }}
              >
                {note.content}
              </div>

              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={12} />
                {new Date(note.updatedAt).toLocaleDateString()} at{' '}
                {new Date(note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
