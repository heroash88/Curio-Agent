import { describe, expect, it } from 'vitest';

import { getCurioSystemPrompt } from './curioSystemPrompt';

describe('getCurioSystemPrompt', () => {
  it('keeps Gemini Live search tool names in their matching Live modes', () => {
    expect(getCurioSystemPrompt(undefined, undefined, undefined, undefined, undefined, true))
      .toContain("'googleSearch' tool");
    expect(getCurioSystemPrompt(undefined, undefined, undefined, undefined, undefined, false))
      .toContain("'google_search' tool");
  });

  it('does not mention Live-only search tools for custom text LLM provider search', () => {
    const prompt = getCurioSystemPrompt(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'provider-native-search',
    );

    expect(prompt).toContain('provider-native search or grounding');
    expect(prompt).not.toContain('google_search');
    expect(prompt).not.toContain('googleSearch');
    expect(prompt).not.toContain('Search tool results are your source of truth');
    expect(prompt).not.toContain('MUST use search tools');
    expect(prompt).not.toContain('search tools');
  });

  it('describes external MCP search without naming Live-only search tools', () => {
    const prompt = getCurioSystemPrompt(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'external-mcp-search',
    );

    expect(prompt).toContain('external MCP search tools');
    expect(prompt).toContain('External MCP search results are your source of truth');
    expect(prompt).not.toContain('google_search');
    expect(prompt).not.toContain('googleSearch');
  });

  it('omits disconnected connected-service tool names from custom text prompts', () => {
    const prompt = getCurioSystemPrompt(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'provider-native-search',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        customTextTools: true,
        homeAssistant: false,
        calendar: false,
        googleCalendar: false,
        outlookCalendar: false,
        gmail: false,
        outlookMail: false,
        slack: false,
        obsidian: false,
      },
    );

    for (const absentName of [
      'toggleCamera',
      'flipCamera',
      'show_camera',
      'get_calendar_events',
      'create_calendar_event',
      'check_gmail',
      'get_outlook_events',
      'check_outlook_mail',
      'send_slack_message',
      'obsidian_',
    ]) {
      expect(prompt).not.toContain(absentName);
    }

    expect(prompt).toContain('inspect_camera_view');
    expect(prompt).toContain('These services are not connected');
  });

  it('does not tell Outlook-only calendar users that all calendar editing is unavailable', () => {
    const prompt = getCurioSystemPrompt(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'provider-native-search',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        customTextTools: true,
        calendar: true,
        googleCalendar: false,
        outlookCalendar: true,
      },
    );

    expect(prompt).toContain('For Outlook calendar edits, use the Outlook calendar tools below.');
    expect(prompt).toContain('get_outlook_events');
    expect(prompt).not.toContain('Calendar editing is unavailable unless Google Calendar is connected.');
  });

  it('keeps dashboard and voice replies short by default', () => {
    const prompt = getCurioSystemPrompt();

    expect(prompt).toContain('Default to one short sentence');
    expect(prompt).toContain('Ask one short clarifying question');
    expect(prompt).toContain('Do not explain tool names, IDs, schemas, or backend requirements');
  });
});
