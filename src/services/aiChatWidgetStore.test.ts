import { beforeEach, describe, expect, it } from 'vitest';

import {
  appendAiChatWidgetMessages,
  clearAiChatWidgetHistory,
  createAiChatWidgetConversation,
  deleteAiChatWidgetMessage,
  deleteAiChatWidgetConversation,
  getAiChatWidgetActiveConversationId,
  getAiChatWidgetConversations,
  getAiChatWidgetHistory,
  getAiChatWidgetStorageKey,
  saveAiChatWidgetHistory,
  setAiChatWidgetActiveConversationId,
  type AiChatWidgetMessage,
} from './aiChatWidgetStore';

const baseMessage = (id: string, createdAt: number): AiChatWidgetMessage => ({
  id,
  role: 'user',
  content: `Message ${id}`,
  createdAt,
  attachments: [],
});

describe('aiChatWidgetStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists timestamped messages and attachment metadata per widget', () => {
    const message: AiChatWidgetMessage = {
      id: 'msg_1',
      role: 'assistant',
      content: 'Here is a reference: https://example.com\n\n![Preview](data:image/png;base64,abc123)',
      createdAt: Date.UTC(2026, 3, 30, 19, 45),
      attachments: [
        {
          id: 'att_1',
          kind: 'image',
          name: 'preview.png',
          mimeType: 'image/png',
          size: 128,
          dataUrl: 'data:image/png;base64,abc123',
        },
      ],
    };

    saveAiChatWidgetHistory('chat-a', [message]);

    expect(getAiChatWidgetHistory('chat-a')).toEqual([message]);
    expect(getAiChatWidgetHistory('chat-b')).toEqual([]);
    expect(JSON.parse(localStorage.getItem(getAiChatWidgetStorageKey('chat-a')) || '[]')).toHaveLength(1);
  });

  it('appends new messages and trims the oldest entries to the requested limit', () => {
    saveAiChatWidgetHistory('chat-a', [
      baseMessage('old', 1),
      baseMessage('middle', 2),
    ]);

    appendAiChatWidgetMessages('chat-a', [baseMessage('new', 3)], 2);

    expect(getAiChatWidgetHistory('chat-a').map((message) => message.id)).toEqual([
      'middle',
      'new',
    ]);
  });

  it('deletes individual messages and can clear all widget history', () => {
    saveAiChatWidgetHistory('chat-a', [
      baseMessage('keep', 1),
      baseMessage('delete', 2),
    ]);

    deleteAiChatWidgetMessage('chat-a', 'delete');
    expect(getAiChatWidgetHistory('chat-a').map((message) => message.id)).toEqual(['keep']);

    clearAiChatWidgetHistory('chat-a');
    expect(getAiChatWidgetHistory('chat-a')).toEqual([]);
  });

  it('keeps multiple selectable conversations per widget', () => {
    const first = createAiChatWidgetConversation('chat-a', {
      title: 'Kitchen plan',
      messages: [baseMessage('kitchen', 10)],
      now: 10,
    });
    const second = createAiChatWidgetConversation('chat-a', {
      title: 'Trip notes',
      messages: [baseMessage('trip', 20)],
      now: 20,
    });

    expect(getAiChatWidgetConversations('chat-a').map((conversation) => conversation.title)).toEqual([
      'Trip notes',
      'Kitchen plan',
    ]);
    expect(getAiChatWidgetActiveConversationId('chat-a')).toBe(second.id);

    setAiChatWidgetActiveConversationId('chat-a', first.id);
    expect(getAiChatWidgetHistory('chat-a').map((message) => message.id)).toEqual(['kitchen']);

    deleteAiChatWidgetConversation('chat-a', first.id);
    expect(getAiChatWidgetConversations('chat-a').map((conversation) => conversation.id)).toEqual([second.id]);
    expect(getAiChatWidgetActiveConversationId('chat-a')).toBe(second.id);
  });

  it('generates concise topic titles for new conversations', () => {
    saveAiChatWidgetHistory('chat-a', [
      {
        id: 'user-chart',
        role: 'user',
        content: 'Can you build a Python bar chart comparing revenue for the top soccer clubs?',
        createdAt: 10,
        attachments: [],
      },
      {
        id: 'assistant-chart',
        role: 'assistant',
        content: 'Here is a matplotlib script for the soccer clubs revenue bar chart.',
        createdAt: 20,
        attachments: [],
      },
    ]);

    expect(getAiChatWidgetConversations('chat-a')[0]?.title).toBe(
      'Python Bar Chart Comparing Revenue for Top Soccer Clubs',
    );
  });
});
