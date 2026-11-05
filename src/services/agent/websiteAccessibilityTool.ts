import { websiteAccessibilityService } from '../accessibility/websiteAccessibilityService';

export const websiteAccessibilityToolDefinitions = [
  {
    name: 'website_open_url',
    description:
      'Opens any website or URL in the FRIDAY accessible browser so the user can interact with and navigate it by voice.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: {
          type: 'STRING',
          description: 'The target website URL (e.g. "https://en.wikipedia.org" or "google.com").',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'website_navigate_page',
    description:
      'Navigates between page elements (heading, paragraph, button, link, form field), scrolls, or moves back in browser history.',
    parameters: {
      type: 'OBJECT',
      properties: {
        target: {
          type: 'STRING',
          description:
            'What to navigate to: "next_heading", "prev_heading", "next_paragraph", "prev_paragraph", "scroll_down", "scroll_up", "go_back", or "find_search".',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'website_read_page',
    description:
      'Reads the page aloud, summarizes website content, or explains what the current page or focused element contains.',
    parameters: {
      type: 'OBJECT',
      properties: {
        mode: {
          type: 'STRING',
          description: '"summary", "read_all", or "explain_element".',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'website_interact',
    description:
      'Interacts with website elements: clicks a button or link, fills a form field, or submits a search.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: '"click", "fill_field", or "search".',
        },
        targetName: {
          type: 'STRING',
          description: 'The name or label of the button, link, or form field.',
        },
        value: {
          type: 'STRING',
          description: 'Value to fill into the input field or search term.',
        },
      },
      required: ['action'],
    },
  },
];

export async function executeWebsiteAccessibilityTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  switch (toolName) {
    case 'website_open_url': {
      const url = String(args.url || '').trim();
      if (!url) return { success: false, error: 'Please provide a URL to open.' };
      await websiteAccessibilityService.setEnabled(true);
      const res = await websiteAccessibilityService.openUrl(url);
      return {
        success: res.success,
        url,
        message: res.success ? `Opened ${url} in accessible browser.` : res.error,
      };
    }

    case 'website_navigate_page': {
      const target = String(args.target || '').toLowerCase();
      let cmd = 'next heading';
      if (target === 'prev_heading') cmd = 'previous heading';
      else if (target === 'next_paragraph') cmd = 'next paragraph';
      else if (target === 'prev_paragraph') cmd = 'previous paragraph';
      else if (target === 'scroll_down') cmd = 'scroll down';
      else if (target === 'scroll_up') cmd = 'scroll up';
      else if (target === 'go_back') cmd = 'go back';
      else if (target === 'find_search') cmd = 'find search box';

      const res = await websiteAccessibilityService.executeNaturalCommand(cmd);
      return {
        success: res.success,
        action: res.action,
        speechText: res.speechText,
        element: res.element ? { type: res.element.type, label: res.element.label || res.element.text } : null,
      };
    }

    case 'website_read_page': {
      const mode = String(args.mode || 'summary').toLowerCase();
      const cmd = mode === 'read_all' ? 'read page' : mode === 'explain_element' ? 'explain this button does' : 'summarize';
      const res = await websiteAccessibilityService.executeNaturalCommand(cmd);
      return {
        success: res.success,
        speechText: res.speechText,
        summary: res.summary,
      };
    }

    case 'website_interact': {
      const action = String(args.action || 'click').toLowerCase();
      const targetName = String(args.targetName || '').trim();
      const value = String(args.value || '').trim();

      let cmd = '';
      if (action === 'click') {
        cmd = `click ${targetName}`;
      } else if (action === 'search') {
        cmd = `search for ${value || targetName}`;
      } else if (action === 'fill_field') {
        cmd = `fill ${targetName} with ${value}`;
      }

      const res = await websiteAccessibilityService.executeNaturalCommand(cmd);
      return {
        success: res.success,
        speechText: res.speechText,
        needsDisambiguation: res.needsDisambiguation,
        options: res.options,
      };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}
