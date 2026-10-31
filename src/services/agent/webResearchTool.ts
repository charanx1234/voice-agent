import https from 'https';
import http from 'http';
import { WebSearchResultItem } from '../../shared/types';

export const webResearchToolDefinition = {
  name: 'search_web',
  description:
    'Searches the web for up-to-date information, news, reference documentation, or facts. Returns title, snippet, and source URL.',
  parameters: {
    type: 'OBJECT',
    properties: {
      query: {
        type: 'STRING',
        description: 'The search query to look up on the web.',
      },
    },
    required: ['query'],
  },
};

/**
 * Searches the web via DuckDuckGo API with fallback HTML parsing
 */
export async function executeWebResearchTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  const query = (args.query || '').trim();
  if (!query) {
    return { error: 'Please provide a search query.' };
  }

  try {
    const results = await fetchDuckDuckGoResults(query);
    if (!results || results.length === 0) {
      return {
        success: true,
        query,
        count: 0,
        message: `No immediate web search results found for "${query}".`,
        results: [],
      };
    }

    return {
      success: true,
      query,
      count: results.length,
      results,
      note: 'These results are retrieved from live web search. Present the facts clearly with their source URLs.',
    };
  } catch (err: any) {
    console.error('[WebResearchTool] Search failed:', err);
    return {
      success: false,
      error: `Web search could not be completed: ${err.message || 'Network error'}.`,
    };
  }
}

function fetchDuckDuckGoResults(query: string): Promise<WebSearchResultItem[]> {
  return new Promise((resolve) => {
    // 1. Try DuckDuckGo Instant Answer JSON API
    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

    const req = https.get(
      apiUrl,
      {
        headers: {
          'User-Agent': 'FRIDAY-Desktop-Companion/1.0',
        },
        timeout: 7000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const items: WebSearchResultItem[] = [];

            if (parsed.AbstractText && parsed.AbstractURL) {
              items.push({
                title: parsed.Heading || query,
                snippet: parsed.AbstractText,
                url: parsed.AbstractURL,
              });
            }

            if (Array.isArray(parsed.RelatedTopics)) {
              for (const topic of parsed.RelatedTopics) {
                if (items.length >= 5) break;
                if (topic.Text && topic.FirstURL) {
                  items.push({
                    title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
                    snippet: topic.Text,
                    url: topic.FirstURL,
                  });
                }
              }
            }

            if (items.length > 0) {
              return resolve(items);
            }
          } catch {
            // fallback
          }

          // Fallback: search Wikipedia API if general search yielded empty
          fetchWikipediaFallback(query).then(resolve);
        });
      }
    );

    req.on('error', () => {
      fetchWikipediaFallback(query).then(resolve);
    });

    req.on('timeout', () => {
      req.destroy();
      fetchWikipediaFallback(query).then(resolve);
    });
  });
}

function fetchWikipediaFallback(query: string): Promise<WebSearchResultItem[]> {
  return new Promise((resolve) => {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
      query
    )}&limit=3&namespace=0&format=json`;

    https
      .get(
        wikiUrl,
        {
          headers: { 'User-Agent': 'FRIDAY-Desktop-Companion/1.0' },
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const [q, titles, snippets, urls] = JSON.parse(data);
              const items: WebSearchResultItem[] = [];
              for (let i = 0; i < titles.length; i++) {
                if (urls[i]) {
                  items.push({
                    title: titles[i],
                    snippet: snippets[i] || titles[i],
                    url: urls[i],
                  });
                }
              }
              resolve(items);
            } catch {
              resolve([]);
            }
          });
        }
      )
      .on('error', () => resolve([]));
  });
}

