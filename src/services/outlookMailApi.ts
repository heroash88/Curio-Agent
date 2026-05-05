// src/services/outlookMailApi.ts
// Microsoft Outlook Mail API via Microsoft Graph.
// Mirrors the pattern of gmailApi.ts.

import {
  getOutlookMailAccessToken,
  setOutlookMailAccessToken,
} from "../utils/settingsStorage";
import { signInWithMicrosoft, silentRefreshMicrosoft } from "./microsoftOAuth";
import { hasRecentUserInteraction } from "./googleOAuth";
import type { OutlookMailMessage } from "./cardTypes";

const GRAPH_API = "https://graph.microsoft.com/v1.0";
const MAIL_SCOPES = ["Mail.Read", "Mail.Send"];

// -- Helpers --

async function ensureToken(): Promise<string> {
  let token = getOutlookMailAccessToken();
  if (token) return token;

  // Try silent refresh first (hidden iframe, no UI)
  try {
    const result = await silentRefreshMicrosoft(MAIL_SCOPES);
    token = result.accessToken;
    setOutlookMailAccessToken(token);
    return token;
  } catch { /* silent refresh failed */ }

  if (!hasRecentUserInteraction()) {
    throw new Error('Outlook Mail token expired. Interact with the page to re-authenticate.');
  }
  const result = await signInWithMicrosoft(MAIL_SCOPES);
  token = result.accessToken;
  setOutlookMailAccessToken(token);
  return token;
}

async function graphFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await ensureToken();
  const res = await fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    setOutlookMailAccessToken("");

    // Try silent refresh first
    try {
      const silentResult = await silentRefreshMicrosoft(MAIL_SCOPES);
      setOutlookMailAccessToken(silentResult.accessToken);
      return fetch(`${GRAPH_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${silentResult.accessToken}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
    } catch { /* silent refresh failed */ }

    if (!hasRecentUserInteraction()) {
      throw new Error('Outlook Mail token expired. Interact with the page to re-authenticate.');
    }
    const freshToken = (await signInWithMicrosoft(MAIL_SCOPES)).accessToken;
    setOutlookMailAccessToken(freshToken);
    return fetch(`${GRAPH_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${freshToken}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  }
  return res;
}

function parseMessage(m: any): OutlookMailMessage {
  return {
    id: m.id,
    conversationId: m.conversationId || m.id,
    from: m.from?.emailAddress?.address || "",
    fromName: m.from?.emailAddress?.name || "",
    subject: m.subject || "(no subject)",
    snippet: m.bodyPreview || "",
    date: m.receivedDateTime
      ? new Date(m.receivedDateTime).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "",
    isUnread: !m.isRead,
    body: m.body?.content || "",
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// -- Public API --

export async function listMessages(
  opts: {
    maxResults?: number;
    query?: string;
  } = {},
): Promise<{ messages: OutlookMailMessage[]; totalUnread: number }> {
  const top = opts.maxResults || 10;
  let path = `/me/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,bodyPreview,from,receivedDateTime,isRead`;

  if (opts.query) {
    path += `&$search="${encodeURIComponent(opts.query)}"`;
  }

  const res = await graphFetch(path);
  if (!res.ok) throw new Error(`Outlook Mail API ${res.status}`);
  const data = await res.json();

  const messages = (data.value || []).map(parseMessage);
  const totalUnread = messages.filter(
    (m: OutlookMailMessage) => m.isUnread,
  ).length;

  return { messages, totalUnread };
}

export async function readThread(conversationId: string): Promise<{
  subject: string;
  messages: Array<{
    from: string;
    body: string;
    htmlBody?: string;
    date: string;
  }>;
}> {
  const res = await graphFetch(
    `/me/messages?$filter=conversationId eq '${conversationId}'&$orderby=receivedDateTime asc&$select=id,subject,body,from,receivedDateTime&$top=20`,
  );
  if (!res.ok) throw new Error(`Outlook thread read failed: ${res.status}`);
  const data = await res.json();

  const msgs = (data.value || []).map((m: any) => {
    const bodyContent = String(m.body?.content || "");
    const isHtml =
      String(m.body?.contentType || "").toLowerCase() === "html" ||
      /<[^>]+>/.test(bodyContent);
    return {
      from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "",
      body: (isHtml ? stripHtml(bodyContent) : bodyContent).slice(0, 5000),
      htmlBody: isHtml ? bodyContent.slice(0, 40000) : undefined,
      date: m.receivedDateTime
        ? new Date(m.receivedDateTime).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "",
    };
  });

  const subject = data.value?.[0]?.subject || "(no subject)";
  return { subject, messages: msgs };
}

export async function sendReply(opts: {
  messageId: string;
  body: string;
}): Promise<void> {
  const res = await graphFetch(`/me/messages/${opts.messageId}/reply`, {
    method: "POST",
    body: JSON.stringify({
      comment: opts.body,
    }),
  });
  if (!res.ok && res.status !== 202) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `Reply failed: ${res.status}`);
  }
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const res = await graphFetch("/me/sendMail", {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: opts.subject,
        body: { contentType: "text", content: opts.body },
        toRecipients: [{ emailAddress: { address: opts.to } }],
      },
    }),
  });
  if (!res.ok && res.status !== 202) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `Send mail failed: ${res.status}`);
  }
}

/**
 * Mark a message as read in Outlook.
 */
export async function markAsRead(messageId: string): Promise<void> {
  const res = await graphFetch(`/me/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ isRead: true }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `Mark as read failed: ${res.status}`);
  }
}
