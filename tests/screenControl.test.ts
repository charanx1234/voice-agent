import { describe, it, expect } from 'vitest';
import { screenControlToolDefinitions, executeScreenControlTool } from '../src/services/agent/screenControlTools';
import { toolRegistry } from '../src/services/agent/toolRegistry';

describe('Windows Screen Understanding and Desktop Control Tools', () => {
  it('registers all screen and desktop control tool definitions', () => {
    const names = screenControlToolDefinitions.map((t) => t.name);
    expect(names).toContain('read_screen');
    expect(names).toContain('get_active_window');
    expect(names).toContain('click_desktop_element');
    expect(names).toContain('type_desktop_text');
    expect(names).toContain('scroll_desktop');
    expect(names).toContain('switch_desktop_window');
    expect(names).toContain('close_desktop_window');
  });

  it('declares screen tools inside Gemini function declarations', () => {
    const decls = toolRegistry.getGeminiToolDeclarations();
    const fnNames = decls[0].functionDeclarations.map((f: any) => f.name);
    expect(fnNames).toContain('read_screen');
    expect(fnNames).toContain('click_desktop_element');
    expect(fnNames).toContain('type_desktop_text');
    expect(fnNames).toContain('scroll_desktop');
  });

  it('enforces required parameters for text typing and window switching', () => {
    const typeTool = screenControlToolDefinitions.find((t) => t.name === 'type_desktop_text');
    expect(typeTool?.parameters.required).toContain('text');

    const switchTool = screenControlToolDefinitions.find((t) => t.name === 'switch_desktop_window');
    expect(switchTool?.parameters.required).toContain('query');
  });

  it('gracefully handles missing parameters for desktop click', async () => {
    const result = await executeScreenControlTool('click_desktop_element', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Either target element name or coordinates');
  });
});
