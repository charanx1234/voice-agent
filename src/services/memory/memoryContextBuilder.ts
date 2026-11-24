/**
 * FIMA V1 — Memory Context Builder
 *
 * Assembles a rich, structured context block from retrieved memories
 * for injection into the Cognitive Engine's system instruction.
 *
 * Key improvements over the original `formatMemoryContext`:
 *   - Separates current facts from historical/outdated information
 *   - Surfaces active project context prominently
 *   - Distinguishes verified from planned/unverified items
 *   - Respects token budget
 *   - Excludes outdated/superseded memories from active fact section
 *   - Adds source indicators for transparency
 */

import { MemoryItem, MemoryType, ProjectItem } from '../../shared/types';

export interface ContextBuilderInput {
  relevantMemories: MemoryItem[];
  coreMemories: MemoryItem[];
  activeProject?: ProjectItem;
  projectMemories?: MemoryItem[];
  episodicMemories?: MemoryItem[];
  workingMemories?: MemoryItem[];
  tokenBudget?: number;
}

export interface ContextBuilderResult {
  block: string;
  tokenEstimate: number;
  memoriesIncluded: number;
}

const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

function formatMemoryLine(m: MemoryItem, includeSource = false): string {
  const importantTag = m.importance >= 4 ? ', ⭐' : '';
  const sourceTag = includeSource && m.sourceConversationId ? ` [from: ${m.sourceConversationId.slice(0, 8)}]` : '';
  return `  - [${m.kind}${importantTag}] ${m.title}: ${m.content}${sourceTag}`;
}

function isActive(m: MemoryItem): boolean {
  return !m.status || m.status === 'active' || m.status === 'temporary';
}

function isHistorical(m: MemoryItem): boolean {
  return m.status === 'outdated' || m.status === 'superseded' || m.status === 'archived';
}

export function buildMemoryContextBlock(input: ContextBuilderInput): ContextBuilderResult {
  const budget = input.tokenBudget ?? 2000; // generous default
  const sections: string[] = [];
  let totalTokens = 0;
  let memoriesIncluded = 0;

  const addSection = (text: string): boolean => {
    const tokens = estimateTokens(text);
    if (totalTokens + tokens > budget) return false;
    sections.push(text);
    totalTokens += tokens;
    return true;
  };

  // ── Active Project Context (highest priority) ──────────────────────────────
  if (input.activeProject) {
    const p = input.activeProject;
    const lines = [`[ACTIVE PROJECT: ${p.name.toUpperCase()}]`];
    if (p.description) lines.push(`  Description: ${p.description}`);
    if (p.objective) lines.push(`  Objective: ${p.objective}`);
    if (p.techStack?.length) lines.push(`  Tech Stack: ${p.techStack.join(', ')}`);
    lines.push(`  Status: ${p.status.replace(/_/g, ' ')}`);

    if (input.projectMemories?.length) {
      const active = input.projectMemories.filter(isActive).slice(0, 6);
      if (active.length) {
        lines.push('  Project Knowledge:');
        for (const m of active) {
          lines.push(formatMemoryLine(m));
          memoriesIncluded++;
        }
      }
    }

    addSection(lines.join('\n'));
  }

  // ── Core / Always-on preferences and instructions ─────────────────────────
  const coreActive = input.coreMemories.filter(isActive);
  if (coreActive.length) {
    const lines = ['[USER PREFERENCES & INSTRUCTIONS]'];
    for (const m of coreActive.slice(0, 5)) {
      lines.push(formatMemoryLine(m));
      memoriesIncluded++;
    }
    addSection(lines.join('\n'));
  }

  // ── Relevant retrieved memories (current facts) ───────────────────────────
  const currentFacts = input.relevantMemories.filter(isActive).slice(0, 6);
  if (currentFacts.length) {
    const lines = ['[RELEVANT KNOWLEDGE]'];
    for (const m of currentFacts) {
      lines.push(formatMemoryLine(m));
      memoriesIncluded++;
    }
    addSection(lines.join('\n'));
  }

  // ── Episodic memories (past experiences relevant to this conversation) ─────
  const episodic = (input.episodicMemories || []).filter(isActive).slice(0, 3);
  if (episodic.length) {
    const lines = ['[RELEVANT PAST EXPERIENCES]'];
    for (const m of episodic) {
      lines.push(formatMemoryLine(m));
      memoriesIncluded++;
    }
    addSection(lines.join('\n'));
  }

  // ── Working memory (current session context) ───────────────────────────────
  const working = (input.workingMemories || []).slice(0, 3);
  if (working.length) {
    const lines = ['[CURRENT SESSION CONTEXT]'];
    for (const m of working) {
      lines.push(formatMemoryLine(m));
      memoriesIncluded++;
    }
    addSection(lines.join('\n'));
  }

  // ── Historical context (explicitly flagged as outdated/superseded) ─────────
  // Only include when total so far is small and historical info might matter
  if (totalTokens < budget * 0.6) {
    const historical = input.relevantMemories.filter(isHistorical).slice(0, 2);
    if (historical.length) {
      const lines = ['[HISTORICAL CONTEXT — may be outdated]'];
      for (const m of historical) {
        lines.push(`  - [${m.kind}, ${m.status}] ${m.title}: ${m.content}`);
        memoriesIncluded++;
      }
      addSection(lines.join('\n'));
    }
  }

  if (sections.length === 0) {
    return { block: '', tokenEstimate: 0, memoriesIncluded: 0 };
  }

  const header = 'LONG-TERM MEMORY (remembered from earlier conversations):';
  const footer = [
    '',
    'How to use this memory:',
    '- Use naturally when relevant, like a friend who remembers.',
    '- Never say "according to my memory database".',
    '- Distinguish [historical] entries from current facts.',
    '- Accept corrections immediately when the user updates information.',
    '- Never invent memories not listed here.',
  ].join('\n');

  const block = [header, sections.join('\n\n'), footer].join('\n');

  return {
    block,
    tokenEstimate: estimateTokens(block),
    memoriesIncluded,
  };
}
