import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from '../../../services/dashboardTypes';
import MailWidget from './MailWidget';

vi.mock('../../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    headline: 'font-headline',
    onSurface: 'text-surface',
    onSurfaceVariant: 'text-variant',
  }),
}));

vi.mock('../../../hooks/useWidgetSize', () => ({
  useWidgetSize: () => ({
    w: 3,
    h: 3,
    area: 9,
    sizeClass: 'large',
    isWide: true,
    isTall: true,
    isCompact: false,
    pixelWidth: 480,
    pixelHeight: 420,
  }),
}));

vi.mock('../../../hooks/useDashboardRefresh', () => ({
  useDashboardRefresh: () => ({
    refreshNow: vi.fn(),
  }),
}));

vi.mock('../../../utils/settingsStorage', () => ({
  useGmailAccessToken: () => '',
  useGmailReplyEnabled: () => false,
  useOutlookMailAccessToken: () => '',
  useOutlookReplyEnabled: () => false,
}));

vi.mock('../../../services/zapierMcpWidgetService', () => ({
  listZapierMailMessages: vi.fn(async () => ({ messages: [], totalUnread: 0 })),
  listMcpMailMessages: vi.fn(async () => ({
    messages: [],
    totalUnread: 0,
    debug: {
      serverName: 'Mock MCP',
      toolName: 'email_search',
      toolArgs: {},
      rawResultPreview: '',
      normalizedCount: 0,
    },
  })),
  readZapierMailThread: vi.fn(),
  sendZapierEmail: vi.fn(),
  sendZapierEmailReply: vi.fn(),
}));

const widget: DashboardWidget = {
  id: 'mail-zapier',
  type: 'mail',
  position: 0,
  size: 'large',
  enabled: true,
  config: {
    w: 3,
    h: 3,
    mailProvider: 'zapier',
  },
};

describe('MailWidget', () => {
  it('renders Zapier as a first-class mail provider', () => {
    render(<MailWidget widget={widget} />);

    expect(screen.getByText('Zapier Inbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compose new email' })).toBeInTheDocument();
  });
});
