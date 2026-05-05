import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, RefreshCcw, X } from "lucide-react";
import {
  FACE_STYLES,
  getFaceStyleId,
  useGenericMcpServers,
} from "../../../utils/settingsStorage";
import { useMcpServerTools } from "../../../hooks/useMcpServerTools";
import {
  DASHBOARD_ACTIVITY_MODULE_OPTIONS,
  DASHBOARD_CLOCK_DESIGN_OPTIONS,
  DASHBOARD_SYSTEM_STATUS_MODULE_OPTIONS,
  getDashboardCatalogItem,
  getWidgetDefaultGridSize,
  type DashboardAiChatDensity,
  type DashboardAiChatTextSize,
  type DashboardAiChatTone,
  type DashboardActivityModule,
  type DashboardCalendarDesign,
  type DashboardCalendarProvider,
  type DashboardDailySummaryModule,
  type DashboardDateInfoImportantDate,
  type DashboardDateInfoMetric,
  type DashboardHaDeviceIcon,
  type DashboardHaDisplaySize,
  type DashboardMailProvider,
  type DashboardMapTarget,
  type DashboardMessagesProvider,
  type DashboardNewsProvider,
  type DashboardNotesProvider,
  type DashboardRobotFaceStyle,
  type DashboardRobotFit,
  type DashboardRobotWanderMode,
  type DashboardSystemStatusModule,
  type DashboardTaskProvider,
  type DashboardTravelMode,
  type DashboardWidget,
  type DashboardWidgetConfig,
  type DashboardWidgetSize,
  type DashboardWidgetType,
} from "../../../services/dashboardTypes";
import { getChores, getTasks } from "../../../services/chorePersistence";
import type {
  NotionWidgetItem,
  NotionWidgetKind,
} from "../../../services/notionMcpWidgetService";
import {
  DEFAULT_NEWS_CATEGORY,
  DEFAULT_NEWS_PROVIDER,
  NEWS_FEED_CATEGORIES,
  NEWS_FEED_PROVIDER_OPTIONS,
  parseNewsCustomFeedsDraft,
  serializeNewsCustomFeedsDraft,
} from "../../../services/newsFeedService";
import {
  getDashboardRefreshPolicy,
  isLiveDashboardWidget,
  type DashboardRefreshMode,
} from "../../../services/dashboardRefresh";
import { getHaDeviceDisplayOptions } from "../../../services/haDeviceDisplay";
import { supportsDashboardWidgetGlassEffects } from "./dashboardBoardUtils";
import { clamp } from "./dashboardLayout";
import { HaDeviceIcon } from "./haDeviceIcons";
import ICalCalendarSettings from "./ICalCalendarSettings";
import PortfolioHoldingsSettings from "./PortfolioHoldingsSettings";
import StockSymbolSettings from "./StockSymbolSettings";
import WidgetInteractivityOverrides from "./WidgetInteractivityOverrides";
import WidgetSparklineHistoryControl from "./WidgetSparklineHistoryControl";
import { ROBOT_COLOR_PRESETS } from "./dashboardRobotPresets";
import ColorWheelInput from "../ColorWheelInput";

type HaEntityOption = {
  entity_id: string;
  name: string;
  area?: string;
};

const WIDGET_ACCENT_PRESETS = [
  { name: "Default", value: undefined, color: "transparent" },
  {
    name: "Sky",
    value: "rgba(57,184,253,0.2)",
    color: "#39b8fd",
  },
  {
    name: "Rose",
    value: "rgba(244,63,94,0.2)",
    color: "#f43f5e",
  },
  {
    name: "Emerald",
    value: "rgba(16,185,129,0.2)",
    color: "#10b981",
  },
  {
    name: "Violet",
    value: "rgba(139,92,246,0.2)",
    color: "#8b5cf6",
  },
  {
    name: "Amber",
    value: "rgba(245,158,11,0.2)",
    color: "#f59e0b",
  },
] as const;

const isWidgetAccentPresetValue = (value: string | undefined) =>
  WIDGET_ACCENT_PRESETS.some((preset) => preset.value === value);

const TinyInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <label className="grid gap-1.5">
    <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
      {label}
    </span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-[13px] text-[var(--ether-on-surface)] outline-none transition-all placeholder:text-[var(--ether-on-surface-variant)]/45 focus:border-[var(--ether-primary)]/40"
    />
  </label>
);

const TinyTextarea: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <label className="grid gap-1.5">
    <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
      {label}
    </span>
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={4}
      className="resize-none rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-[13px] text-[var(--ether-on-surface)] outline-none transition-all placeholder:text-[var(--ether-on-surface-variant)]/45 focus:border-[var(--ether-primary)]/40"
    />
  </label>
);

const TinyMcpExtras: React.FC<{
  serverId: string;
  onServerChange: (serverId: string) => void;
  queryLabel: string;
  queryValue: string;
  onQueryChange: (value: string) => void;
  queryPlaceholder?: string;
  toolName: string;
  onToolNameChange: (value: string) => void;
  sendToolName?: string;
  onSendToolNameChange?: (value: string) => void;
  replyToolName?: string;
  onReplyToolNameChange?: (value: string) => void;
}> = ({
  serverId,
  onServerChange,
  queryLabel,
  queryValue,
  onQueryChange,
  queryPlaceholder,
  toolName,
  onToolNameChange,
  sendToolName,
  onSendToolNameChange,
  replyToolName,
  onReplyToolNameChange,
}) => {
  const enabledServers = useGenericMcpServers().filter(
    (server) => server.enabled && server.kind !== "search",
  );

  return (
    <div className="grid gap-2">
      {enabledServers.length === 0 ? (
        <div className="rounded-xl bg-amber-500/15 px-3 py-2 text-[11px] text-amber-200">
          Connect and enable a general MCP server in Accounts & Keys to use this provider.
        </div>
      ) : (
        <label className="grid gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
            MCP server
          </span>
          <select
            value={serverId}
            onChange={(event) => onServerChange(event.target.value)}
            className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-[13px] text-[var(--ether-on-surface)] outline-none focus:border-[var(--ether-primary)]/40"
          >
            <option value="">Auto (first enabled)</option>
            {enabledServers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <TinyInput
        label={queryLabel}
        value={queryValue}
        onChange={onQueryChange}
        placeholder={queryPlaceholder}
      />
      <label className="grid gap-1.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
          Exact tool name (optional)
        </span>
        <input
          value={toolName}
          onChange={(event) => onToolNameChange(event.target.value)}
          placeholder="e.g. outlook_list_calendar_events"
          className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ether-on-surface)] outline-none transition-all placeholder:text-[var(--ether-on-surface-variant)]/45 focus:border-[var(--ether-primary)]/40"
        />
      </label>
      <TinyMcpToolPicker
        serverId={serverId}
        selectedTool={toolName}
        onSelect={onToolNameChange}
      />
      {onSendToolNameChange && (
        <>
          <label className="grid gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
              Send tool name (optional)
            </span>
            <input
              value={sendToolName || ""}
              onChange={(event) => onSendToolNameChange(event.target.value)}
              placeholder="e.g. email_send"
              className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ether-on-surface)] outline-none transition-all placeholder:text-[var(--ether-on-surface-variant)]/45 focus:border-[var(--ether-primary)]/40"
            />
          </label>
          <TinyMcpToolPicker
            serverId={serverId}
            selectedTool={sendToolName || ""}
            onSelect={onSendToolNameChange}
          />
        </>
      )}
      {onReplyToolNameChange && (
        <>
          <label className="grid gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
              Reply tool name (optional)
            </span>
            <input
              value={replyToolName || ""}
              onChange={(event) => onReplyToolNameChange(event.target.value)}
              placeholder="e.g. email_reply"
              className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 font-mono text-[12px] text-[var(--ether-on-surface)] outline-none transition-all placeholder:text-[var(--ether-on-surface-variant)]/45 focus:border-[var(--ether-primary)]/40"
            />
          </label>
          <TinyMcpToolPicker
            serverId={serverId}
            selectedTool={replyToolName || ""}
            onSelect={onReplyToolNameChange}
          />
        </>
      )}
    </div>
  );
};

