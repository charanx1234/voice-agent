import { describe, it, expect } from 'vitest';
import { toolRegistry } from '../src/services/agent/toolRegistry';
import { systemControlToolDefinitions, executeSystemControlTool } from '../src/services/agent/systemControlTools';

describe('System Control Tools & Tool Registry Integration', () => {
  it('declares all new system tools in Gemini tool declarations', () => {
    const decls = toolRegistry.getGeminiToolDeclarations();
    const fnNames = decls[0].functionDeclarations.map((f: any) => f.name);

    expect(fnNames).toContain('control_system_volume');
    expect(fnNames).toContain('control_system_brightness');
    expect(fnNames).toContain('get_time_date_info');
    expect(fnNames).toContain('get_live_weather');
    expect(fnNames).toContain('move_mouse_cursor');
  });

  it('executes volume control tool via tool registry', async () => {
    const res = await toolRegistry.executeTool('control_system_volume', { action: 'get' });
    expect(res).toBeDefined();
    if (res.success) {
      expect(typeof res.volume).toBe('number');
      expect(res.summary).toContain('%');
    }
  });

  it('executes time & date tool via tool registry', async () => {
    const res = await toolRegistry.executeTool('get_time_date_info', { query_type: 'time' });
    expect(res.success).toBe(true);
    expect(res.time12h).toBeDefined();
    expect(res.formattedText).toMatch(/It's currently/);
  });

  it('executes live weather tool via tool registry', async () => {
    const res = await toolRegistry.executeTool('get_live_weather', { city: 'Hyderabad', timeframe: 'current' });
    expect(res).toBeDefined();
    if (res.success) {
      expect(res.city).toBe('Hyderabad');
      expect(res.formattedText).toContain('Hyderabad');
    }
  });

  it('executes mouse move and click tools via tool registry', async () => {
    const res = await toolRegistry.executeTool('move_mouse_cursor', { position: 'center' });
    expect(res).toBeDefined();
    expect(res.success).toBe(true);
    expect(res.details).toContain('center');
  });
});
