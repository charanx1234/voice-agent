import { EventEmitter } from 'events';
import { DashboardArtifact, DashboardArtifactKind } from '../../shared/types';

export const DASHBOARD_KINDS: DashboardArtifactKind[] = [
  'code',
  'document',
  'list',
  'table',
  'markdown',
];

const MAX_CONTENT_LENGTH = 40_000;

/** Carries visual output from the agent layer to the renderer dashboard. */
class DashboardBus extends EventEmitter {
  public publish(artifact: DashboardArtifact): void {
    this.emit('artifact', artifact);
  }
}

export const dashboardBus = new DashboardBus();

/** Validates and normalises an artifact requested by the model. */
export function sanitizeArtifact(input: {
  title?: unknown;
  kind?: unknown;
  content?: unknown;
  language?: unknown;
}): DashboardArtifact | null {
  const content = String(input.content ?? '').slice(0, MAX_CONTENT_LENGTH);
  if (!content.trim()) return null;

  const title = String(input.title ?? '').trim().slice(0, 120) || 'Untitled';
  const kind = DASHBOARD_KINDS.includes(input.kind as DashboardArtifactKind)
    ? (input.kind as DashboardArtifactKind)
    : 'document';
  const language = input.language ? String(input.language).slice(0, 40) : undefined;

  return {
    id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    kind,
    content,
    language,
    createdAt: new Date().toISOString(),
  };
}

export const dashboardToolDefinition = {
  name: 'show_on_dashboard',
  description:
    'Shows visual output (code, a document, a list, a table, or markdown) on the dashboard panel while the conversation continues. Use this whenever the user asks for something they should read or keep, such as code, a plan, a document, a list or a table. Always follow it with a short spoken summary.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: {
        type: 'STRING',
        description: 'Short title shown as the dashboard tab, e.g. "Python retry helper".',
      },
      kind: {
        type: 'STRING',
        description: 'One of: code, document, list, table, markdown.',
      },
      content: {
        type: 'STRING',
        description: 'The complete content to display. For code, include the full code without markdown fences.',
      },
      language: {
        type: 'STRING',
        description: 'Optional language hint for code, e.g. "python", "typescript".',
      },
    },
    required: ['title', 'kind', 'content'],
  },
};

export async function executeDashboardTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  if (toolName !== 'show_on_dashboard') {
    return { success: false, error: `Unknown dashboard tool: ${toolName}` };
  }

  const artifact = sanitizeArtifact(args);
  if (!artifact) {
    return { success: false, error: 'There was no content to show on the dashboard.' };
  }

  dashboardBus.publish(artifact);

  return {
    success: true,
    message: `Displayed "${artifact.title}" on the dashboard. Give the user a brief spoken summary.`,
    artifactId: artifact.id,
  };
}
