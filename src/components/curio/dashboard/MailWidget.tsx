import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Inbox, Mail, Pencil, Pin, PinOff, RefreshCcw, Search, Send, X } from "lucide-react";

// TODO: [Accessibility] Apply useListKeyboardNav to the mail list for full keyboard navigation.
// TODO: [Accessibility] Replace in-card icon buttons with WidgetIconButton for 44px targets.

import { useCardTheme } from "../../../hooks/useCardTheme";
import { useDashboardRefresh } from "../../../hooks/useDashboardRefresh";
import { useWidgetPersistentState } from "../../../hooks/useWidgetPersistentState";
import { useWidgetSize } from "../../../hooks/useWidgetSize";
import type {
  DashboardMailProvider,
  DashboardWidget,
} from "../../../services/dashboardTypes";
import { resolveMailProvider } from "../../../services/dashboardProviderUtils";
import type {
  GmailMessage,
  OutlookMailMessage,
} from "../../../services/cardTypes";
import type { ZapierMailMessage } from "../../../services/zapierMcpWidgetService";
import {
  sortPinnedFirst,
  togglePin,
} from "../../../services/pinnedItemIdsHelper";
import {
  useGmailAccessToken,
  useGmailReplyEnabled,
  useOutlookMailAccessToken,
  useOutlookReplyEnabled,
} from "../../../utils/settingsStorage";
import WidgetShell from "./WidgetShell";
import { WidgetSkeleton, WidgetText } from "./widgetPrimitives";

import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from "../../../utils/settings/dashboardSettings";
import { useHoverBus } from "../../../hooks/useDashboardIntents";
import { useMotionProfile } from "../../../hooks/useMotionProfile";

type MailMessage = GmailMessage | OutlookMailMessage | ZapierMailMessage;

type MailThreadLine = {
  from: string;
  body: string;
  htmlBody?: string;
  date: string;
};

type ComposeDraft = {
  to: string;
  subject: string;
  body: string;
};

/**
 * Format a raw email Date header into a short, human-friendly string.
 * Examples: "2:04 PM", "Yesterday 6:43 PM", "May 3, 10:00 AM", "Dec 15, 2025 3:30 PM"
 */
function formatMailDate(raw: string): string {
  if (!raw) return "";
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return raw;

  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  const timeStr = parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  if (diffDays < 1 && parsed.getDate() === now.getDate()) {
    // Today — show time only
    return timeStr;
  }
  if (diffDays < 2 && now.getDate() - parsed.getDate() === 1) {
    return `Yesterday ${timeStr}`;
  }
  if (parsed.getFullYear() === now.getFullYear()) {
    return `${parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${timeStr}`;
  }
  return `${parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} ${timeStr}`;
}

/**
 * Decode HTML entities in email snippets (e.g. &#39; → ')
 */
function decodeHtmlEntities(text: string): string {
  if (!text || typeof document === "undefined") return text;
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

const BLOCKED_EMAIL_TAGS = [
  "script",
  "style",
  "link",
  "meta",
  "base",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "video",
  "audio",
];

const sanitizeEmailHtml = (html: string) => {
  if (!html || typeof DOMParser === "undefined") {
    return "";
  }

  try {
    const documentFragment = new DOMParser().parseFromString(html, "text/html");

    BLOCKED_EMAIL_TAGS.forEach((tagName) => {
      documentFragment
        .querySelectorAll(tagName)
        .forEach((element) => element.remove());
    });

    documentFragment.querySelectorAll("*").forEach((element) => {
      Array.from(element.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();

        if (
          name.startsWith("on") ||
          name === "srcdoc" ||
          name === "formaction"
        ) {
          element.removeAttribute(attribute.name);
          return;
        }

        if (
          ["href", "src", "xlink:href"].includes(name) &&
          /^(javascript:|data:text\/html)/i.test(value)
        ) {
          element.removeAttribute(attribute.name);
        }
      });

      // Strip inline color/background styles that break dark mode.
      // Keep other styles (margins, padding, font-size, etc.) intact.
      if (element instanceof HTMLElement && element.style.length > 0) {
        element.style.removeProperty("color");
        element.style.removeProperty("background-color");
        element.style.removeProperty("background");
      }

      if (element.tagName === "A") {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      }
    });

    return documentFragment.body.innerHTML;
  } catch {
    return "";
  }
};

