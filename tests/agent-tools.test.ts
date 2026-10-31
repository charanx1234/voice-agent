import { describe, it, expect, beforeEach } from 'vitest';
import { executeNotesTool } from '../src/services/agent/notesTool';
import { notesStore } from '../src/services/storage/notesStore';

describe('Agent Tools - Notes Management', () => {
  it('creates and lists notes successfully', async () => {
    const saveRes = await executeNotesTool('save_note', {
      title: 'Groceries Test',
      content: 'Milk, Eggs, Bread',
    });

    expect(saveRes.success).toBe(true);
    expect(saveRes.note.title).toBe('Groceries Test');

    const listRes = await executeNotesTool('list_notes', {});
    expect(listRes.success).toBe(true);
    expect(listRes.count).toBeGreaterThanOrEqual(1);

    const readRes = await executeNotesTool('read_note', {
      titleOrId: 'Groceries Test',
    });
    expect(readRes.success).toBe(true);
    expect(readRes.content).toBe('Milk, Eggs, Bread');
  });

  it('searches notes by query keywords', async () => {
    await executeNotesTool('save_note', {
      title: 'Python ML Checklist',
      content: 'TensorFlow, PyTorch, Scikit-learn',
    });

    const searchRes = await executeNotesTool('search_notes', {
      query: 'PyTorch',
    });

    expect(searchRes.success).toBe(true);
    expect(searchRes.results.length).toBeGreaterThanOrEqual(1);
    expect(searchRes.results[0].title).toBe('Python ML Checklist');
  });
});

