import { beforeEach, describe, expect, it } from 'vitest';

import { getBuiltInToolDeclarations } from '../toolDeclarations';
import { getToolHandler } from '../toolCallRouter';

import {
  CUSTOM_CAMERA_TOOL_NAME,
  buildCustomLLMToolDefinitions,
} from './toolSchema';

describe('custom LLM tool schema', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exposes Curio card, widget, and app tools to text LLM providers', () => {
    const tools = buildCustomLLMToolDefinitions();
    const names = new Set(tools.map((tool) => tool.name));

    for (const declaration of getBuiltInToolDeclarations()) {
      if (
        !declaration.name ||
        declaration.name === 'toggleCamera' ||
        declaration.name === 'flipCamera' ||
        declaration.name === 'disconnectSession' ||
        [
          'show_camera',
          'close_camera',
          'show_thermostat',
          'show_energy',
          'show_security',
          'show_sensor_reading',
          'show_home_status',
          'get_calendar_events',
          'create_calendar_event',
          'update_calendar_event',
          'delete_calendar_event',
          'obsidian_search_notes',
          'obsidian_read_note',
          'obsidian_create_note',
          'obsidian_append_note',
          'check_gmail',
          'reply_gmail',
          'get_outlook_events',
          'create_outlook_event',
          'update_outlook_event',
          'delete_outlook_event',
          'check_outlook_mail',
          'reply_outlook_mail',
          'send_outlook_mail',
          'send_slack_message',
          'get_slack_messages',
          'list_slack_channels',
        ].includes(declaration.name)
      ) {
        continue;
      }
      expect(names.has(declaration.name), `${declaration.name} should be exposed to the text LLM`).toBe(true);
    }

    expect(names.has('open_dashboard_widget')).toBe(true);
    expect(names.has('get_weather')).toBe(true);
    expect(names.has('show_stopwatch')).toBe(true);
    expect(names.has('list_notifications')).toBe(true);
    expect(names.has('list_routines')).toBe(true);
    expect(names.has(CUSTOM_CAMERA_TOOL_NAME)).toBe(true);
  });

  it('does not expose disconnected integration tools to text LLM providers', () => {
    const tools = buildCustomLLMToolDefinitions();
    const names = new Set(tools.map((tool) => tool.name));
    const serializedTools = JSON.stringify(tools);

    expect(names.has('get_weather')).toBe(true);
    expect(names.has('setTimer')).toBe(true);
    expect(names.has('show_camera')).toBe(false);
    expect(names.has('show_home_status')).toBe(false);
    expect(names.has('get_calendar_events')).toBe(false);
    expect(names.has('create_calendar_event')).toBe(false);
    expect(names.has('check_gmail')).toBe(false);
    expect(names.has('get_outlook_events')).toBe(false);
    expect(names.has('check_outlook_mail')).toBe(false);
    expect(names.has('send_slack_message')).toBe(false);
    expect(names.has('obsidian_search_notes')).toBe(false);
    expect(names.has('google_search')).toBe(false);
    expect(serializedTools).not.toContain('google_search');
    expect(serializedTools).not.toContain('googleSearch');
  });

  it('recomputes connected integration tools from current settings each turn', () => {
    localStorage.setItem('gemini_live_api_key', 'gemini-live-key');
    localStorage.setItem('curio_ha_mcp_enabled', 'true');
    localStorage.setItem('curio_ha_mcp_token', 'ha-token');
    localStorage.setItem('curio_google_calendar_access_token', 'google-calendar-token');
    localStorage.setItem('curio_gmail_access_token', 'gmail-token');
    localStorage.setItem('curio_outlook_calendar_token', 'outlook-calendar-token');
    localStorage.setItem('curio_outlook_mail_token', 'outlook-mail-token');
    localStorage.setItem('curio_slack_token', 'slack-token');
    localStorage.setItem('curio_obsidian_enabled', 'true');
    localStorage.setItem('curio_obsidian_api_key', 'obsidian-token');

    let names = new Set(buildCustomLLMToolDefinitions().map((tool) => tool.name));

    expect(names.has('show_camera')).toBe(true);
    expect(names.has('show_home_status')).toBe(true);
    expect(names.has('get_calendar_events')).toBe(true);
    expect(names.has('create_calendar_event')).toBe(true);
    expect(names.has('check_gmail')).toBe(true);
    expect(names.has('get_outlook_events')).toBe(true);
    expect(names.has('check_outlook_mail')).toBe(true);
    expect(names.has('send_slack_message')).toBe(true);
    expect(names.has('obsidian_search_notes')).toBe(true);
    expect(names.has('google_search')).toBe(false);

    localStorage.removeItem('gemini_live_api_key');
    localStorage.removeItem('curio_ha_mcp_token');
    localStorage.removeItem('curio_google_calendar_access_token');
    localStorage.removeItem('curio_gmail_access_token');
    localStorage.removeItem('curio_outlook_calendar_token');
    localStorage.removeItem('curio_outlook_mail_token');
    localStorage.removeItem('curio_slack_token');
    localStorage.setItem('curio_obsidian_enabled', 'false');

    names = new Set(buildCustomLLMToolDefinitions().map((tool) => tool.name));

    expect(names.has('show_camera')).toBe(false);
    expect(names.has('show_home_status')).toBe(false);
    expect(names.has('get_calendar_events')).toBe(false);
    expect(names.has('create_calendar_event')).toBe(false);
    expect(names.has('check_gmail')).toBe(false);
    expect(names.has('get_outlook_events')).toBe(false);
    expect(names.has('check_outlook_mail')).toBe(false);
    expect(names.has('send_slack_message')).toBe(false);
    expect(names.has('obsidian_search_notes')).toBe(false);
    expect(names.has('google_search')).toBe(false);
    expect(names.has('get_weather')).toBe(true);
  });

  it('drops stale Home Assistant MCP tools after the integration is disconnected', () => {
    const haTool = {
      name: 'homeassistant__light__turn_on',
      description: 'Turns on a Home Assistant light.',
      parameters: {
        type: 'OBJECT',
        properties: {
          entity_id: { type: 'STRING' },
        },
      },
    } as any;

    expect(buildCustomLLMToolDefinitions([haTool]).map((tool) => tool.name))
      .not.toContain('homeassistant__light__turn_on');

    localStorage.setItem('curio_ha_mcp_enabled', 'true');
    localStorage.setItem('curio_ha_mcp_token', 'ha-token');

    expect(buildCustomLLMToolDefinitions([haTool]).map((tool) => tool.name))
      .toContain('homeassistant__light__turn_on');

    localStorage.removeItem('curio_ha_mcp_token');

    expect(buildCustomLLMToolDefinitions([haTool]).map((tool) => tool.name))
      .not.toContain('homeassistant__light__turn_on');
  });

  it('allows the caller to suppress Home Assistant tools when runtime preparation failed', () => {
    localStorage.setItem('curio_ha_mcp_enabled', 'true');
    localStorage.setItem('curio_ha_mcp_token', 'ha-token');

    const haTool = {
      name: 'homeassistant__light__turn_on',
      description: 'Turns on a Home Assistant light.',
      parameters: { type: 'OBJECT', properties: {} },
    } as any;
    const names = new Set(buildCustomLLMToolDefinitions([haTool], {
      homeAssistant: false,
    }).map((tool) => tool.name));

    expect(names.has('show_camera')).toBe(false);
    expect(names.has('show_home_status')).toBe(false);
    expect(names.has('homeassistant__light__turn_on')).toBe(false);
    expect(names.has(CUSTOM_CAMERA_TOOL_NAME)).toBe(true);
  });

  it('exposes prepared non-Home-Assistant MCP tools to text LLM providers', () => {
    const exaTool = {
      name: 'web_search_exa',
      description: 'Search MCP for current web information.',
      parameters: { type: 'object', properties: { query: { type: 'STRING' } }, required: ['query'] },
    } as any;

    const names = new Set(buildCustomLLMToolDefinitions([exaTool]).map((tool) => tool.name));

    expect(names.has('web_search_exa')).toBe(true);
  });

  it('only exposes tools that the app can execute locally or through the special camera bridge', () => {
    const tools = buildCustomLLMToolDefinitions();

    for (const tool of tools) {
      const executable =
        tool.name === CUSTOM_CAMERA_TOOL_NAME ||
        Boolean(getToolHandler(tool.name));

      expect(executable, `${tool.name} should have an executable handler`).toBe(true);
    }
  });

});
