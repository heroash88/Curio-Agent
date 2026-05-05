import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Trash2, Upload } from "lucide-react";

import {
  getICalCalendarSources,
  importICalCalendarSource,
  removeICalCalendarSource,
  subscribeICalCalendarSources,
  type ICalCalendarSource,
} from "../../../services/icalCalendarApi";

interface ICalCalendarSettingsProps {
  selectedSourceId?: string;
  onSelectedSourceIdChange: (sourceId: string) => void;
  variant?: "ether" | "light";
}

const sourceLabel = (source: ICalCalendarSource) =>
  `${source.name} (${source.eventCount})`;

const ICalCalendarSettings: React.FC<ICalCalendarSettingsProps> = ({
  selectedSourceId = "all",
  onSelectedSourceIdChange,
  variant = "ether",
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [sources, setSources] = useState<ICalCalendarSource[]>(() =>
    getICalCalendarSources(),
  );
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const refresh = () => setSources(getICalCalendarSources());
    return subscribeICalCalendarSources(refresh);
  }, []);

  const isLight = variant === "light";
  const panelClass = isLight
    ? "rounded-[1.25rem] border border-slate-200/50 bg-white/60 backdrop-blur-md p-4 shadow-sm"
    : "rounded-[1.25rem] border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)]/80 backdrop-blur-md p-4";
  const mutedClass = isLight
    ? "text-slate-500"
    : "text-[var(--ether-on-surface-variant)]";
  const titleClass = isLight ? "text-slate-800" : "text-[var(--ether-on-surface)]";
  const choiceClass = (active: boolean) =>
    `relative rounded-2xl border px-3 py-3 text-left text-xs font-semibold transition-all overflow-hidden ${
      active
        ? isLight
          ? "border-sky-300/50 bg-sky-50/80 text-sky-700 shadow-sm"
          : "border-[var(--ether-primary)]/40 bg-[var(--ether-primary)]/10 text-[var(--ether-on-surface)] shadow-sm"
        : isLight
          ? "border-slate-200/50 bg-white/80 text-slate-600 hover:bg-white hover:shadow-sm"
          : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]"
    }`;
  const actionClass = isLight
    ? "inline-flex items-center gap-2 rounded-xl border border-slate-200/50 bg-white/80 px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-slate-700 transition hover:bg-white hover:shadow-sm"
    : "inline-flex items-center gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:shadow-sm";

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setStatus("");

    try {
      const content = await file.text();
      const source = importICalCalendarSource({
        name: file.name,
        content,
      });
      setSources(getICalCalendarSources());
      onSelectedSourceIdChange(source.id);
      setStatus(`Imported ${sourceLabel(source)}.`);
    } catch (importError) {
      setError((importError as Error).message || "Could not import that iCal file.");
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const handleRemove = (sourceId: string) => {
    removeICalCalendarSource(sourceId);
    const nextSources = getICalCalendarSources();
    setSources(nextSources);
    if (selectedSourceId === sourceId) {
      onSelectedSourceIdChange("all");
    }
  };

  return (
    <div className={panelClass}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${mutedClass}`}>
            iCal calendars
          </div>
          <div className={`mt-1 text-sm font-semibold ${titleClass}`}>
            Imported .ics and .ical files
          </div>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={actionClass}
        >
          <Upload size={14} />
          Import
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".ics,.ical,text/calendar"
          className="hidden"
          onChange={(event) => void handleImport(event.target.files?.[0])}
        />
      </div>

      {sources.length > 0 ? (
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => onSelectedSourceIdChange("all")}
            className={choiceClass(selectedSourceId === "all" || !selectedSourceId)}
          >
            <div className="flex items-center gap-2 relative z-10">
              <CalendarDays size={14} />
              <span>All imported calendars</span>
            </div>
          </button>
          <AnimatePresence mode="popLayout">
            {sources.map((source) => (
              <motion.div 
                key={source.id} 
                layout
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-[1fr_auto] gap-2"
              >
                <button
                  type="button"
                  onClick={() => onSelectedSourceIdChange(source.id)}
                  className={choiceClass(selectedSourceId === source.id)}
                >
                  <div className="truncate relative z-10">{source.name}</div>
                  <div className={`mt-1 text-[9px] uppercase tracking-widest font-bold ${mutedClass} relative z-10`}>
                    {source.eventCount} events imported
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(source.id)}
                  className={`${actionClass} px-3 text-red-500 hover:text-red-700 hover:bg-red-50 hover:border-red-200/50`}
                  aria-label={`Remove ${source.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          className={`flex flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center ${mutedClass} ${
            isLight ? "border-slate-300 bg-slate-50/50" : "border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)]/50"
          }`}
        >
          <CalendarDays size={32} className="mb-3 opacity-40" />
          <div className="text-[11px] uppercase tracking-widest font-bold">No iCal Files</div>
          <div className="text-xs mt-1 opacity-70">Import an .ics or .ical file to make it available in calendar widgets.</div>
        </motion.div>
      )}

      {(status || error) && (
        <div
          className={`mt-3 text-xs font-medium ${
            error ? "text-rose-500" : isLight ? "text-sky-700" : "text-[var(--ether-primary)]"
          }`}
        >
          {error || status}
        </div>
      )}
    </div>
  );
};

export default ICalCalendarSettings;
