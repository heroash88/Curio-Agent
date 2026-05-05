import React from "react";
import type {
  CardComponentProps,
  CalendarCardData,
} from "../../services/cardTypes";
import { useCardTheme } from "../../hooks/useCardTheme";

const ACCENT_COLORS = [
  "bg-sky-400",
  "bg-violet-400",
  "bg-[#00B2FF]",
  "bg-amber-400",
  "bg-rose-400",
];

const MODE_ICONS: Record<string, string> = {
  view: "📅",
  created: "✅",
  updated: "✏️",
  deleted: "🗑️",
};

const MODE_TITLES: Record<string, string> = {
  view: "Upcoming Events",
  created: "Event Created",
  updated: "Event Updated",
  deleted: "Event Deleted",
};

const CalendarCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const data = card.data as unknown as CalendarCardData;
  const cardWidthClass =
    "w-[min(30rem,calc(100vw-1.5rem))] min-w-0 max-w-[480px]";
  const events = data.events || [];
  const mode = data.mode || "view";
  const icon = MODE_ICONS[mode] || "📅";
  const heading = MODE_TITLES[mode] || "Calendar";

  return (
    <div className={`card-glass ${cardWidthClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500/20 text-sky-400">
            <span className="text-lg">{icon}</span>
          </div>
          <div>
            <p className="text-sm font-bold font-headline">{heading}</p>
            {data.date && (
              <p className={`text-[10px] font-medium ${t.faint}`}>
                {data.date}
              </p>
            )}
          </div>
        </div>
        {mode === "view" && (
          <span
            className={`inline-flex items-center rounded-full ${t.panel} border ${t.panelBorder} px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${t.muted}`}
          >
            {events.length} event{events.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Status message for create/update/delete */}
      {data.message && (
        <div className={`mb-3 rounded-xl ${t.panel} p-3 text-center`}>
          <p className={`text-sm font-medium ${t.muted}`}>{data.message}</p>
        </div>
      )}

      {/* Event list */}
      {mode === "view" && events.length === 0 && (
        <p className={`text-sm ${t.faint} italic text-center py-4`}>
          No upcoming events
        </p>
      )}

      {events.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {events.map((evt, i) => (
            <div
              key={evt.id || i}
              className={`flex items-start gap-3 rounded-xl ${t.panel} p-3`}
            >
              <div
                className={`w-1 self-stretch rounded-full ${ACCENT_COLORS[i % ACCENT_COLORS.length]} shrink-0`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">
                  {evt.title}
                </p>
                <p className={`text-[11px] font-medium ${t.muted} mt-0.5`}>
                  {evt.allDay ? "All day" : evt.startTime}
                  {evt.endTime && !evt.allDay ? ` -- ${evt.endTime}` : ""}
                </p>
                {evt.location && (
                  <p className={`text-[10px] ${t.faint} mt-0.5 truncate`}>
                    <span className="mr-1">📍</span>
                    {evt.location}
                  </p>
                )}
                {evt.description && (
                  <p className={`text-[10px] ${t.faint} mt-0.5 line-clamp-2`}>
                    {evt.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CalendarCard;