const MailThreadBody: React.FC<{
  line: MailThreadLine;
  fallbackClassName: string;
}> = ({ line, fallbackClassName }) => {
  const safeHtml = useMemo(
    () => sanitizeEmailHtml(line.htmlBody || ""),
    [line.htmlBody],
  );

  if (safeHtml) {
    return (
      <div
        className="text-[12px] leading-relaxed text-[var(--ether-on-surface)] [overflow-wrap:anywhere] [&_*]:!text-inherit [&_a]:!text-[var(--ether-primary)] [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--ether-glass-border)] [&_blockquote]:pl-3 [&_img]:h-auto [&_img]:max-w-full [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-black/10 [&_pre]:p-3 [&_table]:w-full [&_table]:border-collapse [&_td]:align-top [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  return (
    <p
      className={`text-[12px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${fallbackClassName}`}
    >
      {line.body || "No readable body was returned for this message."}
    </p>
  );
};

const MailWidget: React.FC<{ widget: DashboardWidget; focused?: boolean }> = ({ widget, focused }) => {
  return <MailWidgetCompact widget={widget} focused={focused} />;
};

const MailWidgetCompact: React.FC<{ widget: DashboardWidget; focused?: boolean }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const gmailToken = useGmailAccessToken();
  const gmailReplyEnabled = useGmailReplyEnabled();
  const outlookToken = useOutlookMailAccessToken();
  const outlookReplyEnabled = useOutlookReplyEnabled();

  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [selected, setSelectedRaw] = useState<MailMessage | null>(null);
  const [threadLines, setThreadLines] = useState<MailThreadLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");

  // Persist selected message ID so expanding the widget keeps the thread open.
  const [persistedSelectedId, setPersistedSelectedId] = useWidgetPersistentState<string | null>(
    widget.id,
    "selectedMessageId",
    null,
  );
  const setSelected = useCallback((msg: MailMessage | null) => {
    setSelectedRaw(msg);
    setPersistedSelectedId(msg?.id ?? null);
  }, [setPersistedSelectedId]);
  const [mcpDebug, setMcpDebug] = useState<{
    ok: boolean;
    serverName?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    normalizedCount?: number;
    rawPreview?: string;
    error?: string;
  } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySent, setReplySent] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft>({
    to: "",
    subject: "",
    body: "",
  });
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeSent, setComposeSent] = useState(false);

  // Hover-bus wiring (Requirement 12.2).
  //
  // Target role: when a calendar-event hover arrives, highlight any
  // thread row whose sender email is in the event's attendees list.
  // Our current `GmailMessage` / `OutlookMailMessage` / `ZapierMailMessage`
  // shapes do not carry a recipient list (just `from` / `fromName`),
  // so cross-matching is sender-only — documented in the hover bus
  // notes. Calendar events in this repo do not currently surface an
  // attendees array either, so in practice the highlight only fires
  // when the event side starts carrying `meta.attendees`. When either
  // side lacks the data, we emit/consume the hover event and render
  // no highlight (graceful no-op).
  const boardInteractivity = useDashboardInteractivitySettings();
  const hoverBusEnabled = effectiveToggle(
    "hoverSelectionBusEnabled",
    boardInteractivity,
    widget.config,
  );
  const pinningEnabled = effectiveToggle(
    "widgetPinningEnabled",
    boardInteractivity,
    widget.config,
  );
  const [pinnedItemIds, setPinnedItemIds] = useWidgetPersistentState<string[]>(
    widget.id,
    "pinnedItemIds",
    [],
  );
  const handleTogglePin = useCallback(
    (messageId: string) => {
      setPinnedItemIds((current) => togglePin(current, messageId));
    },
    [setPinnedItemIds],
  );
  const motionProfile = useMotionProfile();
  const { hovered } = useHoverBus();
  const hoveredAttendees: string[] =
    hoverBusEnabled && hovered?.itemKind === "calendar-event"
      ? (() => {
          const meta = hovered.meta as
            | { attendees?: unknown }
            | undefined;
          if (!meta || !Array.isArray(meta.attendees)) return [];
          return meta.attendees
            .filter((a): a is string => typeof a === "string")
            .map((a) => a.toLowerCase());
        })()
      : [];
  const hasHoverMatcher = hoveredAttendees.length > 0;
  const hoverHighlightClass = motionProfile.shouldAnimate
    ? "ring-2 ring-[var(--ether-indigo)] transition-[box-shadow,border-color] duration-150"
    : "outline outline-2 outline-[var(--ether-indigo)]";

  const isThreadHighlighted = (message: MailMessage): boolean => {
    if (!hoverBusEnabled || !hasHoverMatcher) return false;
    const sender = (message.from || "").toLowerCase().trim();
    if (!sender) return false;
    // Messages often store `"Name <email@host>"`. Pull the first
    // angle-bracketed address when present, otherwise use the whole
    // trimmed string.
    const match = sender.match(/<([^>]+)>/);
    const senderEmail = match ? match[1].trim() : sender;
    return hoveredAttendees.includes(senderEmail);
  };

  const preferredProvider = (widget.config.mailProvider ||
    "auto") as DashboardMailProvider;
  const provider = resolveMailProvider(
    preferredProvider,
    gmailToken,
    outlookToken,
  );
  const providerLabel =
    provider === "gmail"
      ? "Gmail"
      : provider === "outlook"
        ? "Outlook"
        : provider === "zapier"
          ? "Zapier"
        : preferredProvider === "gmail"
          ? "Gmail"
          : preferredProvider === "outlook"
            ? "Outlook"
            : preferredProvider === "zapier"
              ? "Zapier"
            : "Mail";
  const inboxTitle =
    providerLabel === "Mail" ? "Inbox" : `${providerLabel} Inbox`;
  const layoutMaxItems = size.pixelHeight < 340 ? 2 : size.pixelHeight < 520 ? 3 : size.isTall ? 6 : 4;
  // All providers use a scrollable body, so don't cap items to the
  // height-based layout estimate. Use the configured maxItems (or a
  // generous default) and let the scroll container handle overflow.
  const maxItems = Math.max(1, Number(widget.config.maxItems || (provider === "mcp" || provider === "zapier" ? 50 : Math.max(layoutMaxItems, 15))));
  const [mcpSendAvailable, setMcpSendAvailable] = useState(false);
  const [mcpReplyAvailable, setMcpReplyAvailable] = useState(false);
  const replyEnabled =
    provider === "gmail"
      ? gmailReplyEnabled
      : provider === "outlook"
        ? outlookReplyEnabled
        : provider === "zapier"
          ? true
        : provider === "mcp"
          ? mcpSendAvailable || mcpReplyAvailable
        : false;

  useEffect(() => {
    if (provider !== "mcp") {
      setMcpSendAvailable(false);
      setMcpReplyAvailable(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const svc = await import("../../../services/zapierMcpWidgetService");
        const [sendOk, replyOk] = await Promise.all([
          svc.mcpMailSendAvailable({
            serverId: widget.config.mcpServerId,
            toolName: widget.config.mcpSendToolName,
          }),
          svc.mcpMailReplyAvailable({
            serverId: widget.config.mcpServerId,
            toolName: widget.config.mcpReplyToolName,
          }),
        ]);
        if (cancelled) return;
        setMcpSendAvailable(sendOk);
        setMcpReplyAvailable(replyOk);
      } catch {
        if (cancelled) return;
        setMcpSendAvailable(false);
        setMcpReplyAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, [
    provider,
    widget.config.mcpServerId,
    widget.config.mcpSendToolName,
    widget.config.mcpReplyToolName,
  ]);

  const resetComposer = (draft?: Partial<ComposeDraft>) => {
    setComposeDraft({
      to: draft?.to || "",
      subject: draft?.subject || "",
      body: draft?.body || "",
    });
    setComposeError(null);
    setComposeSent(false);
  };

  const loadMessages = useCallback(async (background = false) => {
    if (!provider) {
      setMessages([]);
      setTotalUnread(0);
      return;
    }

    if (!background) setLoading(true);
    try {
      if (provider === "gmail") {
        const { listMessages } = await import("../../../services/gmailApi");
        const response = await listMessages({
          maxResults: maxItems,
          query: activeSearch.trim() || undefined,
        });
        setMessages(response.messages);
        setTotalUnread(response.totalUnread);
      } else if (provider === "outlook") {
        const { listMessages } =
          await import("../../../services/outlookMailApi");
        const response = await listMessages({
          maxResults: maxItems,
          query: activeSearch.trim() || undefined,
        });
        setMessages(response.messages);
        setTotalUnread(response.totalUnread || 0);
      } else if (provider === "mcp") {
        const { listMcpMailMessages } =
          await import("../../../services/zapierMcpWidgetService");
        const effectiveQuery = activeSearch.trim() || String(widget.config.mcpQuery || widget.config.zapierQuery || "inbox");
        // The service layer auto-switches between email_inbox and
        // email_search based on the query content + profile, so we
        // just pass the query and optional pinned tool through.
        const response = await listMcpMailMessages({
          serverId: widget.config.mcpServerId,
          toolName: widget.config.mcpToolName,
          query: effectiveQuery,
          maxItems,
        });
        setMessages(response.messages);
        setTotalUnread(response.totalUnread || 0);
        setMcpDebug({
          ok: true,
          serverName: response.debug.serverName,
          toolName: response.debug.toolName,
          toolArgs: response.debug.toolArgs,
          normalizedCount: response.debug.normalizedCount,
          rawPreview: response.debug.rawResultPreview,
        });
      } else {
        const { listZapierMailMessages } =
          await import("../../../services/zapierMcpWidgetService");
        const response = await listZapierMailMessages({
          query: activeSearch.trim() || String(widget.config.zapierQuery || "inbox"),
          maxItems,
        });
        setMessages(response.messages);
        setTotalUnread(response.totalUnread || 0);
      }
    } catch (error) {
      console.error("Mail fetch failed", error);
      setMessages([]);
      setTotalUnread(0);
      if (provider === "mcp") {
        setMcpDebug({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [
    maxItems,
    provider,
    widget.config.zapierQuery,
    widget.config.mcpQuery,
    widget.config.mcpServerId,
    widget.config.mcpToolName,
    activeSearch,
  ]);

  useEffect(() => {
    if (!provider) {
      setMessages([]);
      setTotalUnread(0);
    }
    if (provider !== "mcp") {
      setMcpDebug(null);
    }
  }, [provider]);

  const loadMessagesRef = React.useRef(loadMessages);
  loadMessagesRef.current = loadMessages;

  useEffect(() => {
    if (!provider) return;
    // Fire a fresh load whenever the active search query changes so the
    // search bar actually re-queries the source.
    void loadMessagesRef.current(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSearch, provider]);

  const { refreshNow } = useDashboardRefresh({
    widget,
    enabled: Boolean(provider),
    onRefresh: (background) => loadMessages(background),
  });

  // Mark-as-read is best-effort. If the token lacks gmail.modify scope
  // (common for existing connections), the call fails silently and the
  // local UI still shows the message as read.
  const markReadSilently = useCallback(async (message: MailMessage) => {
    try {
      if (provider === "gmail") {
        const { markAsRead } = await import("../../../services/gmailApi");
        await markAsRead(message.id);
      } else if (provider === "outlook") {
        const { markAsRead } = await import("../../../services/outlookMailApi");
        await markAsRead(message.id);
      }
    } catch {
      // Silently ignore — mark-as-read is non-critical.
      // User can reconnect Gmail with the modify scope to fix.
    }
  }, [provider]);

  const loadThread = async (
    message: MailMessage,
    options?: { keepComposerState?: boolean },
  ) => {
    setComposerOpen(false);
    setSelected(message);
    setThreadLines([]);
    if (!options?.keepComposerState) {
      setReplyDraft("");
      setReplyError(null);
      setReplySent(false);
    }
    setThreadLoading(true);

    // Mark as read optimistically if needed
    if (message.isUnread && (provider === "gmail" || provider === "outlook")) {
      // Update local state immediately
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, isUnread: false } : m)),
      );
      setTotalUnread((prev) => Math.max(0, prev - 1));
      // Fire-and-forget server call
      void markReadSilently(message);
    } else if (message.isUnread) {
      // Non-Gmail/Outlook providers: just flip locally (no server call)
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, isUnread: false } : m)),
      );
      setTotalUnread((prev) => Math.max(0, prev - 1));
    }

    try {
      if (provider === "gmail" && "threadId" in message) {
        const { readThread } = await import("../../../services/gmailApi");
        const thread = await readThread(message.threadId);
        setThreadLines(thread.messages);
      } else if (provider === "outlook" && "conversationId" in message) {
        const { readThread } = await import("../../../services/outlookMailApi");
        const thread = await readThread(message.conversationId);
        setThreadLines(thread.messages);
      } else if (provider === "zapier") {
        const { readZapierMailThread } =
          await import("../../../services/zapierMcpWidgetService");
        const thread = await readZapierMailThread(message as ZapierMailMessage);
        setThreadLines(thread.messages);
      } else if (provider === "mcp") {
        const mailMessage = message as ZapierMailMessage;
        setThreadLines([{
          from: mailMessage.fromName || mailMessage.from,
          body: mailMessage.body || mailMessage.snippet,
          htmlBody: mailMessage.htmlBody,
          date: mailMessage.date,
        }]);
      }
    } catch {
      setThreadLines([]);
    } finally {
      setThreadLoading(false);
    }
  };

  // Restore selected message after messages load (e.g., after widget expand).
  useEffect(() => {
    if (!persistedSelectedId || selected || messages.length === 0) return;
    const match = messages.find((m) => m.id === persistedSelectedId);
    if (match) {
      void loadThread(match);
    }
    // Only run when messages first populate and we have a persisted selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, persistedSelectedId]);

  const handleReply = async () => {
    if (
      !selected ||
      !replyDraft.trim() ||
      !provider ||
      !replyEnabled ||
      replySending
    )
      return;

    setReplySending(true);
    setReplyError(null);
    setReplySent(false);

    try {
      if (provider === "gmail" && "threadId" in selected) {
        const { sendReply } = await import("../../../services/gmailApi");
        await sendReply({
          threadId: selected.threadId,
          messageId: selected.id,
          to: selected.from,
          subject: selected.subject,
          body: replyDraft.trim(),
        });
      } else if (provider === "outlook") {
        const { sendReply } = await import("../../../services/outlookMailApi");
        await sendReply({
          messageId: selected.id,
          body: replyDraft.trim(),
        });
      } else if (provider === "zapier") {
        const { sendZapierEmailReply } =
          await import("../../../services/zapierMcpWidgetService");
        await sendZapierEmailReply({
          message: selected as ZapierMailMessage,
          body: replyDraft.trim(),
        });
      } else if (provider === "mcp") {
        const { replyMcpEmail } = await import("../../../services/zapierMcpWidgetService");
        const zapierSelected = selected as ZapierMailMessage;
        await replyMcpEmail({
          serverId: widget.config.mcpServerId,
          replyToolName: widget.config.mcpReplyToolName,
          readToolName: widget.config.mcpToolName,
          conversationId: zapierSelected.conversationId || zapierSelected.threadId || zapierSelected.id,
          to: zapierSelected.from,
          subject: zapierSelected.subject,
          body: replyDraft.trim(),
        });
      }

      setReplyDraft("");
      setReplySent(true);
      await loadMessages(false);
      await loadThread(selected, { keepComposerState: true });
    } catch (error) {
      setReplyError((error as Error).message || "Reply failed.");
      setReplySent(false);
    } finally {
      setReplySending(false);
    }
  };

  const handleOpenComposer = (draft?: Partial<ComposeDraft>) => {
    setSelected(null);
    setReplyDraft("");
    setReplyError(null);
    setReplySent(false);
    setComposerOpen(true);
    resetComposer(draft);
  };

  const handleSendCompose = async () => {
    if (
      !provider ||
      !replyEnabled ||
      composeSending ||
      !composeDraft.to.trim() ||
      !composeDraft.body.trim()
    ) {
      return;
    }

    setComposeSending(true);
    setComposeError(null);
    setComposeSent(false);

    try {
      if (provider === "gmail") {
        const { sendMail } = await import("../../../services/gmailApi");
        await sendMail({
          to: composeDraft.to.trim(),
          subject: composeDraft.subject.trim(),
          body: composeDraft.body.trim(),
        });
      } else if (provider === "outlook") {
        const { sendMail } = await import("../../../services/outlookMailApi");
        await sendMail({
          to: composeDraft.to.trim(),
          subject: composeDraft.subject.trim(),
          body: composeDraft.body.trim(),
        });
      } else if (provider === "zapier") {
        const { sendZapierEmail } =
          await import("../../../services/zapierMcpWidgetService");
        await sendZapierEmail({
          to: composeDraft.to.trim(),
          subject: composeDraft.subject.trim(),
          body: composeDraft.body.trim(),
        });
      } else if (provider === "mcp") {
        const { sendMcpEmail } =
          await import("../../../services/zapierMcpWidgetService");
        await sendMcpEmail({
          serverId: widget.config.mcpServerId,
          toolName: widget.config.mcpSendToolName,
          to: composeDraft.to.trim(),
          subject: composeDraft.subject.trim(),
          body: composeDraft.body.trim(),
        });
      }

      setComposeSent(true);
      setComposeDraft({ to: "", subject: "", body: "" });
      await loadMessages(false);
    } catch (error) {
      setComposeError((error as Error).message || "Could not send email.");
      setComposeSent(false);
    } finally {
      setComposeSending(false);
    }
  };

  const getInitials = (name: string) => {
    return (
      name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "?"
    );
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-indigo-500/20 text-indigo-400",
      "bg-violet-500/20 text-violet-400",
      "bg-purple-500/20 text-purple-400",
      "bg-blue-500/20 text-blue-400",
      "bg-fuchsia-500/20 text-fuchsia-400",
    ];
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) {
      hash = name.charCodeAt(index) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  if (size.sizeClass === "tiny") {
    return (
      <WidgetShell bare accent="indigo" widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="relative">
            <Inbox size={24} className="text-[var(--ether-indigo)]" />
            {totalUnread > 0 && (
              <div className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--ether-error)] text-[10px] font-bold text-white animate-pulse">
                {totalUnread > 9 ? "9+" : totalUnread}
              </div>
            )}
          </div>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title={inboxTitle}
      icon={<Mail size={14} />}
      accent="indigo"
      rightSlot={
        <div className="flex items-center gap-2">
          {providerLabel !== "Mail" && !selected && !composerOpen && (
            <WidgetText variant="label" tone="muted" className="rounded-full bg-[var(--ether-control-bg)] px-2 py-0.5">
              {providerLabel}
            </WidgetText>
          )}
          {totalUnread > 0 && !selected && !composerOpen && (
            <WidgetText variant="label" className="rounded-full bg-[var(--ether-indigo)]/10 px-2 py-0.5 text-[var(--ether-indigo)]">
              {totalUnread} unread
            </WidgetText>
          )}
          {provider && !selected && !composerOpen && (
            <button
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              className={`dashboard-widget-control-button ${searchOpen || activeSearch ? "text-[var(--ether-indigo)]" : ""}`}
              aria-label="Search emails"
              aria-pressed={searchOpen || Boolean(activeSearch)}
            >
              <Search size={13} />
            </button>
          )}
          {provider && (
            <button
              type="button"
              onClick={() => handleOpenComposer()}
              className="dashboard-widget-control-button"
              aria-label="Compose new email"
            >
              <Pencil size={13} />
            </button>
          )}
          <button
            onClick={() => refreshNow(false)}
            className="dashboard-widget-control-button"
            aria-label="Refresh inbox"
          >
            <RefreshCcw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {!provider ? (
          <div className="flex flex-1 flex-col items-center justify-center p-4 opacity-60">
            <Mail size={32} className="mb-2" />
            <WidgetText variant="label" tone="muted" align="center">
              Connection Required
            </WidgetText>
          </div>
        ) : composerOpen ? (
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden ether-widget-enter">
            <div className="mb-4 flex shrink-0 items-center gap-3">
              <button
                onClick={() => {
                  setComposerOpen(false);
                  resetComposer();
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ether-control-bg)] transition-colors hover:bg-[var(--ether-control-hover)] ${theme.onSurface}`}
                aria-label="Back to inbox"
              >
                <ArrowLeft size={14} />
              </button>
              <div className="min-w-0 flex-1">
                <h4
                  className={`truncate text-[13px] font-bold ${theme.onSurface}`}
                >
                  New email
                </h4>
                <p className="text-[10px] font-medium text-[var(--ether-on-surface-variant)]">
                  Start a new message without leaving the widget.
                </p>
              </div>
            </div>

            <div
              className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch', height: 0 }}
              onWheel={(e) => e.stopPropagation()}
            >
              <input
                value={composeDraft.to}
                onChange={(event) => {
                  const value = event.target.value;
                  setComposeDraft((current) => ({ ...current, to: value }));
                }}
                placeholder="To"
                className="rounded-[1.2rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-4 py-3 text-xs text-[var(--ether-on-surface)] outline-none transition placeholder:text-[var(--ether-on-surface-variant)]/50 focus:border-[var(--ether-indigo)]/35"
              />
              <input
                value={composeDraft.subject}
                onChange={(event) => {
                  const value = event.target.value;
                  setComposeDraft((current) => ({
                    ...current,
                    subject: value,
                  }));
                }}
                placeholder="Subject"
                className="rounded-[1.2rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-4 py-3 text-xs text-[var(--ether-on-surface)] outline-none transition placeholder:text-[var(--ether-on-surface-variant)]/50 focus:border-[var(--ether-indigo)]/35"
              />
              <textarea
                value={composeDraft.body}
                onChange={(event) => {
                  const value = event.target.value;
                  setComposeDraft((current) => ({ ...current, body: value }));
                }}
                onKeyDown={(event) => {
                  if (
                    (event.metaKey || event.ctrlKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    void handleSendCompose();
                  }
                }}
                rows={size.isCompact ? 6 : 8}
                placeholder="Write your message..."
                disabled={!replyEnabled || composeSending}
                className="min-h-[10rem] flex-1 resize-none rounded-[1.4rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-4 py-3 text-xs text-[var(--ether-on-surface)] outline-none transition placeholder:text-[var(--ether-on-surface-variant)]/50 focus:border-[var(--ether-indigo)]/35 disabled:opacity-40"
              />

              {!replyEnabled && (
                <div className="rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-3 py-2 text-[11px] text-[var(--ether-on-surface-variant)]">
                  Email sending is disabled for this provider in Accounts &
                  Keys.
                </div>
              )}

              {composeError && (
                <div className="rounded-2xl border border-[var(--ether-error)]/20 bg-[var(--ether-error)]/10 px-3 py-2 text-[11px] text-[var(--ether-error)]">
                  {composeError}
                </div>
              )}

              {composeSent && !composeError && (
                <div className="rounded-2xl border border-[var(--ether-indigo)]/20 bg-[var(--ether-indigo)]/10 px-3 py-2 text-[11px] text-[var(--ether-indigo)]">
                  Email sent.
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-medium text-[var(--ether-on-surface-variant)]">
                  Press Cmd/Ctrl + Enter to send.
                </span>
                <button
                  type="button"
                  onClick={() => void handleSendCompose()}
                  disabled={
                    !replyEnabled ||
                    composeSending ||
                    !composeDraft.to.trim() ||
                    !composeDraft.body.trim()
                  }
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--ether-indigo)] px-4 text-sm font-semibold text-white transition disabled:opacity-30"
                >
                  <Send
                    size={14}
                    className={composeSending ? "animate-pulse" : ""}
                  />
                  Send
                </button>
              </div>
            </div>
          </div>
        ) : selected ? (
          <div className="relative flex-1 min-h-0 flex flex-col ether-widget-enter">
            <div className="mb-4 flex shrink-0 items-center gap-3">
              <button
                onClick={() => {
                  setSelected(null);
                  setReplyDraft("");
                  setReplyError(null);
                  setReplySent(false);
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ether-control-bg)] transition-colors hover:bg-[var(--ether-control-hover)] ${theme.onSurface}`}
                aria-label="Back to inbox"
              >
                <ArrowLeft size={14} />
              </button>
              <div className="min-w-0 flex-1">
                <h4
                  className={`truncate text-[13px] font-bold ${theme.onSurface}`}
                >
                  {selected.subject}
                </h4>
                <p className="text-[10px] font-medium text-[var(--ether-on-surface-variant)]">
                  {selected.fromName || selected.from}
                </p>
              </div>
            </div>

            <div
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1"
              style={{ WebkitOverflowScrolling: 'touch' }}
              onWheel={(e) => e.stopPropagation()}
            >
              {threadLoading ? (
                <div className="flex h-full items-center justify-center opacity-60">
                  <RefreshCcw size={18} className="animate-spin" />
                </div>
              ) : threadLines.length === 0 ? (
                <div className="rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] p-4">
                  <p
                    className={`text-[12px] leading-relaxed ${theme.onSurfaceVariant}`}
                  >
                    {decodeHtmlEntities(selected.snippet) ||
                      "This message does not have a readable preview body yet."}
                  </p>
                </div>
              ) : (
                threadLines.map((line, index) => (
                  <div key={`${line.date}-${index}`} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`truncate text-[11px] font-bold ${theme.onSurfaceVariant}`}>
                        {(line.from.split("<")[0] || line.from)
                          .replace(/"/g, "")
                          .trim()}
                      </span>
                      <span className="shrink-0 text-[9px] font-medium text-[var(--ether-on-surface-variant)]">
                        {formatMailDate(line.date)}
                      </span>
                    </div>
                    <div className="rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] p-4">
                      <MailThreadBody
                        line={line}
                        fallbackClassName={theme.onSurfaceVariant}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="shrink-0">
            {!replyEnabled && (
              <div className="mt-4 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-3 py-2 text-[11px] text-[var(--ether-on-surface-variant)]">
                Replies are disabled for this provider in Accounts & Keys.
              </div>
            )}

            {replyError && (
              <div className="mt-4 rounded-2xl border border-[var(--ether-error)]/20 bg-[var(--ether-error)]/10 px-3 py-2 text-[11px] text-[var(--ether-error)]">
                {replyError}
              </div>
            )}

            {replySent && !replyError && (
              <div className="mt-4 rounded-2xl border border-[var(--ether-indigo)]/20 bg-[var(--ether-indigo)]/10 px-3 py-2 text-[11px] text-[var(--ether-indigo)]">
                Reply sent.
              </div>
            )}

            <div className="mt-4 flex items-end gap-2">
              <textarea
                value={replyDraft}
                onChange={(event) => setReplyDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    (event.metaKey || event.ctrlKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    void handleReply();
                  }
                }}
                rows={size.isCompact ? 2 : 3}
                placeholder={
                  replyEnabled ? "Reply in-thread…" : "Enable replies to send"
                }
                disabled={!replyEnabled || replySending}
                className="min-h-[4.25rem] flex-1 resize-none rounded-[1.2rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-4 py-3 text-xs text-[var(--ether-on-surface)] outline-none transition placeholder:text-[var(--ether-on-surface-variant)]/50 focus:border-[var(--ether-indigo)]/35 disabled:opacity-40"
              />
              <button
                onClick={() => void handleReply()}
                disabled={!replyEnabled || !replyDraft.trim() || replySending}
                className="flex h-11 w-11 items-center justify-center rounded-[1.1rem] bg-[var(--ether-indigo)] text-white transition disabled:opacity-30"
                aria-label="Send reply"
              >
                <Send
                  size={14}
                  className={replySending ? "animate-pulse" : ""}
                />
              </button>
            </div>
            <div className="mt-1 text-[10px] font-medium text-[var(--ether-on-surface-variant)]">
              {replyEnabled
                ? "Press Cmd/Ctrl + Enter to send."
                : "Replying is unavailable until the mail account enables send access."}
            </div>
            </div>
          </div>
        ) : (
          <div
            className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1"
            style={{ WebkitOverflowScrolling: 'touch', height: 0 }}
            onWheel={(e) => e.stopPropagation()}
          >
            {searchOpen && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setActiveSearch(searchDraft.trim());
                }}
                className="flex items-center gap-2 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-3 py-2"
              >
                <Search size={13} className="shrink-0 opacity-60" />
                <input
                  autoFocus
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder={
                    provider === "mcp"
                      ? "Search emails (passes as query to MCP)"
                      : provider === "zapier"
                        ? "Search emails via Zapier"
                        : "Search inbox"
                  }
                  className={`min-w-0 flex-1 bg-transparent text-[11px] outline-none ${theme.onSurface}`}
                />
                {activeSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchDraft("");
                      setActiveSearch("");
                    }}
                    className="rounded-md px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] opacity-60 hover:opacity-100"
                    aria-label="Clear search"
                  >
                    <X size={11} />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!searchDraft.trim() && !activeSearch}
                  className="rounded-md bg-[var(--ether-indigo)]/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-indigo)] transition hover:bg-[var(--ether-indigo)]/25 disabled:opacity-40"
                >
                  Run
                </button>
              </form>
            )}
            {activeSearch && !searchOpen && (
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-3 py-1.5">
                <Search size={11} className="shrink-0 opacity-60" />
                <WidgetText variant="label" tone="muted" className="min-w-0 flex-1 truncate">
                  Search: {activeSearch}
                </WidgetText>
                <button
                  type="button"
                  onClick={() => {
                    setSearchDraft("");
                    setActiveSearch("");
                  }}
                  className="rounded-md px-1 py-0.5 opacity-60 hover:opacity-100"
                  aria-label="Clear search"
                >
                  <X size={11} />
                </button>
              </div>
            )}
            {provider === "mcp" && mcpDebug && (
              <details className="rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-3 py-2 text-[10px] leading-snug">
                <summary className="cursor-pointer select-none font-bold uppercase tracking-[0.18em] opacity-70">
                  MCP debug ({mcpDebug.ok ? `ok · ${mcpDebug.normalizedCount} message${mcpDebug.normalizedCount === 1 ? "" : "s"} parsed` : "error"})
                </summary>
                <div className="mt-2 grid gap-1.5 font-mono text-[10px] break-all opacity-85">
                  {mcpDebug.serverName && (
                    <div><span className="opacity-60">server:</span> {mcpDebug.serverName}</div>
                  )}
                  {mcpDebug.toolName && (
                    <div><span className="opacity-60">tool:</span> {mcpDebug.toolName}</div>
                  )}
                  {mcpDebug.toolArgs && (
                    <div><span className="opacity-60">args:</span> {JSON.stringify(mcpDebug.toolArgs)}</div>
                  )}
                  {mcpDebug.error && (
                    <div className="text-[var(--ether-error)]"><span className="opacity-60">error:</span> {mcpDebug.error}</div>
                  )}
                  {mcpDebug.rawPreview && (
                    <div className="whitespace-pre-wrap"><span className="opacity-60">raw preview:</span> {mcpDebug.rawPreview}</div>
                  )}
                </div>
              </details>
            )}
            {loading && messages.length === 0 ? (
              <WidgetSkeleton variant="list" />
            ) : messages.length === 0 && !loading ? (
              <div className="flex h-full flex-col items-center justify-center opacity-60">
                <Inbox size={32} className="mb-2" />
                <WidgetText variant="label" tone="muted" align="center">
                  Inbox Zero
                </WidgetText>
              </div>
            ) : (
              (pinningEnabled
                ? sortPinnedFirst(messages, pinnedItemIds, (m) => m.id)
                : messages
              ).map((message) => {
                const isHovered = isThreadHighlighted(message);
                const messagePinned = pinnedItemIds.includes(message.id);
                return (
                <button
                  key={message.id}
                  onClick={() => void loadThread(message)}
                  data-hover-highlight={isHovered ? "true" : undefined}
                  className={`relative flex w-full items-start gap-4 rounded-2xl border p-3 text-left transition-all duration-300 group ${
                    message.isUnread
                      ? "border-[var(--ether-indigo)]/20 bg-[var(--ether-indigo)]/5"
                      : "border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)] opacity-70 hover:opacity-100"
                  } ${isHovered ? hoverHighlightClass : ""}`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-inner ${getAvatarColor(message.fromName || message.from)}`}
                  >
                    {getInitials(message.fromName || message.from)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span
                        className={`truncate text-[12px] font-bold ${message.isUnread ? theme.onSurface : theme.onSurfaceVariant}`}
                      >
                        {message.fromName || message.from.split("@")[0]}
                      </span>
                      <span className="text-[9px] font-medium opacity-40 tabular-nums">
                        {formatMailDate(message.date)}
                      </span>
                    </div>
                    <div
                      className={`mb-1 truncate text-[11px] font-medium ${message.isUnread ? theme.onSurface : theme.onSurfaceVariant}`}
                    >
                      {message.subject}
                    </div>
                    <div className="line-clamp-1 text-[10px] leading-tight opacity-40">
                      {decodeHtmlEntities(message.snippet)}
                    </div>
                  </div>

                  {pinningEnabled && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={messagePinned ? `Unpin ${message.subject}` : `Pin ${message.subject}`}
                      aria-pressed={messagePinned}
                      onClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        handleTogglePin(message.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.stopPropagation();
                          event.preventDefault();
                          handleTogglePin(message.id);
                        }
                      }}
                      className={`shrink-0 self-start rounded-full p-1.5 transition-opacity cursor-pointer ${
                        messagePinned
                          ? "text-[var(--ether-indigo)] opacity-100"
                          : "opacity-40 hover:opacity-100 hover:text-[var(--ether-indigo)]"
                      }`}
                    >
                      {messagePinned ? <Pin size={12} fill="currentColor" /> : <PinOff size={12} />}
                    </span>
                  )}

                  {message.isUnread && (
                    <div className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-[var(--ether-indigo)] shadow-[0_0_8px_var(--ether-indigo)]" />
                  )}
                </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </WidgetShell>
  );
};

export default React.memo(MailWidget);
