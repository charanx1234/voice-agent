import { WebSearchResultItem } from '../../shared/types';
import { executeWebResearchTool } from './webResearchTool';

export const researchToolDefinition = {
  name: 'deep_research',
  description:
    'Researches a topic across several web queries, merges the results and returns deduplicated sources with URLs. Use it for comparisons, factual research or anything where multiple sources matter. Then summarise, note disagreements between sources, and cite the links.',
  parameters: {
    type: 'OBJECT',
    properties: {
      topic: {
        type: 'STRING',
        description: 'The topic or question to research.',
      },
    },
    required: ['topic'],
  },
};

/** Deduplicates search results by URL, keeping the first (most relevant) copy. */
export function dedupeSources(items: WebSearchResultItem[]): WebSearchResultItem[] {
  const seen = new Set<string>();
  const out: WebSearchResultItem[] = [];

  for (const item of items) {
    if (!item?.url) continue;
    const key = item.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

/** Word-overlap check so near-duplicate titles from different URLs are still kept. */
export function hasOverlappingTitles(a: WebSearchResultItem, b: WebSearchResultItem): boolean {
  const words = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 3)
    );

  const left = words(a.title);
  const right = words(b.title);
  if (left.size === 0 || right.size === 0) return false;

  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / Math.min(left.size, right.size) > 0.8;
}

export async function executeResearchTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  if (toolName !== 'deep_research') {
    return { success: false, error: `Unknown research tool: ${toolName}` };
  }

  const topic = (args.topic || '').trim();
  if (!topic) return { success: false, error: 'What should I research?' };

  const queries = [topic, `${topic} explained`, `${topic} limitations criticism`];

  const batches = await Promise.all(
    queries.map(async (query) => {
      try {
        const result = await executeWebResearchTool('search_web', { query });
        return Array.isArray(result?.results) ? result.results : [];
      } catch {
        return [];
      }
    })
  );

  const merged = dedupeSources(batches.flat());
  const unique: WebSearchResultItem[] = [];
  for (const item of merged) {
    if (unique.some((existing) => hasOverlappingTitles(existing, item))) continue;
    unique.push(item);
    if (unique.length >= 8) break;
  }

  return {
    success: true,
    topic,
    count: unique.length,
    results: unique,
    guidance:
      'Summarise the findings, explicitly flag where sources disagree, separate well-supported facts from speculation, and cite each source URL. If the sources are thin, say so instead of padding.',
  };
}
