import { describe, it, expect, vi } from 'vitest';
import { FastLocalIntentRouter } from '../src/services/agent/fastLocalIntent';
import { workspacesService } from '../src/services/quicktools/workspacesService';

describe('Phase 2 & Phase 3 QuickTools FastLocalIntent', () => {
  const router = new FastLocalIntentRouter();

  it('matches side-by-side window layout intent', async () => {
    const res = await router.tryRoute('put chrome on the left and vs code on the right');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0].toolName).toBe('arrange_windows');
    expect(res?.toolCalls?.[0].args.action).toBe('side_by_side');
  });

  it('matches single window snap left intent', async () => {
    const res = await router.tryRoute('snap window to left');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0].toolName).toBe('arrange_windows');
    expect(res?.toolCalls?.[0].args.action).toBe('split_left');
  });

  it('matches single window snap right intent', async () => {
    const res = await router.tryRoute('snap to right');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0].toolName).toBe('arrange_windows');
    expect(res?.toolCalls?.[0].args.action).toBe('split_right');
  });

  it('matches center window intent', async () => {
    const res = await router.tryRoute('center window');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0].toolName).toBe('arrange_windows');
    expect(res?.toolCalls?.[0].args.action).toBe('center');
  });

  it('matches quick note capture intent', async () => {
    const res = await router.tryRoute('remember this note: finish the vitest suite');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0].toolName).toBe('manage_quick_notes');
    expect(res?.response).toContain('Saved note');
  });

  it('matches idea capture intent', async () => {
    const res = await router.tryRoute('save this as an idea: build a local rag system');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0].toolName).toBe('manage_quick_notes');
    expect(res?.response).toContain('Captured idea');
  });

  it('matches list notes intent', async () => {
    const res = await router.tryRoute('show my notes');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0].toolName).toBe('manage_quick_notes');
  });

  it('matches workspace launch intent', async () => {
    const spy = vi.spyOn(workspacesService, 'launchWorkspace').mockResolvedValueOnce({
      success: true,
      launchedCount: 2,
      errors: [],
    });

    const res = await router.tryRoute('start coding mode');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0].toolName).toBe('manage_workspaces');
    expect(res?.toolCalls?.[0].args.action).toBe('launch');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('matches list workspaces intent', async () => {
    const res = await router.tryRoute('list workspaces');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0].toolName).toBe('manage_workspaces');
    expect(res?.response).toContain('Coding Mode');
  });

  it('matches file search intent', async () => {
    const res = await router.tryRoute('find my latest pdf files');
    expect(res?.matched).toBe(true);
    expect(res?.intent).toBe('quicktools');
    expect(res?.toolCalls?.[0].toolName).toBe('search_files_nlp');
  });
});