const TinyMcpToolPicker: React.FC<{
  serverId: string;
  selectedTool: string;
  onSelect: (toolName: string) => void;
}> = ({ serverId, selectedTool, onSelect }) => {
  const { server, tools, loading, error, reload } = useMcpServerTools(serverId);
  const [open, setOpen] = useState(false);

  if (!server) return null;

  const label = loading
    ? "Loading tools..."
    : error
      ? "Could not load tools"
      : `${tools.length} ${tools.length === 1 ? "tool" : "tools"} available`;

  return (
    <div className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)]">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-[var(--ether-on-surface)] hover:opacity-85"
          aria-expanded={open}
        >
          <span
            className={`inline-block opacity-50 transition-transform ${open ? "rotate-90" : ""}`}
          >
            ▸
          </span>
          <span className="truncate">{server.name} · {label}</span>
        </button>
        <button
          type="button"
          onClick={reload}
          className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-55 hover:opacity-85"
        >
          Reload
        </button>
      </div>
      {open && (
        <div className="max-h-56 overflow-y-auto border-t border-[var(--ether-glass-border)] p-1.5">
          {error ? (
            <div className="px-2 py-1.5 text-[11px] text-[var(--ether-error)]">{error}</div>
          ) : tools.length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] opacity-60">No tools reported.</div>
          ) : (
            <ul className="space-y-1">
              {tools.map((tool) => {
                const isSelected = selectedTool === tool.name;
                return (
                  <li key={tool.name}>
                    <button
                      type="button"
                      onClick={() => onSelect(isSelected ? "" : tool.name)}
                      className={`block w-full rounded px-2 py-1 text-left text-[11px] transition ${
                        isSelected
                          ? "bg-[var(--ether-primary)]/20 ring-1 ring-[var(--ether-primary)]/40"
                          : "hover:bg-[var(--ether-surface-container-high)]"
                      }`}
                    >
                      <code className="block break-all font-semibold text-[var(--ether-on-surface)]">
                        {tool.name}
                      </code>
                      {tool.description && (
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug opacity-65">
                          {tool.description}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const NotionSourcePicker: React.FC<{
  kind: NotionWidgetKind;
  query: string;
  selectedId?: string;
  onQueryChange: (value: string) => void;
  onSelect: (item: NotionWidgetItem) => void;
}> = ({ kind, query, selectedId, onQueryChange, onSelect }) => {
  const [items, setItems] = useState<NotionWidgetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = kind === "notes" ? "notes" : "projects";

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const { listNotionWidgetItems } = await import("../../../services/notionMcpWidgetService");
      setItems(await listNotionWidgetItems({
        kind,
        query: query.trim() || undefined,
        maxItems: 12,
      }));
    } catch (fetchError) {
      setError((fetchError as Error).message || `Could not load Notion ${label}.`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-2">
      <TinyInput
        label="Notion source"
        value={query}
        onChange={onQueryChange}
        placeholder={kind === "notes" ? "notes, page, or database" : "projects, tasks, or database"}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void fetchItems()}
          disabled={loading}
          className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--ether-control-bg)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-hover)] disabled:opacity-50"
          aria-label={`Fetch Notion ${label}`}
        >
          <RefreshCcw size={13} className={loading ? "animate-spin" : ""} />
          Fetch
        </button>
        {error && (
          <span className="min-w-0 flex-1 text-[11px] leading-4 text-[var(--ether-error)]">
            {error}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div className="grid max-h-48 gap-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex min-w-0 items-center gap-2 rounded-2xl border p-2 ${
                selectedId === item.id
                  ? "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/10"
                  : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="min-w-0 flex-1 text-left"
                aria-label={`Select Notion source ${item.title}`}
              >
                <div className="truncate text-[12px] font-semibold text-[var(--ether-on-surface)]">
                  {item.title}
                </div>
                {item.preview && (
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--ether-on-surface-variant)]">
                    {item.preview}
                  </div>
                )}
              </button>
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--ether-control-hover)] text-[var(--ether-on-surface-variant)]"
                  aria-label={`Open Notion source ${item.title}`}
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DATE_INFO_METRIC_OPTIONS: Array<{ id: DashboardDateInfoMetric; label: string }> = [
  { id: "dayOfYear", label: "Day" },
  { id: "daysLeft", label: "Days left" },
  { id: "calendarWeek", label: "Calendar week" },
  { id: "isoWeek", label: "ISO week" },
  { id: "yearProgress", label: "Year %" },
  { id: "monthProgress", label: "Month %" },
  { id: "quarter", label: "Quarter" },
  { id: "daysInMonth", label: "Month days" },
  { id: "fiscalYear", label: "Fiscal year" },
  { id: "fiscalQuarter", label: "Fiscal quarter" },
  { id: "fiscalWeek", label: "Fiscal week" },
  { id: "fiscalDaysLeft", label: "Fiscal left" },
];

const DATE_INFO_DEFAULT_METRICS: DashboardDateInfoMetric[] = [
  "dayOfYear",
  "daysLeft",
  "calendarWeek",
  "isoWeek",
  "yearProgress",
  "fiscalWeek",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const getDateInfoMetrics = (value: unknown): DashboardDateInfoMetric[] =>
  Array.isArray(value) && value.length > 0
    ? value.filter((item): item is DashboardDateInfoMetric => typeof item === "string")
    : DATE_INFO_DEFAULT_METRICS;

const serializeDateInfoImportantDates = (items: unknown) =>
  Array.isArray(items)
    ? items
        .map((item) => {
          const entry = item as Partial<DashboardDateInfoImportantDate>;
          if (!entry?.label || !entry?.date) return "";
          return `${entry.date}${entry.recurringAnnual ? " yearly" : ""} | ${entry.label}`;
        })
        .filter(Boolean)
        .join("\n")
    : "";

const parseDateInfoImportantDates = (value: string): DashboardDateInfoImportantDate[] =>
  value
    .split(/\n+/)
    .map((line, index): DashboardDateInfoImportantDate | null => {
      const [rawDate, ...labelParts] = line.split("|");
      const dateToken = (rawDate || "").trim();
      const label = labelParts.join("|").trim();
      if (!dateToken || !label) return null;
      const recurringAnnual = /\byearly\b|\bannual\b/i.test(dateToken) || /^\d{2}-\d{2}$/.test(dateToken);
      const date = dateToken.replace(/\byearly\b|\bannual\b/gi, "").trim();
      return {
        id: `date_${index}_${date.replace(/[^a-z0-9]/gi, "")}`,
        label,
        date,
        recurringAnnual,
      };
    })
    .filter((entry): entry is DashboardDateInfoImportantDate => Boolean(entry));

const EntityPicker: React.FC<{
  label: string;
  entities: HaEntityOption[];
  selectedEntityLookup?: HaEntityOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onRemove?: (id: string) => void;
}> = ({ label, entities, selectedEntityLookup, selected, onToggle, onRemove }) => {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const selectedSet = useMemo(
    () => new Set(selected.map((id) => id.toLowerCase())),
    [selected],
  );
  const selectedEntities = useMemo(() => {
    const entityMap = new Map(
      (selectedEntityLookup || entities).map((entity) => [
        entity.entity_id.toLowerCase(),
        entity,
      ]),
    );
    const seen = new Set<string>();
    return selected
      .map((id) => id.toLowerCase())
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((id) => {
        const entity = entityMap.get(id);
        return {
          entity_id: id,
          name: entity?.name || id,
          area: entity?.area,
        };
      });
  }, [entities, selected, selectedEntityLookup]);
  const filtered = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return entities
      .filter((e) => {
        if (!normalizedQuery) return true;
        return (
          e.entity_id.toLowerCase().includes(normalizedQuery) ||
          e.name.toLowerCase().includes(normalizedQuery) ||
          String(e.area || "").toLowerCase().includes(normalizedQuery)
        );
      })
      .slice(0, 50);
  }, [deferredQuery, entities]);

  return (
    <div className="grid gap-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
        {label}
      </span>
      {selectedEntities.length > 0 && (
        <div className="grid gap-1.5 rounded-2xl border border-[var(--ether-primary)]/20 bg-[var(--ether-primary)]/8 p-2">
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ether-primary)]">
              Selected Entities
            </span>
            <span className="rounded-full bg-[var(--ether-primary)]/12 px-2 py-0.5 text-[9px] font-bold text-[var(--ether-primary)]">
              {selectedEntities.length}
            </span>
          </div>
          <div className="grid gap-1">
            {selectedEntities.map((entity) => (
              <div
                key={entity.entity_id}
                className="flex items-center gap-2 rounded-xl border border-[var(--ether-primary)]/15 bg-[var(--ether-surface-container-high)]/75 p-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-bold text-[var(--ether-on-surface)]">
                    {entity.name}
                  </div>
                  <div className="truncate text-[9px] text-[var(--ether-on-surface-variant)]/70">
                    {entity.area ? `${entity.area} - ${entity.entity_id}` : entity.entity_id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => (onRemove || onToggle)(entity.entity_id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
                  aria-label={`Remove ${entity.name}`}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <input
        placeholder="Filter entities..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-1.5 text-[11px] text-[var(--ether-on-surface)] outline-none"
      />
      <div className="max-h-[160px] overflow-y-auto custom-scrollbar pr-1 grid gap-1">
        {filtered.map((e) => {
          const entityId = e.entity_id.toLowerCase();
          const isSelected = selectedSet.has(entityId);
          return (
            <button
              key={e.entity_id}
              type="button"
              onClick={() => onToggle(entityId)}
              className={`flex items-center justify-between p-2 rounded-xl text-left transition-all ${
                isSelected
                  ? "bg-[var(--ether-primary)]/10 border border-[var(--ether-primary)]/20"
                  : "bg-[var(--ether-control-bg)] border border-transparent hover:bg-[var(--ether-control-hover)]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[11px] font-bold truncate ${isSelected ? "text-[var(--ether-primary)]" : "text-[var(--ether-on-surface)]"}`}
                >
                  {e.name}
                </div>
                <div className="text-[9px] opacity-40 truncate">
                  {e.area ? `${e.area} - ${e.entity_id}` : e.entity_id}
                </div>
              </div>
              {isSelected && (
                <Check
                  size={12}
                  className="text-[var(--ether-primary)] shrink-0"
                />
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--ether-glass-border)] px-3 py-4 text-center text-[11px] font-semibold text-[var(--ether-on-surface-variant)]">
            No matching entities
          </div>
        )}
      </div>
    </div>
  );
};

const parseHaDomainFilter = (value: unknown) =>
  String(value || "")
    .split(/[, ]+/)
    .map((item) => item.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);

const getHaEntityDomain = (entityId: string) =>
  entityId.split(".")[0]?.toLowerCase() || "";

const formatHaDomainLabel = (domain: string) =>
  domain
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const formatHaRoomLabel = (room: unknown) =>
  String(room || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const normalizeHaRoomLabel = (room: unknown) =>
  formatHaRoomLabel(room).toLowerCase();

const parseHaRoomNames = (value: unknown) =>
  Array.isArray(value)
    ? value.map(formatHaRoomLabel).filter(Boolean)
    : [];

const TinyNumberInput: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}> = ({ label, value, min = 1, max = 10, onChange }) => (
  <label className="grid gap-1.5">
    <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
      {label}
    </span>
    <input
      inputMode="numeric"
      value={String(value)}
      onChange={(event) => {
        const next = Number.parseInt(event.target.value, 10);
        onChange(Number.isFinite(next) ? clamp(next, min, max) : value);
      }}
      className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-[13px] text-[var(--ether-on-surface)] outline-none transition-all focus:border-[var(--ether-primary)]/40"
    />
  </label>
);


const WidgetSettingsModal: React.FC<{
  widget: DashboardWidget;
  onClose: () => void;
  onSave: (configPatch: Partial<DashboardWidgetConfig>) => void;
  haEnabled: boolean;
  haUrl: string;
  widgetGlowEnabled: boolean;
  glassEffectEnabled: boolean;
}> = ({
  widget,
  onClose,
  onSave,
  haEnabled,
  haUrl,
  widgetGlowEnabled,
  glassEffectEnabled,
}) => {
  const [draft, setDraft] = useState<DashboardWidgetConfig>({
    ...widget.config,
    ...(widget.type === "robot_face" && !widget.config.robotFaceStyle
      ? { robotFaceStyle: getFaceStyleId() }
      : {}),
  });
  const [entities, setEntities] = useState<HaEntityOption[]>([]);
  const supportsGlassEffects = supportsDashboardWidgetGlassEffects(widget.type);

  useEffect(() => {
    if (!haEnabled || !haUrl || !widget.type.startsWith("ha_")) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const { getHaMcpTokenAsync } =
          await import("../../../utils/settingsStorage");
        const token = await getHaMcpTokenAsync();
        if (!token) return;
        const { HomeAssistantMCPClient } =
          await import("../../../services/haMcpService");
        const client = new HomeAssistantMCPClient(haUrl, token, "rest");
        const list = await client.listEntities({ silent: true });
        if (!cancelled) {
          setEntities(client._allEntities || list);
        }
      } catch {
        if (!cancelled) {
          setEntities([]);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [haEnabled, haUrl, widget.type]);

  const filteredEntities = useMemo(() => {
    if (!widget.type.startsWith("ha_")) return entities;
    const domainFilters: Partial<Record<DashboardWidgetType, string[]>> = {
      ha_light: ["light"],
      ha_camera: ["camera"],
      ha_sensor: ["sensor", "binary_sensor"],
      ha_climate: ["climate"],
      ha_cover: ["cover"],
      ha_media_player: ["media_player"],
      ha_select: ["select", "input_select"],
      ha_button_stack: ["scene", "script", "button", "switch", "input_boolean", "light"],
      ha_calendar: ["calendar"],
      ha_vacuum: ["vacuum"],
      ha_printer: ["sensor", "binary_sensor", "button", "switch", "camera", "image"],
      ha_energy: ["sensor"],
    };
    const domains = widget.type === "ha_entities"
      ? parseHaDomainFilter(draft.domain)
      : domainFilters[widget.type];
    let filtered = domains?.length
      ? entities.filter((entity) =>
          domains.includes(getHaEntityDomain(entity.entity_id)),
        )
      : entities;
    if (widget.type === "ha_entities") {
      const selectedRooms = parseHaRoomNames(draft.haRoomNames);
      if (selectedRooms.length > 0) {
        const selectedRoomSet = new Set(selectedRooms.map(normalizeHaRoomLabel));
        filtered = filtered.filter((entity) =>
          selectedRoomSet.has(normalizeHaRoomLabel(entity.area)),
        );
      }
    }
    if (widget.type === "ha_printer") {
      const printerTerms = ["printer", "print", "bambu", "creality", "moonraker", "klipper", "nozzle", "extruder", "bed", "filament"];
      const printerMatched = filtered.filter((entity) => {
        const label = `${entity.entity_id} ${entity.name}`.toLowerCase();
        return printerTerms.some((term) => label.includes(term));
      });
      return printerMatched.length > 0 ? printerMatched : filtered;
    }
    if (widget.type === "ha_energy") {
      const energyTerms = ["power", "energy", "solar", "grid", "battery", "watt", "kwh", "electric"];
      const energyMatched = filtered.filter((entity) => {
        const label = `${entity.entity_id} ${entity.name}`.toLowerCase();
        return energyTerms.some((term) => label.includes(term));
      });
      return energyMatched.length > 0 ? energyMatched : filtered;
    }
    return filtered;
  }, [draft.domain, draft.haRoomNames, entities, widget.type]);
  const haEntityDomainOptions = useMemo(() => {
    const counts = new Map<string, number>();
    entities.forEach((entity) => {
      const domain = getHaEntityDomain(entity.entity_id);
      if (!domain) return;
      counts.set(domain, (counts.get(domain) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((left, right) => left.domain.localeCompare(right.domain));
  }, [entities]);
  const haRoomOptions = useMemo(() => {
    const counts = new Map<string, number>();
    entities.forEach((entity) => {
      const room = formatHaRoomLabel(entity.area);
      if (!room) return;
      counts.set(room, (counts.get(room) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([room, count]) => ({ room, count }))
      .sort((left, right) => left.room.localeCompare(right.room));
  }, [entities]);
  const selectedHaRooms = parseHaRoomNames(draft.haRoomNames);
  const multiEntityHaWidget = [
    "ha_camera",
    "ha_entities",
    "ha_button_stack",
    "ha_printer",
    "ha_energy",
  ].includes(widget.type);

  const choiceButtonClass = (selected: boolean) =>
    `rounded-2xl px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] transition ${
      selected
        ? "bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)] shadow-sm"
        : "bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
    }`;
  const appearanceButtonClass = (selected: boolean) =>
    `flex h-8 items-center gap-2 rounded-full border px-3 transition-all ${
      selected
        ? "border-[var(--ether-on-surface)]/35 bg-[var(--ether-control-hover)]"
        : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] hover:bg-[var(--ether-control-hover)]"
    }`;
  const aiChatCardButtonClass = (selected: boolean) =>
    `rounded-[1.15rem] border p-3 text-left transition ${
      selected
        ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
        : "border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
    }`;
  const aiChatToggleButtonClass = (selected: boolean) =>
    `flex min-h-11 min-w-0 items-center gap-3 rounded-[1.15rem] border px-3 py-2 text-left transition ${
      selected
        ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
        : "border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
    }`;
  const aiChatToneOptions: Array<{
    value: DashboardAiChatTone;
    label: string;
    description: string;
  }> = [
    { value: "balanced", label: "Balanced", description: "Useful detail without long answers." },
    { value: "concise", label: "Concise", description: "Short direct responses." },
    { value: "friendly", label: "Friendly", description: "Warmer conversational replies." },
    { value: "technical", label: "Technical", description: "Precise steps and implementation detail." },
    { value: "creative", label: "Creative", description: "More expressive language for ideation." },
  ];
  const aiChatDensityOptions: Array<{
    value: DashboardAiChatDensity;
    label: string;
    description: string;
  }> = [
    { value: "comfortable", label: "Comfortable", description: "Airier bubbles with room for longer replies." },
    { value: "compact", label: "Compact", description: "Tighter spacing for smaller widgets." },
  ];
  const aiChatTextSizeOptions: Array<{
    value: DashboardAiChatTextSize;
    label: string;
    description: string;
    previewClassName: string;
  }> = [
    { value: "small", label: "Small", description: "More messages visible.", previewClassName: "text-[12px] leading-5" },
    { value: "medium", label: "Medium", description: "Balanced readability.", previewClassName: "text-[13px] leading-6" },
    { value: "large", label: "Large", description: "Easier to read at a glance.", previewClassName: "text-[15px] leading-6" },
  ];
  const selectedAiChatDensity = (draft.aiChatDensity || "comfortable") as DashboardAiChatDensity;
  const selectedAiChatTextSize = (draft.aiChatTextSize || "medium") as DashboardAiChatTextSize;
  const selectedAiChatTextSizeClass =
    aiChatTextSizeOptions.find((option) => option.value === selectedAiChatTextSize)?.previewClassName ||
    aiChatTextSizeOptions[1].previewClassName;
  const renderAiChatToggle = (
    selected: boolean,
    label: string,
    description: string,
    onClick: () => void,
  ) => (
    <button
      key={label}
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={aiChatToggleButtonClass(selected)}
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          selected
            ? "bg-[var(--ether-primary)]"
            : "border border-current bg-transparent"
        }`}
      />
      <span className="min-w-0">
        <span className="block text-xs font-bold leading-4">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-4 opacity-65">
          {description}
        </span>
      </span>
    </button>
  );
  const summaryModuleOptions: Array<{
    id: DashboardDailySummaryModule;
    label: string;
    description: string;
  }> = [
    {
      id: "weather",
      label: "Weather",
      description: "Current forecast and temperature.",
    },
    {
      id: "calendar",
      label: "Calendar",
      description: "Next event and schedule pressure.",
    },
    {
      id: "tasks",
      label: "Tasks",
      description: "Chores, tasks, and reminders queue.",
    },
    {
      id: "notifications",
      label: "Alerts",
      description: "Unread notifications and recent activity.",
    },
    {
      id: "devices",
      label: "Devices",
      description: "Smart home connection status.",
    },
    {
      id: "routines",
      label: "Routines",
      description: "Enabled routine and automation count.",
    },
    { id: "air", label: "Air", description: "AQI and environmental context." },
  ];
  const selectedSummaryModules =
    Array.isArray(draft.dailySummaryModules) &&
    draft.dailySummaryModules.length > 0
      ? draft.dailySummaryModules
      : summaryModuleOptions.map((option) => option.id);
  const toggleSummaryModule = (module: DashboardDailySummaryModule) => {
    setDraft((current) => {
      const selected =
        Array.isArray(current.dailySummaryModules) &&
        current.dailySummaryModules.length > 0
          ? current.dailySummaryModules
          : summaryModuleOptions.map((option) => option.id);
      const next = selected.includes(module)
        ? selected.filter((item) => item !== module)
        : [...selected, module];
      return {
        ...current,
        dailySummaryModules: next.length > 0 ? next : selected,
      };
    });
  };
  const selectedSystemStatusModules =
    Array.isArray(draft.systemStatusModules) &&
    draft.systemStatusModules.length > 0
      ? draft.systemStatusModules
      : DASHBOARD_SYSTEM_STATUS_MODULE_OPTIONS.map((option) => option.id);
  const toggleSystemStatusModule = (module: DashboardSystemStatusModule) => {
    setDraft((current) => {
      const selected =
        Array.isArray(current.systemStatusModules) &&
        current.systemStatusModules.length > 0
          ? current.systemStatusModules
          : DASHBOARD_SYSTEM_STATUS_MODULE_OPTIONS.map((option) => option.id);
      const next = selected.includes(module)
        ? selected.filter((item) => item !== module)
        : [...selected, module];
      return {
        ...current,
        systemStatusModules: next.length > 0 ? next : [module],
      };
    });
  };
  const selectedActivityModules =
    Array.isArray(draft.activityModules) && draft.activityModules.length > 0
      ? draft.activityModules
      : DASHBOARD_ACTIVITY_MODULE_OPTIONS.map((option) => option.id);
  const toggleActivityModule = (module: DashboardActivityModule) => {
    setDraft((current) => {
      const selected =
        Array.isArray(current.activityModules) &&
        current.activityModules.length > 0
          ? current.activityModules
          : DASHBOARD_ACTIVITY_MODULE_OPTIONS.map((option) => option.id);
      const next = selected.includes(module)
        ? selected.filter((item) => item !== module)
        : [...selected, module];
      return {
        ...current,
        activityModules: next.length > 0 ? next : [module],
      };
    });
  };

  const robotFitOptions: Array<{
    value: DashboardRobotFit;
    label: string;
    description: string;
  }> = [
    { value: "float", label: "Float", description: "Face floats without a shell." },
    { value: "contain", label: "Contain", description: "Keeps the full face visible." },
    { value: "cover", label: "Cover", description: "Zooms in for more presence." },
  ];
  const robotWanderOptions: Array<{
    value: DashboardRobotWanderMode;
    label: string;
    description: string;
  }> = [
    { value: "off", label: "Still", description: "Only moves when you drag it." },
    { value: "idle", label: "Idle only", description: "Peeks around after you pause." },
    { value: "full", label: "Full wander", description: "Patrols widgets on its own." },
  ];
  const robotBubbleOptions: Array<{
    key: keyof Pick<
      DashboardWidgetConfig,
      | "robotBubbleEmail"
      | "robotBubbleMessages"
      | "robotBubbleCalendar"
      | "robotBubbleReminders"
      | "robotBubbleNotifications"
      | "robotBubbleWidgetData"
      | "robotBubbleCompanion"
    >;
    label: string;
  }> = [
    { key: "robotBubbleEmail", label: "Email" },
    { key: "robotBubbleMessages", label: "Messages" },
    { key: "robotBubbleCalendar", label: "Calendar" },
    { key: "robotBubbleReminders", label: "Reminders" },
    { key: "robotBubbleNotifications", label: "System Alerts" },
    { key: "robotBubbleWidgetData", label: "Widget Data" },
    { key: "robotBubbleCompanion", label: "Companion" },
  ];
  const liveWidget = isLiveDashboardWidget(widget.type);
  const refreshPolicy = getDashboardRefreshPolicy(widget.type, draft);
  const refreshModeOptions: Array<{
    value: DashboardRefreshMode;
    label: string;
    description: string;
  }> = [
    {
      value: "push",
      label: "Push",
      description: "Prefer app/session updates and action-triggered refresh.",
    },
    {
      value: "timed",
      label: "Timed",
      description: "Refresh while visible using the interval below.",
    },
    {
      value: "manual",
      label: "Manual",
      description: "Only refresh when opened or manually requested.",
    },
  ];
  const haDeviceDisplayWidget =
    widget.type === "ha_light" ||
    widget.type === "ha_sensor" ||
    widget.type === "ha_button_stack";
  const selectedHaEntityId = draft.entityIds?.[0] || "";
  const selectedHaEntityName =
    entities.find((entity) => entity.entity_id === selectedHaEntityId)?.name ||
    selectedHaEntityId.split(".")[1]?.replace(/_/g, " ") ||
    "";
  const haDeviceDisplayOptions = getHaDeviceDisplayOptions({
    widgetType: widget.type,
    entityId: selectedHaEntityId,
  });
  const haCardSizeMap: Record<DashboardHaDisplaySize, DashboardWidgetSize> = {
    compact: "small",
    standard: "medium",
    large: "large",
  };
  const applyHaDisplaySize = (displaySize: DashboardHaDisplaySize) => {
    const nextGridSize = getWidgetDefaultGridSize(
      widget.type,
      haCardSizeMap[displaySize],
    );
    setDraft((current) => ({
      ...current,
      haDisplaySize: displaySize,
      w: nextGridSize.w,
      h: nextGridSize.h,
    }));
  };
  const saveDraft = () => {
    if (widget.type === "news") {
      onSave({
        ...draft,
        newsProvider: draft.newsProvider || DEFAULT_NEWS_PROVIDER,
        newsCategory:
          draft.newsCategory ||
          ((draft.newsProvider || DEFAULT_NEWS_PROVIDER) === "combined_world"
            ? DEFAULT_NEWS_CATEGORY
            : undefined),
      });
      return;
    }
    onSave(draft);
  };

  return (
    <>
      <div
        className="absolute inset-0 z-[70] bg-black/35 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="absolute inset-0 z-[80] flex items-center justify-center p-4">
        <div className="dashboard-widget-settings-panel w-full max-w-lg overflow-y-auto rounded-[2rem] border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-5 text-[var(--ether-on-surface)] shadow-[0_32px_88px_rgba(2,6,23,0.22)] backdrop-blur-[30px]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ether-on-surface-variant)]">
                Widget Settings
              </div>
              <div className="mt-1 text-xl font-semibold text-[var(--ether-on-surface)]">
                {getDashboardCatalogItem(widget.type)?.label || widget.type}
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ether-control-bg)] text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-hover)]"
              aria-label="Close settings"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            {liveWidget && (
              <div className="rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                      Data refresh
                    </div>
                    <div className="mt-1 text-xs leading-4 text-[var(--ether-on-surface-variant)]">
                      {refreshPolicy.description}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--ether-surface-container-high)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
                    {refreshPolicy.mode === "timed"
                      ? `${refreshPolicy.intervalMinutes}m`
                      : refreshPolicy.label}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {refreshModeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          refreshMode: option.value,
                        }))
                      }
                      className={`rounded-[1.15rem] border p-3 text-left transition ${
                        (draft.refreshMode || "timed") === option.value
                          ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
                          : "border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
                      }`}
                    >
                      <div className="text-xs font-bold uppercase tracking-[0.16em]">
                        {option.label}
                      </div>
                      <div className="mt-1 text-xs leading-4 opacity-75">
                        {option.description}
                      </div>
                    </button>
                  ))}
                </div>
                {(draft.refreshMode || "timed") === "timed" && (
                  <div className="mt-3">
                    <TinyNumberInput
                      label={`Refresh interval (min ${refreshPolicy.minIntervalMinutes})`}
                      value={Number(
                        draft.refreshIntervalMinutes ||
                          refreshPolicy.intervalMinutes,
                      )}
                      min={refreshPolicy.minIntervalMinutes}
                      max={240}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          refreshIntervalMinutes: value,
                        }))
                      }
                    />
                  </div>
                )}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        refreshOnFocus: current.refreshOnFocus !== true,
                      }))
                    }
                    className={appearanceButtonClass(draft.refreshOnFocus === true)}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.refreshOnFocus === true
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">Refresh on expand</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        showRefreshMetadata:
                          current.showRefreshMetadata !== true,
                      }))
                    }
                    className={appearanceButtonClass(
                      draft.showRefreshMetadata === true,
                    )}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.showRefreshMetadata === true
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">Show sync label</span>
                  </button>
                </div>
              </div>
            )}

            {["weather", "air_quality", "astronomy"].includes(
              widget.type,
            ) && (
              <TinyInput
                label="City override"
                value={String(draft.city || "")}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, city: value }))
                }
                placeholder="Leave blank to use current location"
              />
            )}

            {widget.type === "forecast" && (
              <TinyInput
                label="Tracked cities"
                value={
                  Array.isArray(draft.forecastCities)
                    ? draft.forecastCities.join(", ")
                    : String(draft.city || "")
                }
                onChange={(value) => {
                  const cities = value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean);
                  setDraft((current) => ({
                    ...current,
                    forecastCities: cities,
                    city: cities[0] || "",
                  }));
                }}
                placeholder="San Francisco, Paris, Tokyo"
              />
            )}

            {widget.type === "date_info" && (
              <div className="grid gap-3 rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                <div>
                  <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
                    Visible info
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DATE_INFO_METRIC_OPTIONS.map((option) => {
                      const activeMetrics = getDateInfoMetrics(draft.dateInfoMetrics);
                      const active = activeMetrics.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() =>
                            setDraft((current) => {
                              const currentMetrics = getDateInfoMetrics(current.dateInfoMetrics);
                              const nextMetrics = currentMetrics.includes(option.id)
                                ? currentMetrics.filter((item) => item !== option.id)
                                : [...currentMetrics, option.id];
                              return {
                                ...current,
                                dateInfoMetrics: nextMetrics.length > 0 ? nextMetrics : [option.id],
                              };
                            })
                          }
                          className={`rounded-xl border px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] transition ${
                            active
                              ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/12 text-[var(--ether-on-surface)]"
                              : "border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
                    Fiscal year starts
                  </span>
                  <select
                    value={Number(draft.dateInfoFiscalYearStartMonth || 1)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        dateInfoFiscalYearStartMonth: Number(event.target.value),
                      }))
                    }
                    className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-[13px] text-[var(--ether-on-surface)] outline-none transition-all focus:border-[var(--ether-primary)]/40"
                  >
                    {MONTH_NAMES.map((month, index) => (
                      <option key={month} value={index + 1}>
                        {month}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      dateInfoShowWeekNumbers: current.dateInfoShowWeekNumbers !== true,
                    }))
                  }
                  className={`rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                    draft.dateInfoShowWeekNumbers === true
                      ? "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
                      : "border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
                  }`}
                >
                  Calendar week number view
                </button>
                <TinyTextarea
                  label="Important dates"
                  value={serializeDateInfoImportantDates(draft.dateInfoImportantDates)}
                  placeholder={"2026-06-15 | Project review\n07-04 yearly | Birthday"}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      dateInfoImportantDates: parseDateInfoImportantDates(value),
                    }))
                  }
                />
              </div>
            )}

            {[
              "calendar",
              "google_calendar",
              "outlook_calendar",
              "ical_calendar",
              "reminders",
              "notes",
              "obsidian_notes",
              "ha_entities",
              "tasks",
              "google_tasks",
              "chores",
              "mail",
              "gmail",
              "outlook_mail",
              "messages",
              "slack",
              "bookmarks",
              "habits",
              "news",
              "youtube_video",
            ].includes(widget.type) && (
              <TinyNumberInput
                label="Max items"
                value={Number(draft.maxItems || (widget.type === "news" ? 10 : 4))}
                max={widget.type === "news" ? 20 : 50}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, maxItems: value }))
                }
              />
            )}

            {widget.type === "ai_chat" && (
              <div className="grid gap-4 rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-4">
                <div className="grid gap-3">
                  <TinyInput
                    label="Chat title"
                    value={String(draft.aiChatTitle || "")}
                    onChange={(value) =>
                      setDraft((current) => ({ ...current, aiChatTitle: value }))
                    }
                    placeholder="AI Chat"
                  />
                  <TinyTextarea
                    label="Custom instructions"
                    value={String(draft.aiChatSystemPrompt || "")}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        aiChatSystemPrompt: value,
                      }))
                    }
                    placeholder="Answer like a concise project assistant."
                  />
                </div>

                <div className="grid gap-3 rounded-[1.25rem] border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-45">
                    Reply style
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {aiChatToneOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            aiChatTone: option.value,
                          }))
                        }
                        className={aiChatCardButtonClass((draft.aiChatTone || "balanced") === option.value)}
                      >
                        <div className="text-xs font-bold uppercase tracking-[0.16em]">
                          {option.label}
                        </div>
                        <div className="mt-1 text-xs leading-4 opacity-75">
                          {option.description}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
                        Density
                      </div>
                      <div className="grid gap-2">
                        {aiChatDensityOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selectedAiChatDensity === option.value}
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                aiChatDensity: option.value,
                              }))
                            }
                            className={aiChatCardButtonClass(selectedAiChatDensity === option.value)}
                          >
                            <div className="text-xs font-bold uppercase tracking-[0.16em]">
                              {option.label}
                            </div>
                            <div className="mt-1 text-xs leading-4 opacity-75">
                              {option.description}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
                        Bubble text
                      </div>
                      <div className="grid gap-2">
                        {aiChatTextSizeOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selectedAiChatTextSize === option.value}
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                aiChatTextSize: option.value,
                              }))
                            }
                            className={aiChatCardButtonClass(selectedAiChatTextSize === option.value)}
                          >
                            <div className="text-xs font-bold uppercase tracking-[0.16em]">
                              {option.label}
                            </div>
                            <div className="mt-1 text-xs leading-4 opacity-75">
                              {option.description}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.15rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-high)]/60 p-3">
                    <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
                      Preview
                    </div>
                    <div
                      className={`inline-block max-w-full rounded-[1rem] rounded-tl-md border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface)] ${
                        selectedAiChatDensity === "compact" ? "px-2.5 py-1.5" : "px-3 py-2"
                      } ${selectedAiChatTextSizeClass}`}
                    >
                      This is how replies will read.
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 rounded-[1.25rem] border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] p-3">
                  <TinyNumberInput
                    label="History limit"
                    value={Number(draft.aiChatHistoryLimit || 40)}
                    min={4}
                    max={120}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        aiChatHistoryLimit: value,
                      }))
                    }
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {renderAiChatToggle(
                      draft.aiChatShowTimestamps !== false,
                      "Timestamps",
                      "Show when each message was sent.",
                      () =>
                        setDraft((current) => ({
                          ...current,
                          aiChatShowTimestamps: current.aiChatShowTimestamps === false,
                        })),
                    )}
                    {renderAiChatToggle(
                      draft.aiChatAllowUploads !== false,
                      "Uploads",
                      "Allow images and files in prompts.",
                      () =>
                        setDraft((current) => ({
                          ...current,
                          aiChatAllowUploads: current.aiChatAllowUploads === false,
                        })),
                    )}
                    {renderAiChatToggle(
                      draft.aiChatVoiceInput !== false,
                      "Voice input",
                      "Show the microphone control.",
                      () =>
                        setDraft((current) => ({
                          ...current,
                          aiChatVoiceInput: current.aiChatVoiceInput === false,
                        })),
                    )}
                    {renderAiChatToggle(
                      draft.aiChatToolUse !== false,
                      "App actions",
                      "Let replies use Curio tools.",
                      () =>
                        setDraft((current) => ({
                          ...current,
                          aiChatToolUse: current.aiChatToolUse === false,
                        })),
                    )}
                  </div>
                </div>
              </div>
            )}

            {widget.type === "pomodoro" && (
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <TinyNumberInput
                    label="Work mins"
                    value={Number(draft.workMins || 25)}
                    max={60}
                    onChange={(val) => setDraft((c) => ({ ...c, workMins: val }))}
                  />
                  <TinyNumberInput
                    label="Break mins"
                    value={Number(draft.breakMins || 5)}
                    max={30}
                    onChange={(val) =>
                      setDraft((c) => ({ ...c, breakMins: val }))
                    }
                  />
                </div>
                <label className="grid gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
                    Linked task
                  </span>
                  <select
                    value={String(draft.linkedTaskId || "")}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        linkedTaskId: event.target.value || undefined,
                      }))
                    }
                    className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-[13px] text-[var(--ether-on-surface)] outline-none focus:border-[var(--ether-primary)]/40"
                  >
                    <option value="">(none)</option>
                    {[...getTasks(), ...getChores()].map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {widget.type === "music" && (
              <TinyInput
                label="Linked music widget id"
                value={String(draft.linkedMusicWidgetId || "")}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    linkedMusicWidgetId: value.trim() || undefined,
                  }))
                }
                placeholder="another music widget id"
              />
            )}

            {["greeting", "clock", "daily_summary"].includes(widget.type) && (
              <button
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    showDate: current.showDate === false,
                  }))
                }
                className={`rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                  draft.showDate === false
                    ? "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]"
                    : "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
                }`}
              >
                Show date
              </button>
            )}

            {widget.type === "analog_clock" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {DASHBOARD_CLOCK_DESIGN_OPTIONS.map((design) => (
                    <button
                      key={design.value}
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          clockDesign: design.value,
                        }))
                      }
                      className={`rounded-[1.2rem] border p-3 text-left transition ${
                        (draft.clockDesign || "modern") === design.value
                          ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
                          : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
                      }`}
                    >
                      <div className="text-xs font-bold uppercase tracking-[0.18em]">
                        {design.label}
                      </div>
                      <div className="mt-1 text-xs leading-4 opacity-75">
                        {design.description}
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      showSecondsHand: current.showSecondsHand !== true,
                    }))
                  }
                  className={`rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                    draft.showSecondsHand !== true
                      ? "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]"
                      : "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
                  }`}
                >
                  Show seconds hand
                </button>
              </>
            )}

            {widget.type === "daily_summary" && (
              <div className="rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                  Briefing modules
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {summaryModuleOptions.map((option) => {
                    const selected = selectedSummaryModules.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => toggleSummaryModule(option.id)}
                        className={`rounded-[1.1rem] border p-3 text-left transition ${
                          selected
                            ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10"
                            : "border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] hover:bg-[var(--ether-control-hover)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface)]">
                            {option.label}
                          </span>
                          {selected && (
                            <Check
                              size={13}
                              className="text-[var(--ether-primary)]"
                            />
                          )}
                        </div>
                        <div className="mt-1 text-xs leading-4 text-[var(--ether-on-surface-variant)]">
                          {option.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {widget.type === "system_status" && (
              <div className="rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                      System info
                    </div>
                    <div className="mt-1 text-xs leading-4 text-[var(--ether-on-surface-variant)]">
                      Choose which runtime signals appear in the widget.
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--ether-surface-container-high)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
                    {selectedSystemStatusModules.length} on
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DASHBOARD_SYSTEM_STATUS_MODULE_OPTIONS.map((option) => {
                    const selected = selectedSystemStatusModules.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => toggleSystemStatusModule(option.id)}
                        className={`rounded-[1.1rem] border p-3 text-left transition ${
                          selected
                            ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10"
                            : "border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] hover:bg-[var(--ether-control-hover)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface)]">
                            {option.label}
                          </span>
                          {selected && (
                            <Check
                              size={13}
                              className="text-[var(--ether-primary)]"
                            />
                          )}
                        </div>
                        <div className="mt-1 text-xs leading-4 text-[var(--ether-on-surface-variant)]">
                          {option.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {widget.type === "screen_time" && (
              <div className="rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                      Insight modules
                    </div>
                    <div className="mt-1 text-xs leading-4 text-[var(--ether-on-surface-variant)]">
                      Choose which local activity signals appear in the widget.
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--ether-surface-container-high)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
                    {selectedActivityModules.length} on
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DASHBOARD_ACTIVITY_MODULE_OPTIONS.map((option) => {
                    const selected = selectedActivityModules.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => toggleActivityModule(option.id)}
                        className={`rounded-[1.1rem] border p-3 text-left transition ${
                          selected
                            ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10"
                            : "border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] hover:bg-[var(--ether-control-hover)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface)]">
                            {option.label}
                          </span>
                          {selected && (
                            <Check
                              size={13}
                              className="text-[var(--ether-primary)]"
                            />
                          )}
                        </div>
                        <div className="mt-1 text-xs leading-4 text-[var(--ether-on-surface-variant)]">
                          {option.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {widget.type === "world_clock" && (
              <TinyInput
                label="Time zones"
                value={
                  Array.isArray(draft.timezones)
                    ? draft.timezones.join(", ")
                    : ""
                }
                onChange={(value) => {
                  const timezones = value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean);
                  setDraft((current) => ({
                    ...current,
                    timezones,
                    worldClockCities: timezones.map((timeZone) => ({
                      label: (timeZone.split("/").pop() || timeZone).replace(/_/g, " "),
                      timeZone,
                    })),
                  }));
                }}
                placeholder="America/Los_Angeles, Europe/London"
              />
            )}

            {widget.type === "map" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      "current",
                      "home",
                      "work",
                      "custom",
                    ] as DashboardMapTarget[]
                  ).map((target) => (
                    <button
                      key={target}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          mapTarget: target,
                        }))
                      }
                      className={choiceButtonClass(
                        (draft.mapTarget || "current") === target,
                      )}
                    >
                      {target}
                    </button>
                  ))}
                </div>
                {(draft.mapTarget || "current") === "custom" && (
                  <TinyInput
                    label="Custom location"
                    value={String(draft.customLocation || "")}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        customLocation: value,
                      }))
                    }
                    placeholder="123 Main Street, Seattle"
                  />
                )}
                <TinyInput
                  label="Linked commute widget id"
                  value={String(draft.linkedCommuteId || "")}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      linkedCommuteId: value.trim() || undefined,
                    }))
                  }
                  placeholder="commute widget id"
                />
              </>
            )}

            {widget.type === "mail" && (
              <>
              <div className="grid grid-cols-5 gap-2">
                {(["auto", "gmail", "outlook", "zapier", "mcp"] as DashboardMailProvider[]).map(
                  (provider) => (
                    <button
                      key={provider}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          mailProvider: provider,
                        }))
                      }
                      className={choiceButtonClass(
                        (draft.mailProvider || "auto") === provider,
                      )}
                    >
                      {provider}
                    </button>
                  ),
                )}
              </div>
              {draft.mailProvider === "zapier" && (
                <TinyInput
                  label="Zapier email query"
                  value={String(draft.zapierQuery || "")}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      zapierQuery: value,
                    }))
                  }
                  placeholder="inbox, unread, from:alex"
                />
              )}
              {draft.mailProvider === "mcp" && (
                <TinyMcpExtras
                  serverId={String(draft.mcpServerId || "")}
                  onServerChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      mcpServerId: value || undefined,
                    }))
                  }
                  queryLabel="MCP email query"
                  queryValue={String(draft.mcpQuery || "")}
                  onQueryChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      mcpQuery: value,
                    }))
                  }
                  queryPlaceholder="inbox, unread, from:alex"
                  toolName={String(draft.mcpToolName || "")}
                  onToolNameChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      mcpToolName: value.trim() || undefined,
                    }))
                  }
                  sendToolName={String(draft.mcpSendToolName || "")}
                  onSendToolNameChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      mcpSendToolName: value.trim() || undefined,
                    }))
                  }
                  replyToolName={String(draft.mcpReplyToolName || "")}
                  onReplyToolNameChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      mcpReplyToolName: value.trim() || undefined,
                    }))
                  }
                />
              )}
              </>
            )}

            {widget.type === "messages" && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {(["slack", "mock", "mcp"] as DashboardMessagesProvider[]).map(
                    (provider) => (
                      <button
                        key={provider}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            messagesProvider: provider,
                          }))
                        }
                        className={choiceButtonClass(
                          (draft.messagesProvider || "slack") === provider,
                        )}
                      >
                        {provider}
                      </button>
                    ),
                  )}
                </div>
                <TinyInput
                  label="Channel id or name"
                  value={String(draft.channelId || "")}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, channelId: value }))
                  }
                  placeholder="#general"
                />
                <TinyInput
                  label="Channel label"
                  value={String(draft.channelName || "")}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, channelName: value }))
                  }
                  placeholder="general"
                />
                {draft.messagesProvider === "mcp" && (
                  <TinyMcpExtras
                    serverId={String(draft.mcpServerId || "")}
                    onServerChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        mcpServerId: value || undefined,
                      }))
                    }
                    queryLabel="MCP channel query"
                    queryValue={String(draft.mcpChannelQuery || "")}
                    onQueryChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        mcpChannelQuery: value,
                      }))
                    }
                    queryPlaceholder="Slack channel or keyword"
                    toolName={String(draft.mcpToolName || "")}
                    onToolNameChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        mcpToolName: value.trim() || undefined,
                      }))
                    }
                  />
                )}
              </>
            )}

            {widget.type === "calendar" && (
              <>
              <div className="grid grid-cols-6 gap-2">
                {(
                  ["auto", "google", "outlook", "ical", "zapier", "mcp"] as DashboardCalendarProvider[]
                ).map((provider) => (
                  <button
                    key={provider}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        calendarProvider: provider,
                      }))
                    }
                    className={choiceButtonClass(
                      (draft.calendarProvider || "auto") === provider,
                    )}
                  >
                    {provider}
                  </button>
                ))}
              </div>
              {draft.calendarProvider === "zapier" && (
                <TinyInput
                  label="Zapier calendar query"
                  value={String(draft.zapierQuery || "")}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      zapierQuery: value,
                    }))
                  }
                  placeholder="today, this week, upcoming meetings"
                />
              )}
              {draft.calendarProvider === "mcp" && (
                <TinyMcpExtras
                  serverId={String(draft.mcpServerId || "")}
                  onServerChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      mcpServerId: value || undefined,
                    }))
                  }
                  queryLabel="MCP calendar query"
                  queryValue={String(draft.mcpQuery || "")}
                  onQueryChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      mcpQuery: value,
                    }))
                  }
                  queryPlaceholder="today, this week, upcoming meetings"
                  toolName={String(draft.mcpToolName || "")}
                  onToolNameChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      mcpToolName: value.trim() || undefined,
                    }))
                  }
                />
              )}
              </>
            )}

            {(widget.type === "calendar" ||
              widget.type === "ical_calendar" ||
              draft.calendarProvider === "ical") && (
              <ICalCalendarSettings
                selectedSourceId={String(draft.calendarSourceId || "all")}
                onSelectedSourceIdChange={(sourceId) =>
                  setDraft((current) => ({
                    ...current,
                    calendarProvider: "ical",
                    calendarSourceId: sourceId,
                  }))
                }
                variant="ether"
              />
            )}

            {["calendar", "google_calendar", "outlook_calendar", "ical_calendar"].includes(
              widget.type,
            ) && (
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      value: "list",
                      label: "List",
                      description: "Compact event cards.",
                    },
                    {
                      value: "studio",
                      label: "Studio",
                      description: "Week strip and timeline.",
                    },
                  ] as Array<{
                    value: DashboardCalendarDesign;
                    label: string;
                    description: string;
                  }>
                ).map((design) => (
                  <button
                    key={design.value}
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        calendarDesign: design.value,
                      }))
                    }
                    className={`rounded-[1.2rem] border p-3 text-left transition ${
                      (draft.calendarDesign || "list") === design.value
                        ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
                        : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
                    }`}
                  >
                    <div className="text-xs font-bold uppercase tracking-[0.18em]">
                      {design.label}
                    </div>
                    <div className="mt-1 text-xs leading-4 opacity-75">
                      {design.description}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {(widget.type === "notes" || widget.type === "notion_notes") && (
              <div className="grid grid-cols-5 gap-2">
                {(["internal", "obsidian", "notion", "zapier", "mcp"] as DashboardNotesProvider[]).map(
                  (provider) => (
                    <button
                      key={provider}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          notesProvider: provider,
                        }))
                      }
                      className={choiceButtonClass(
                        (draft.notesProvider || "internal") === provider,
                      )}
                    >
                      {provider}
                    </button>
                  ),
                )}
              </div>
            )}
            {(widget.type === "notes" || widget.type === "notion_notes") && draft.notesProvider === "notion" && (
              <NotionSourcePicker
                kind="notes"
                query={String(draft.notionQuery || "")}
                selectedId={draft.notionSourceId}
                onQueryChange={(value) =>
                  setDraft((current) => ({ ...current, notionQuery: value }))
                }
                onSelect={(item) =>
                  setDraft((current) => ({
                    ...current,
                    notionQuery: item.title,
                    notionSourceId: item.id,
                    notionSourceTitle: item.title,
                    notionSourceUrl: item.url,
                  }))
                }
              />
            )}
            {(widget.type === "notes" || widget.type === "notion_notes") && draft.notesProvider === "zapier" && (
              <TinyInput
                label="Zapier notes query"
                value={String(draft.zapierQuery || "")}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, zapierQuery: value }))
                }
                placeholder="meeting notes, project docs, recent notes"
              />
            )}
            {(widget.type === "notes" || widget.type === "notion_notes") && draft.notesProvider === "mcp" && (
              <TinyMcpExtras
                serverId={String(draft.mcpServerId || "")}
                onServerChange={(value) =>
                  setDraft((current) => ({ ...current, mcpServerId: value || undefined }))
                }
                queryLabel="MCP notes query"
                queryValue={String(draft.mcpQuery || "")}
                onQueryChange={(value) =>
                  setDraft((current) => ({ ...current, mcpQuery: value }))
                }
                queryPlaceholder="meeting notes, recent notes"
                toolName={String(draft.mcpToolName || "")}
                onToolNameChange={(value) =>
                  setDraft((current) => ({ ...current, mcpToolName: value.trim() || undefined }))
                }
              />
            )}

            {widget.type === "rich_note" && (
              <TinyInput
                label="Sticky note title"
                value={String(draft.richNoteTitle || "")}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, richNoteTitle: value }))
                }
                placeholder="Sticky Note"
              />
            )}

            {widget.type === "table" && (
              <div className="grid gap-3">
                <TinyInput
                  label="Table title"
                  value={String(draft.tableTitle || "")}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, tableTitle: value }))
                  }
                  placeholder="Table"
                />
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      tableHeaderRow: current.tableHeaderRow === false,
                    }))
                  }
                  className={appearanceButtonClass(draft.tableHeaderRow !== false)}
                >
                  <div
                    className={`h-2 w-2 rounded-full ${
                      draft.tableHeaderRow !== false
                        ? "bg-[var(--ether-primary)]"
                        : "border border-current bg-transparent"
                    }`}
                  />
                  <span className="text-xs font-medium">Use first row as header</span>
                </button>
              </div>
            )}

            {(widget.type === "tasks" || widget.type === "notion_projects") && (
              <div className="grid grid-cols-5 gap-2">
                {(["internal", "google", "notion", "zapier", "mcp"] as DashboardTaskProvider[]).map(
                  (provider) => (
                    <button
                      key={provider}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          taskProvider: provider,
                        }))
                      }
                      className={choiceButtonClass(
                        (draft.taskProvider || "internal") === provider,
                      )}
                    >
                      {provider}
                    </button>
                  ),
                )}
              </div>
            )}
            {(widget.type === "tasks" || widget.type === "notion_projects") && draft.taskProvider === "notion" && (
              <NotionSourcePicker
                kind="projects"
                query={String(draft.notionQuery || "")}
                selectedId={draft.notionSourceId}
                onQueryChange={(value) =>
                  setDraft((current) => ({ ...current, notionQuery: value }))
                }
                onSelect={(item) =>
                  setDraft((current) => ({
                    ...current,
                    notionQuery: item.title,
                    notionSourceId: item.id,
                    notionSourceTitle: item.title,
                    notionSourceUrl: item.url,
                  }))
                }
              />
            )}
            {(widget.type === "tasks" || widget.type === "notion_projects") && draft.taskProvider === "zapier" && (
              <TinyInput
                label="Zapier tasks query"
                value={String(draft.zapierQuery || "")}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, zapierQuery: value }))
                }
                placeholder="open tasks, today, current projects"
              />
            )}
            {(widget.type === "tasks" || widget.type === "notion_projects") && draft.taskProvider === "mcp" && (
              <TinyMcpExtras
                serverId={String(draft.mcpServerId || "")}
                onServerChange={(value) =>
                  setDraft((current) => ({ ...current, mcpServerId: value || undefined }))
                }
                queryLabel="MCP tasks query"
                queryValue={String(draft.mcpQuery || "")}
                onQueryChange={(value) =>
                  setDraft((current) => ({ ...current, mcpQuery: value }))
                }
                queryPlaceholder="open tasks, today, current projects"
                toolName={String(draft.mcpToolName || "")}
                onToolNameChange={(value) =>
                  setDraft((current) => ({ ...current, mcpToolName: value.trim() || undefined }))
                }
              />
            )}

            {widget.type === "stock" && (
              <StockSymbolSettings
                symbols={draft.symbols}
                onSymbolsChange={(symbols) =>
                  setDraft((current) => ({ ...current, symbols }))
                }
                variant="ether"
              />
            )}

            {widget.type === "portfolio" && (
              <PortfolioHoldingsSettings
                holdings={draft.portfolioHoldings}
                onHoldingsChange={(portfolioHoldings) =>
                  setDraft((current) => ({ ...current, portfolioHoldings }))
                }
                variant="ether"
              />
            )}

            {widget.type === "news" && (
              <div className="grid gap-3 rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                <label className="grid gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
                    News source
                  </span>
                  <select
                    aria-label="News source"
                    value={String(draft.newsProvider || DEFAULT_NEWS_PROVIDER)}
                    onChange={(event) => {
                      const provider = event.target.value as DashboardNewsProvider;
                      const category =
                        provider === "combined_world"
                          ? DEFAULT_NEWS_CATEGORY
                          : provider === "nytimes"
                            ? "top"
                            : draft.newsCategory;
                      setDraft((current) => ({
                        ...current,
                        newsProvider: provider,
                        ...(category ? { newsCategory: category } : {}),
                      }));
                    }}
                    className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-[13px] text-[var(--ether-on-surface)] outline-none transition-all focus:border-[var(--ether-primary)]/40"
                  >
                    <option value="grounded">AI Search</option>
                    {NEWS_FEED_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {(["combined_world", "nytimes"] as DashboardNewsProvider[]).includes(
                  (draft.newsProvider || DEFAULT_NEWS_PROVIDER) as DashboardNewsProvider,
                ) && (
                  <label className="grid gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
                      News type
                    </span>
                    <select
                      aria-label="News type"
                      value={String(
                        draft.newsCategory ||
                          ((draft.newsProvider || DEFAULT_NEWS_PROVIDER) === "combined_world"
                            ? DEFAULT_NEWS_CATEGORY
                            : "top"),
                      )}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          newsCategory: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-[13px] text-[var(--ether-on-surface)] outline-none transition-all focus:border-[var(--ether-primary)]/40"
                    >
                      {NEWS_FEED_CATEGORIES[
                        (draft.newsProvider || DEFAULT_NEWS_PROVIDER) === "nytimes"
                          ? "nytimes"
                          : "combined_world"
                      ].map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {(draft.newsProvider || DEFAULT_NEWS_PROVIDER) === "custom_rss" && (
                  <TinyInput
                    label="Single RSS feed URL"
                    value={String(draft.newsCustomFeedUrl || "")}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        newsCustomFeedUrl: value,
                      }))
                    }
                    placeholder="https://example.com/feed.xml"
                  />
                )}

                <TinyTextarea
                  label="Custom RSS feeds"
                  value={serializeNewsCustomFeedsDraft(draft.newsCustomFeeds)}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      newsCustomFeeds: parseNewsCustomFeedsDraft(value),
                    }))
                  }
                  placeholder={"Source name | https://example.com/feed.xml | world, business\nhttps://example.com/tech.xml | technology"}
                />

                {(draft.newsProvider || DEFAULT_NEWS_PROVIDER) === "grounded" && (
                  <TinyInput
                    label="AI search topic"
                    value={String(draft.newsTopic || "")}
                    onChange={(value) =>
                      setDraft((current) => ({ ...current, newsTopic: value }))
                    }
                    placeholder="Technology, AI, Sports"
                  />
                )}
              </div>
            )}

            {widget.type === "youtube_video" && (
              <>
                <TinyInput
                  label="Default search"
                  value={String(draft.youtubeQuery || "")}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, youtubeQuery: value }))
                  }
                  placeholder="Live coding, lo-fi mix, travel vlog"
                />
                <button
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      youtubeAutoplay: current.youtubeAutoplay === false,
                    }))
                  }
                  className={`rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                    draft.youtubeAutoplay === false
                      ? "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]"
                      : "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
                  }`}
                >
                  Autoplay video when AI opens this widget
                </button>
              </>
            )}

            {widget.type === "commute" && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {(["work", "home", "custom"] as const).map((target) => (
                    <button
                      key={target}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          commuteTarget: target,
                        }))
                      }
                      className={choiceButtonClass(
                        (draft.commuteTarget || "work") === target,
                      )}
                    >
                      {target}
                    </button>
                  ))}
                </div>
                {(draft.commuteTarget || "work") === "custom" && (
                  <TinyInput
                    label="Custom destination"
                    value={String(draft.customDestination || "")}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        customDestination: value,
                      }))
                    }
                    placeholder="123 Main Street, Seattle"
                  />
                )}
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      "driving",
                      "walking",
                      "bicycling",
                      "transit",
                    ] as DashboardTravelMode[]
                  ).map((mode) => (
                    <button
                      key={mode}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          travelMode: mode,
                        }))
                      }
                      className={choiceButtonClass(
                        (draft.travelMode || "driving") === mode,
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      showMapPreview: current.showMapPreview !== true,
                    }))
                  }
                  className={`rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                    draft.showMapPreview === true
                      ? "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
                      : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]"
                  }`}
                >
                  Show map preview in the widget
                </button>
              </>
            )}

            {haDeviceDisplayWidget && (
              <div className="rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                      Device Display
                    </div>
                    <div className="mt-1 text-xs leading-4 text-[var(--ether-on-surface-variant)]">
                      Rename the card, choose a preset icon, and tune its board footprint.
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--ether-surface-container-high)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
                    HA
                  </span>
                </div>

                <TinyInput
                  label="Card name"
                  value={String(draft.displayName || "")}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      displayName: value,
                    }))
                  }
                  placeholder={
                    selectedHaEntityName ||
                    (widget.type === "ha_light"
                      ? "Kitchen light"
                      : widget.type === "ha_button_stack"
                        ? "Scene controls"
                        : "Kitchen sensor")
                  }
                />

                <div className="mt-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                    Card size
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {haDeviceDisplayOptions.sizes.map((sizeOption) => (
                      <button
                        key={sizeOption.value}
                        type="button"
                        onClick={() => applyHaDisplaySize(sizeOption.value)}
                        className={`rounded-[1.15rem] border p-3 text-left transition ${
                          (draft.haDisplaySize || "standard") === sizeOption.value
                            ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
                            : "border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
                        }`}
                      >
                        <div className="text-xs font-bold uppercase tracking-[0.16em]">
                          {sizeOption.label}
                        </div>
                        <div className="mt-1 text-xs leading-4 opacity-75">
                          {sizeOption.value === "compact"
                            ? "Small footprint"
                            : sizeOption.value === "large"
                              ? "Bigger readout"
                              : "Balanced card"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                    Icon
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {haDeviceDisplayOptions.icons.map((iconOption) => {
                      const selected =
                        (draft.haDeviceIcon || "auto") === iconOption.value;
                      return (
                        <button
                          key={iconOption.value}
                          type="button"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              haDeviceIcon: iconOption.value as DashboardHaDeviceIcon,
                            }))
                          }
                          className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-[1rem] border p-2 text-center transition ${
                            selected
                              ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)]"
                              : "border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
                          }`}
                          aria-label={`Use ${iconOption.label} icon`}
                        >
                          <HaDeviceIcon
                            icon={iconOption.value as DashboardHaDeviceIcon}
                            size={18}
                          />
                          <span className="text-[8px] font-bold uppercase tracking-[0.12em]">
                            {iconOption.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {widget.type === "ha_sensor" && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        haShowLiveBadge: current.haShowLiveBadge !== true,
                      }))
                    }
                    className={`${appearanceButtonClass(draft.haShowLiveBadge === true)} mt-3`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.haShowLiveBadge === true
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">Show Live badge</span>
                  </button>
                )}
              </div>
            )}

            {widget.type.startsWith("ha_") && (
              <div className="rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        haShowControls: current.haShowControls === false,
                      }))
                    }
                    className={appearanceButtonClass(draft.haShowControls !== false)}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.haShowControls !== false
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">Show Controls</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        haShowEntityIds: current.haShowEntityIds !== true,
                      }))
                    }
                    className={appearanceButtonClass(draft.haShowEntityIds === true)}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.haShowEntityIds === true
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">Entity IDs</span>
                  </button>
                </div>
              </div>
            )}

            {widget.type === "robot_face" && (
              <div className="rounded-[1.6rem] border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                  Robot Widget
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {FACE_STYLES.map((faceStyle) => (
                    <button
                      key={faceStyle.id}
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          robotFaceStyle: faceStyle.id as DashboardRobotFaceStyle,
                        }))
                      }
                      className={choiceButtonClass(
                        (draft.robotFaceStyle || "curio") === faceStyle.id,
                      )}
                    >
                      {faceStyle.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-3">
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
                      Accent Color
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {ROBOT_COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              robotAccentColor: color,
                            }))
                          }
                          className={`h-9 w-9 rounded-full border-2 transition active:scale-95 ${
                            (draft.robotAccentColor || "#38bdf8").toLowerCase() === color.toLowerCase()
                              ? "border-[var(--ether-on-surface)] shadow-lg"
                              : "border-white/20"
                          }`}
                          style={{ backgroundColor: color }}
                          aria-label={`Robot color ${color}`}
                        />
                      ))}
                      <ColorWheelInput
                        value={String(draft.robotAccentColor || "#38bdf8")}
                        onChange={(robotAccentColor) =>
                          setDraft((current) => ({
                            ...current,
                            robotAccentColor,
                          }))
                        }
                        ariaLabel="Custom robot color"
                        title="Custom robot color"
                        active={
                          !ROBOT_COLOR_PRESETS.some(
                            (color) =>
                              (draft.robotAccentColor || "#38bdf8").toLowerCase() ===
                              color.toLowerCase(),
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {robotFitOptions.map((fit) => (
                      <button
                        key={fit.value}
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            robotFit: fit.value,
                          }))
                        }
                        className={`rounded-[1.15rem] border p-3 text-left transition ${
                          (draft.robotFit || "float") === fit.value
                            ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10"
                            : "border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] hover:bg-[var(--ether-control-hover)]"
                        }`}
                      >
                        <div className="text-xs font-bold uppercase tracking-[0.16em]">
                          {fit.label}
                        </div>
                        <div className="mt-1 text-xs leading-4 text-[var(--ether-on-surface-variant)]">
                          {fit.description}
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        robotShowGlow: current.robotShowGlow === false,
                      }))
                    }
                    className={appearanceButtonClass(draft.robotShowGlow !== false)}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.robotShowGlow !== false
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">Floating Glow</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        robotFloatingEnabled: current.robotFloatingEnabled !== true,
                      }))
                    }
                    className={appearanceButtonClass(draft.robotFloatingEnabled === true)}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.robotFloatingEnabled === true
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">Float across dashboard</span>
                  </button>
                  <div className="rounded-[1.35rem] border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] p-3">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
                      Floating Motion
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {robotWanderOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              robotFloatingEnabled:
                                option.value === "off"
                                  ? current.robotFloatingEnabled
                                  : true,
                              robotWanderMode: option.value,
                            }))
                          }
                          className={`rounded-[1.15rem] border p-3 text-left transition ${
                            (draft.robotWanderMode || "idle") === option.value
                              ? "border-[var(--ether-primary)]/35 bg-[var(--ether-primary)]/10"
                              : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] hover:bg-[var(--ether-control-hover)]"
                          }`}
                        >
                          <div className="text-xs font-bold uppercase tracking-[0.16em]">
                            {option.label}
                          </div>
                          <div className="mt-1 text-xs leading-4 text-[var(--ether-on-surface-variant)]">
                            {option.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[1.35rem] border border-[var(--ether-glass-border)] bg-[var(--ether-glass-bg)] p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
                        Proactive Bubbles
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            robotBubblesEnabled: current.robotBubblesEnabled === false,
                          }))
                        }
                        className={`text-[10px] font-bold uppercase tracking-[0.15em] transition ${
                          draft.robotBubblesEnabled === false
                            ? "text-[var(--ether-on-surface-variant)]"
                            : "text-[var(--ether-primary)]"
                        }`}
                      >
                        {draft.robotBubblesEnabled === false ? "Off" : "On"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {robotBubbleOptions.map((option) => {
                        const selected =
                          draft.robotBubblesEnabled !== false &&
                          draft[option.key] !== false;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                robotBubblesEnabled: current.robotBubblesEnabled === false
                                  ? true
                                  : current.robotBubblesEnabled,
                                [option.key]: current[option.key] === false,
                              }))
                            }
                            className={appearanceButtonClass(selected)}
                          >
                            <div
                              className={`h-2 w-2 rounded-full ${
                                selected
                                  ? "bg-[var(--ether-primary)]"
                                  : "border border-current bg-transparent"
                              }`}
                            />
                            <span className="text-xs font-medium">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-[var(--ether-glass-border)] pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                  Appearance
                </span>
                <div className="flex items-center gap-3">
                  {supportsGlassEffects && (
                    <button
                      onClick={() =>
                        setDraft((c) => ({
                          ...c,
                          glassEnabled: c.glassEnabled === false,
                        }))
                      }
                      className={`text-[10px] font-bold uppercase tracking-[0.15em] transition ${
                        draft.glassEnabled === false
                          ? "text-[var(--ether-on-surface-variant)]"
                          : "text-[var(--ether-primary)]"
                      }`}
                    >
                      {draft.glassEnabled === false
                        ? "Glass Off"
                        : glassEffectEnabled
                          ? "Glass On"
                          : "Glass Ready"}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setDraft((c) => ({
                        ...c,
                        glowEnabled: c.glowEnabled === false,
                      }))
                    }
                    className={`text-[10px] font-bold uppercase tracking-[0.15em] transition ${
                      draft.glowEnabled === false
                        ? "text-[var(--ether-on-surface-variant)]"
                        : "text-[var(--ether-primary)]"
                    }`}
                  >
                    {draft.glowEnabled === false
                      ? "Glow Off"
                      : widgetGlowEnabled
                      ? "Glow On"
                      : "Glow Ready"}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {WIDGET_ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      setDraft((c) => ({ ...c, accentOverride: preset.value }))
                    }
                    className={appearanceButtonClass(
                      draft.accentOverride === preset.value,
                    )}
                  >
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          preset.color || "rgba(255,255,255,0.1)",
                      }}
                    />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--ether-on-surface-variant)]">
                      {preset.name}
                    </span>
                  </button>
                ))}
                <ColorWheelInput
                  value={
                    !isWidgetAccentPresetValue(draft.accentOverride)
                      ? draft.accentOverride
                      : "#39b8fd"
                  }
                  onChange={(accentOverride) =>
                    setDraft((current) => ({ ...current, accentOverride }))
                  }
                  ariaLabel="Custom widget accent color"
                  title="Custom widget accent color"
                  active={
                    Boolean(draft.accentOverride) &&
                    !isWidgetAccentPresetValue(draft.accentOverride)
                  }
                />
              </div>
            </div>

            {widget.type === "health" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <TinyNumberInput
                  label="Step goal"
                  value={Number(draft.stepGoal || 8500)}
                  max={50000}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, stepGoal: value }))
                  }
                />
                <TinyNumberInput
                  label="Move goal"
                  value={Number(draft.moveGoal || 650)}
                  max={2000}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, moveGoal: value }))
                  }
                />
                <TinyNumberInput
                  label="Exercise goal"
                  value={Number(draft.exerciseGoal || 45)}
                  max={240}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, exerciseGoal: value }))
                  }
                />
                <TinyNumberInput
                  label="Stand goal"
                  value={Number(draft.standGoal || 12)}
                  max={24}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, standGoal: value }))
                  }
                />
              </div>
            )}

            {widget.type.startsWith("ha_") && widget.type !== "ha_entities" && (
              <EntityPicker
                label={
                  widget.type === "ha_energy"
                    ? "Tracked devices"
                    : multiEntityHaWidget
                      ? "Select Entities"
                      : "Select Device"
                }
                entities={filteredEntities}
                selectedEntityLookup={entities}
                selected={draft.entityIds || []}
                onToggle={(id) => {
                  if (!multiEntityHaWidget) {
                    setDraft((c) => ({ ...c, entityIds: [id] }));
                    return;
                  }
                  const current = draft.entityIds || [];
                  const next = current.includes(id)
                    ? current.filter((x) => x !== id)
                    : [...current, id];
                  setDraft((c) => ({ ...c, entityIds: next }));
                }}
                onRemove={(id) =>
                  setDraft((current) => ({
                    ...current,
                    entityIds: (current.entityIds || []).filter(
                      (entityId) => entityId.toLowerCase() !== id.toLowerCase(),
                    ),
                  }))
                }
              />
            )}

            {widget.type === "ha_media_player" && (
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                  Media Options
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((c) => ({
                        ...c,
                        haMediaShowArtwork: c.haMediaShowArtwork === false,
                      }))
                    }
                    className={appearanceButtonClass(draft.haMediaShowArtwork !== false)}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.haMediaShowArtwork !== false
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">Album Art</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((c) => ({
                        ...c,
                        haMediaShowVolume: c.haMediaShowVolume === false,
                      }))
                    }
                    className={appearanceButtonClass(draft.haMediaShowVolume !== false)}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.haMediaShowVolume !== false
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">Volume</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((c) => ({
                        ...c,
                        haMediaShowSourceSelect: c.haMediaShowSourceSelect === false,
                      }))
                    }
                    className={appearanceButtonClass(draft.haMediaShowSourceSelect !== false)}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.haMediaShowSourceSelect !== false
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">Sources</span>
                  </button>
                </div>
              </div>
            )}

            {widget.type === "ha_camera" && (
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                  Camera Options
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((c) => ({
                      ...c,
                      haCameraChromeHidden: c.haCameraChromeHidden !== true,
                    }))
                  }
                  className={appearanceButtonClass(draft.haCameraChromeHidden === true)}
                >
                  <div
                    className={`h-2 w-2 rounded-full ${
                      draft.haCameraChromeHidden === true
                        ? "bg-[var(--ether-primary)]"
                        : "border border-current bg-transparent"
                    }`}
                  />
                  <span className="text-xs font-medium">Clean Feed</span>
                </button>
              </div>
            )}

            {widget.type === "ha_printer" && (
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                  Printer Options
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((c) => ({
                      ...c,
                      haPrinterShowCamera: c.haPrinterShowCamera === false,
                    }))
                  }
                  className={appearanceButtonClass(draft.haPrinterShowCamera !== false)}
                >
                  <div
                    className={`h-2 w-2 rounded-full ${
                      draft.haPrinterShowCamera !== false
                        ? "bg-[var(--ether-primary)]"
                        : "border border-current bg-transparent"
                    }`}
                  />
                  <span className="text-xs font-medium">Camera Preview</span>
                </button>
              </div>
            )}

            {widget.type === "ha_light" && (
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ether-on-surface-variant)]">
                  Control Options
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() =>
                      setDraft((c) => ({
                        ...c,
                        lightShowBrightness:
                          (c.lightShowBrightness ?? true) === false,
                      }))
                    }
                    className={appearanceButtonClass(
                      draft.lightShowBrightness !== false,
                    )}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.lightShowBrightness !== false
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">
                      Brightness Control
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      setDraft((c) => ({
                        ...c,
                        lightShowColor: (c.lightShowColor ?? true) === false,
                      }))
                    }
                    className={appearanceButtonClass(
                      draft.lightShowColor !== false,
                    )}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.lightShowColor !== false
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">Color Presets</span>
                  </button>
                  <button
                    onClick={() =>
                      setDraft((c) => ({
                        ...c,
                        lightShowTemp: (c.lightShowTemp ?? true) === false,
                      }))
                    }
                    className={appearanceButtonClass(
                      draft.lightShowTemp !== false,
                    )}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        draft.lightShowTemp !== false
                          ? "bg-[var(--ether-primary)]"
                          : "border border-current bg-transparent"
                      }`}
                    />
                    <span className="text-xs font-medium">
                      Color Temperature
                    </span>
                  </button>
                </div>
              </div>
            )}

            {widget.type === "ha_entities" && (
              <>
                <TinyInput
                  label="Filter by type (optional)"
                  value={String(draft.domain || "")}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, domain: value }))
                  }
                  placeholder="light, sensor, lock"
                />
                {haEntityDomainOptions.length > 0 && (
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
                        Entity type
                      </span>
                      {parseHaDomainFilter(draft.domain).length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((current) => ({ ...current, domain: "" }))
                          }
                          className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ether-primary)]"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {haEntityDomainOptions.map(({ domain, count }) => {
                        const selectedDomains = parseHaDomainFilter(draft.domain);
                        const active = selectedDomains.includes(domain);
                        return (
                          <button
                            key={domain}
                            type="button"
                            onClick={() =>
                              setDraft((current) => {
                                const currentDomains = parseHaDomainFilter(current.domain);
                                const nextDomains = currentDomains.includes(domain)
                                  ? currentDomains.filter((item) => item !== domain)
                                  : [...currentDomains, domain];
                                return {
                                  ...current,
                                  domain: nextDomains.join(", "),
                                };
                              })
                            }
                            className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
                              active
                                ? "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/12 text-[var(--ether-primary)]"
                                : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
                            }`}
                          >
                            {formatHaDomainLabel(domain)} {count}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {haRoomOptions.length > 0 && (
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
                        Rooms
                      </span>
                      {selectedHaRooms.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((current) => ({ ...current, haRoomNames: [] }))
                          }
                          className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ether-primary)]"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {haRoomOptions.map(({ room, count }) => {
                        const active = selectedHaRooms
                          .map(normalizeHaRoomLabel)
                          .includes(normalizeHaRoomLabel(room));
                        return (
                          <button
                            key={room}
                            type="button"
                            onClick={() =>
                              setDraft((current) => {
                                const currentRooms = parseHaRoomNames(current.haRoomNames);
                                const normalizedRoom = normalizeHaRoomLabel(room);
                                const nextRooms = currentRooms
                                  .map(normalizeHaRoomLabel)
                                  .includes(normalizedRoom)
                                  ? currentRooms.filter(
                                      (item) => normalizeHaRoomLabel(item) !== normalizedRoom,
                                    )
                                  : [...currentRooms, room];
                                return {
                                  ...current,
                                  haRoomNames: nextRooms,
                                };
                              })
                            }
                            className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
                              active
                                ? "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/12 text-[var(--ether-primary)]"
                                : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
                            }`}
                          >
                            {room} {count}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <EntityPicker
                  label={`Visible Entities (${filteredEntities.length})`}
                  entities={filteredEntities}
                  selectedEntityLookup={entities}
                  selected={draft.entityIds || []}
                  onToggle={(id) => {
                    const current = draft.entityIds || [];
                    const next = current.includes(id)
                      ? current.filter((x) => x !== id)
                      : [...current, id];
                    setDraft((c) => ({ ...c, entityIds: next }));
                  }}
                  onRemove={(id) =>
                    setDraft((current) => ({
                      ...current,
                      entityIds: (current.entityIds || []).filter(
                        (entityId) => entityId.toLowerCase() !== id.toLowerCase(),
                      ),
                    }))
                  }
                />
              </>
            )}
          </div>

          <div className="mt-4">
            <WidgetInteractivityOverrides
              widgetType={widget.type}
              config={draft}
              onConfigChange={(updater) => setDraft(updater)}
            />
          </div>

          {(() => {
            // "Clear trend" affordance for widgets that persist sparkline
            // samples via `dashboardSparklineStore`. Key derivation
            // mirrors what each widget writes on refresh (task 10.2).
            let sparklineKeys: string[] = [];
            if (widget.type === 'stock') {
              const symbols = String(draft.symbols || '')
                .split(',')
                .map((symbol) => symbol.trim().toUpperCase())
                .filter(Boolean);
              sparklineKeys = symbols.map((symbol) => `stock-${symbol}`);
            } else if (widget.type === 'air_quality') {
              sparklineKeys = ['aqi'];
            } else if (widget.type === 'ha_energy') {
              sparklineKeys = ['energy-total'];
            } else if (widget.type === 'weather') {
              sparklineKeys = ['temp'];
            }
            if (sparklineKeys.length === 0) return null;
            return (
              <div className="mt-3 flex items-center justify-end">
                <WidgetSparklineHistoryControl
                  widget={widget}
                  sparklineKeys={sparklineKeys}
                />
              </div>
            );
          })()}

          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-full bg-[var(--ether-control-bg)] px-4 py-2 text-sm font-semibold text-[var(--ether-on-surface)] transition hover:bg-[var(--ether-control-hover)]"
            >
              Cancel
            </button>
            <button
              onClick={saveDraft}
              className="rounded-full bg-[var(--ether-control-active-bg)] px-4 py-2 text-sm font-semibold text-[var(--ether-control-active-text)]"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
};


export default React.memo(WidgetSettingsModal);
