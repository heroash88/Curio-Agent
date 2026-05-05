// src/services/gmailApi.ts
// Gmail API -- read inbox, search, read threads, send replies.
// Uses the same OAuth access token pattern as googleCalendarApi.ts.

import {
  getGmailAccessToken,
  setGmailAccessToken,
} from "../utils/settingsStorage";
import { signInWithGoogle, hasRecentUserInteraction, silentRefreshGoogle } from "./googleOAuth";
import type { GmailMessage } from "./cardTypes";

const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ensureToken(): Promise<string> {
  let token = getGmailAccessToken();
  if (token) return token;

  // Try silent refresh first (hidden iframe, no UI)
  try {
    const result = await silentRefreshGoogle(GMAIL_SCOPES);
    token = result.accessToken;
    setGmailAccessToken(token);
    return token;
  } catch { /* silent refresh failed */ }

  if (!hasRecentUserInteraction()) {
    throw new Error('Gmail token expired. Interact with the page to re-authenticate.');
  }
  const result = await signInWithGoogle(GMAIL_SCOPES);
  token = result.accessToken;
  setGmailAccessToken(token);
  return token;
}

async function gmailFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await ensureToken();
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    setGmailAccessToken("");

    // Try silent refresh first
    try {
      const silentResult = await silentRefreshGoogle(GMAIL_SCOPES);
      setGmailAccessToken(silentResult.accessToken);
      return fetch(`${GMAIL_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${silentResult.accessToken}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
    } catch { /* silent refresh failed */ }

    if (!hasRecentUserInteraction()) {
      throw new Error('Gmail token expired. Interact with the page to re-authenticate.');
    }
    const freshToken = (await signInWithGoogle(GMAIL_SCOPES)).accessToken;
    setGmailAccessToken(freshToken);
    return fetch(`${GMAIL_API}${path}`, {
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

function decodeBase64Url(str: string): string {
  try {
    const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function getHeader(
  headers: Array<{ name: string; value: string }>,
  name: string,
): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    ""
  );
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

function parseMessageBodies(payload: any): { text: string; html: string } {
  let text = "";
  let html = "";

  const visitPart = (part: any) => {
    if (!part) return;

    const mimeType = String(part.mimeType || "").toLowerCase();
    const content = part.body?.data ? decodeBase64Url(part.body.data) : "";

    if (content) {
      if (mimeType.includes("text/plain") && !text) {
        text = content;
      } else if (mimeType.includes("text/html") && !html) {
        html = content;
      } else if (!mimeType && !text) {
        text = content;
      }
    }

    if (Array.isArray(part.parts)) {
      part.parts.forEach(visitPart);
    }
  };

  visitPart(payload);

  return {
    text: text || stripHtml(html),
    html,
  };
}

function parseGmailMessage(msg: any): GmailMessage {
  const headers: Array<{ name: string; value: string }> =
    msg.payload?.headers || [];
  const from = getHeader(headers, "From");
  const nameMatch = from.match(/^"?([^"<]+)"?\s*</);
  return {
    id: msg.id,
    threadId: msg.threadId,
    from,
    fromName: nameMatch ? nameMatch[1].trim() : from.split("@")[0],
    subject: getHeader(headers, "Subject") || "(no subject)",
    snippet: msg.snippet || "",
    date: getHeader(headers, "Date") || "",
    isUnread: (msg.labelIds || []).includes("UNREAD"),
    labels: msg.labelIds || [],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List messages from the inbox (or a custom query).
 */
export async function listMessages(
  opts: {
    maxResults?: number;
    query?: string;
    labelIds?: string[];
  } = {},
): Promise<{ messages: GmailMessage[]; totalUnread: number }> {
  const params = new URLSearchParams({
    maxResults: String(opts.maxResults || 10),
  });
  if (opts.query) params.set("q", opts.query);
  if (opts.labelIds?.length) params.set("labelIds", opts.labelIds.join(","));

  const listRes = await gmailFetch(`/messages?${params}`);
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
  const listData = await listRes.json();

  const messageIds: string[] = (listData.messages || []).map((m: any) => m.id);
  if (messageIds.length === 0) return { messages: [], totalUnread: 0 };

  // Fetch message details in parallel (format=metadata for speed)
  const details = await Promise.all(
    messageIds.map((id) =>
      gmailFetch(
        `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      )
        .then((r) => r.json())
        .catch(() => null),
    ),
  );

  const messages = details.filter(Boolean).map(parseGmailMessage);

  // Get unread count
  let totalUnread = 0;
  try {
    const profileRes = await gmailFetch("/profile");
    if (profileRes.ok) {
      const profile = await profileRes.json();
      totalUnread = profile.threadsTotal || 0;
    }
    // More accurate: count unread in current batch
    totalUnread = messages.filter((m) => m.isUnread).length;
  } catch {
    /* ignore */
  }

  return { messages, totalUnread };
}

/**
 * Read a full email thread.
 */
export async function readThread(threadId: string): Promise<{
  subject: string;
  messages: Array<{
    from: string;
    body: string;
    htmlBody?: string;
    date: string;
  }>;
}> {
  const res = await gmailFetch(`/threads/${threadId}?format=full`);
  if (!res.ok) throw new Error(`Gmail thread read failed: ${res.status}`);
  const data = await res.json();

  const msgs = (data.messages || []).map((msg: any) => {
    const headers: Array<{ name: string; value: string }> =
      msg.payload?.headers || [];
    const parsedBody = parseMessageBodies(msg.payload);
    return {
      from: getHeader(headers, "From"),
      body: parsedBody.text.slice(0, 5000),
      htmlBody: parsedBody.html ? parsedBody.html.slice(0, 40000) : undefined,
      date: getHeader(headers, "Date"),
    };
  });

  const firstHeaders: Array<{ name: string; value: string }> =
    data.messages?.[0]?.payload?.headers || [];
  const subject = getHeader(firstHeaders, "Subject") || "(no subject)";

  return { subject, messages: msgs };
}

/**
 * Send a reply to a thread.
 */
export async function sendReply(opts: {
  threadId: string;
  messageId: string;
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const replySubject = opts.subject.startsWith("Re:")
    ? opts.subject
    : `Re: ${opts.subject}`;
  const rawMessage = [
    `To: ${opts.to}`,
    `Subject: ${replySubject}`,
    `In-Reply-To: ${opts.messageId}`,
    `References: ${opts.messageId}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    opts.body,
  ].join("\r\n");

  const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmailFetch("/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: encoded, threadId: opts.threadId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `Send failed: ${res.status}`);
  }
}

/**
 * Send a new standalone email.
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const rawMessage = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject || "(no subject)"}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    opts.body,
  ].join("\r\n");

  const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmailFetch("/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `Send failed: ${res.status}`);
  }
}

/**
 * Mark a message as read by removing the UNREAD label.
 */
export async function markAsRead(messageId: string): Promise<void> {
  const res = await gmailFetch(`/messages/${messageId}/modify`, {
    method: "POST",
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `Mark as read failed: ${res.status}`);
  }
}
