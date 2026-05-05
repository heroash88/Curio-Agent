import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GenericMcpServerConfig } from '../utils/settingsStorage';
import {
  fetchNotionWidgetItem,
  findEnabledNotionMcpServer,
  listNotionWidgetItems,
  normalizeNotionWidgetItems,
  type NotionWidgetItem,
} from './notionMcpWidgetService';

const notionServer: GenericMcpServerConfig = {
  id: 'notion-workspace',
  name: 'Notion Workspace',
  url: 'https://mcp.notion.com/mcp',
  enabled: true,
  kind: 'general',
  authType: 'oauth',
};

const mcpToolCall = vi.fn();

vi.mock('../utils/settingsStorage', () => ({
  getEnabledGenericMcpServers: vi.fn(() => [notionServer]),
}));

vi.mock('./genericMcpService', () => ({
  prepareGenericMcpTools: vi.fn(async () => ({
    toolNames: ['notion_workspace__search', 'notion_workspace__fetch'],
    callTool: mcpToolCall,
  })),
}));

describe('notionMcpWidgetService', () => {
  beforeEach(() => {
    mcpToolCall.mockReset();
  });

  it('finds the enabled Notion MCP server from generic MCP settings', () => {
    expect(findEnabledNotionMcpServer()).toMatchObject({
      id: 'notion-workspace',
      url: 'https://mcp.notion.com/mcp',
    });
  });

  it('normalizes Notion search results into note-shaped widget items', async () => {
    mcpToolCall.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [
              {
                id: 'page-1',
                title: 'Weekly Lab Notes',
                url: 'https://notion.so/page-1',
                last_edited_time: '2026-05-02T12:00:00.000Z',
                properties: {
                  Summary: { rich_text: [{ plain_text: 'Prototype readings and next steps.' }] },
                },
              },
            ],
          }),
        },
      ],
    });

    await expect(listNotionWidgetItems({ kind: 'notes', query: 'notes' })).resolves.toEqual<NotionWidgetItem[]>([
      {
        id: 'page-1',
        title: 'Weekly Lab Notes',
        preview: 'Prototype readings and next steps.',
        url: 'https://notion.so/page-1',
        updatedAt: Date.parse('2026-05-02T12:00:00.000Z'),
        status: undefined,
        dueDate: undefined,
      },
    ]);
    expect(mcpToolCall).toHaveBeenCalledWith('notion_workspace__search', expect.objectContaining({
      query: 'notes',
    }));
  });

  it('normalizes Notion project/task properties for dashboard task rows', async () => {
    mcpToolCall.mockResolvedValueOnce({
      results: [
        {
          id: 'task-1',
          properties: {
            Name: { title: [{ plain_text: 'Ship Notion widget' }] },
            Status: { status: { name: 'In progress' } },
            Due: { date: { start: '2026-05-06' } },
          },
        },
      ],
    });

    await expect(listNotionWidgetItems({ kind: 'projects', query: 'project tasks' })).resolves.toEqual([
      expect.objectContaining({
        id: 'task-1',
        title: 'Ship Notion widget',
        status: 'In progress',
        dueDate: '2026-05-06',
      }),
    ]);
  });

  it('keeps widget URLs external and generates a Notion URL from page IDs', () => {
    const [item] = normalizeNotionWidgetItems({
      results: [
        {
          id: '0123456789abcdef0123456789abcdef',
          title: 'Test Curio',
          url: '/Test-Curio-0123456789abcdef0123456789abcdef',
        },
      ],
    });

    expect(item).toMatchObject({
      id: '0123456789abcdef0123456789abcdef',
      title: 'Test Curio',
      url: 'https://www.notion.so/0123456789abcdef0123456789abcdef',
    });
  });

  it('fetches a selected Notion item through the MCP fetch tool for in-widget reading', async () => {
    mcpToolCall.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            page: {
              id: 'page-1',
              title: 'Weekly Lab Notes',
              url: 'https://www.notion.so/page-1',
            },
            blocks: [
              {
                paragraph: {
                  rich_text: [{ plain_text: 'Detailed note body from Notion.' }],
                },
              },
            ],
          }),
        },
      ],
    });

    await expect(fetchNotionWidgetItem({
      id: 'page-1',
      title: 'Weekly Lab Notes',
      url: 'https://www.notion.so/page-1',
    })).resolves.toEqual(expect.objectContaining({
      id: 'page-1',
      title: 'Weekly Lab Notes',
      url: 'https://www.notion.so/page-1',
      content: expect.stringContaining('Detailed note body from Notion.'),
    }));
    expect(mcpToolCall).toHaveBeenCalledWith('notion_workspace__fetch', expect.objectContaining({
      id: 'page-1',
    }));
  });

  it('strips Notion MCP database metadata from fetched note details', async () => {
    mcpToolCall.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: `
<database url="{{https://www.notion.so/0123456789abcdef0123456789abcdef}}" inline="false" icon="pencil">
The title of this Database is: Meeting Notes
Here are the Database's Data Sources:
You can use the "view" tool on the URL of any Data Source to see its full schema configuration.
<data-sources>
<data-source url="{{collection://10b1e190-b081-423e-9386-6238667032b3}}">
The title of this Data Source is: Meeting Notes
Here is the Data Source's schema configuration:
<properties>
{"Meeting Notes":{"description":"","dataSourceUrl":"{{collection://10b1e190-b081-423e-9386-6238667032b3}}","propertyType":"title"}}
</properties>
</data-source>
</data-sources>
<records>
<record url="{{https://www.notion.so/Sprint-Review-abcdefabcdefabcdefabcdefabcdefab}}" icon="document">
The title of this Page is: Sprint Review
# Sprint Review
- Demo Curio dashboard
- Note action items
</record>
</records>
</database>
`.trim(),
        },
      ],
    });

    const detail = await fetchNotionWidgetItem({
      id: '0123456789abcdef0123456789abcdef',
      title: 'Meeting Notes',
      preview: 'Meeting notes database',
      url: 'https://www.notion.so/0123456789abcdef0123456789abcdef',
    });

    expect(detail.content).toContain('# Sprint Review');
    expect(detail.content).toContain('- Demo Curio dashboard');
    expect(detail.content).not.toMatch(/<database|<data-source|propertyType|schema configuration|view" tool|Database's Data Sources|Data Source/i);
  });
});
