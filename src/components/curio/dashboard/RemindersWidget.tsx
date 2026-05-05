import React, { useCallback, useMemo, useState } from 'react';
import { Check, CheckCircle2, Edit3, Plus, Trash2 } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDragReorder } from '../../../hooks/useDragReorder';
import { useSwipeableRowActions } from '../../../hooks/useSwipeableRowActions';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import { setDashboardDragPayload } from '../../../services/dashboardIntents';
import { dashboardToastBus } from '../../../services/dashboardToastBus';
import {
  deleteReminder,
  getReminders,
  markReminderDone,
  reopenReminder,
  saveReminder,
  setReminders,
  type SavedReminder,
  updateReminder,
} from '../../../services/notesPersistence';
import { useSettingsStorageValue } from '../../../utils/settingsStorage';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import { parseReminderQuickAdd } from '../../../services/quickAddParsers/reminderParser';
import WidgetShell from './WidgetShell';
import { DragReorderHandle, InlineQuickAdd, WidgetBody, WidgetText } from './widgetPrimitives';
import { IconBell } from './widgetIcons';

const REMINDER_TOAST_ID_PREFIX = 'reminders-widget-row-';

/**
 * Row wrapper that adds horizontal swipe + keyboard commit handling to
 * a single reminder row. Hooks must run in stable scope (one per row),
 * which is why this is its own component instead of inline JSX inside
 * the list's `.map()`.
 */
interface ReminderRowProps {
  children: React.ReactNode;
  className: string;
  swipeEnabled: boolean;
  onPrimaryCommit: () => void;
  onSecondaryCommit: () => void;
  ariaLabel: string;
  'data-dragging'?: 'true';
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
}

const ReminderRow: React.FC<ReminderRowProps> = ({
  children,
  className,
  swipeEnabled,
  onPrimaryCommit,
  onSecondaryCommit,
  ariaLabel,
  'data-dragging': dataDragging,
  draggable,
  onDragStart,
}) => {
  const { rowProps, visuals } = useSwipeableRowActions({
    onPrimaryCommit,
    onSecondaryCommit,
    swipeEnabled,
  });
  const translated = visuals.isSwiping && visuals.translateX !== 0;
  return (
    <div
      {...rowProps}
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      data-dragging={dataDragging}
      data-swipe-committed={visuals.isPastCommitThreshold ? 'true' : undefined}
      draggable={draggable}
      onDragStart={onDragStart}
      className={`relative ${className}`}
      style={{
        ...rowProps.style,
        transform: translated
          ? `translate3d(${visuals.translateX}px, 0, 0)`
          : undefined,
        transition:
          visuals.isSwiping || !visuals.motionProfile.shouldAnimate
            ? 'none'
            : 'transform 180ms ease-out',
      }}
    >
      {visuals.washOpacity > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg"
          style={{
            background:
              visuals.direction >= 0
                ? 'rgba(16, 185, 129, 0.55)'
                : 'rgba(239, 68, 68, 0.55)',
            opacity: visuals.washOpacity,
          }}
        />
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
};

const RemindersWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const [draft, setDraft] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [showFinished, setShowFinished] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingDate, setEditingDate] = useState('');
  const [editingTime, setEditingTime] = useState('');
  const storedReminders = useSettingsStorageValue<SavedReminder[]>(getReminders, []);

  const boardInteractivity = useDashboardInteractivitySettings();
  const dragReorderEnabled = effectiveToggle(
    'dragReorderEnabled',
    boardInteractivity,
    widget.config,
  );
  const swipeGesturesEnabled = effectiveToggle(
    'swipeGesturesEnabled',
    boardInteractivity,
    widget.config,
  );
  const undoToastsEnabled = boardInteractivity.undoToastsEnabled;
  const inlineQuickAddEnabled = effectiveToggle(
    'inlineQuickAddEnabled',
    boardInteractivity,
    widget.config,
  );

  const commitReminderAcknowledge = useCallback(
    (reminder: SavedReminder) => {
      if (reminder.done) return;
      markReminderDone(reminder.id);
      if (!undoToastsEnabled) return;
      dashboardToastBus.show({
        id: `${REMINDER_TOAST_ID_PREFIX}ack-${reminder.id}`,
        label: 'Reminder acknowledged',
        tone: 'success',
        onUndo: () => {
          reopenReminder(reminder.id);
        },
      });
    },
    [undoToastsEnabled],
  );

  const commitReminderSnooze = useCallback(
    (reminder: SavedReminder) => {
      // Snapshot the reminder and its position so undo can restore it
      // verbatim at its prior index.
      const snapshot = { ...reminder };
      const all = getReminders();
      const index = all.findIndex((item) => item.id === reminder.id);
      deleteReminder(reminder.id);
      if (!undoToastsEnabled) return;
      dashboardToastBus.show({
        id: `${REMINDER_TOAST_ID_PREFIX}snooze-${reminder.id}`,
        label: 'Reminder snoozed',
        tone: 'danger',
        onUndo: () => {
          const current = getReminders();
          if (current.some((item) => item.id === snapshot.id)) return;
          const restored = [...current];
          const insertAt = index >= 0 && index <= restored.length ? index : restored.length;
          restored.splice(insertAt, 0, snapshot);
          setReminders(restored);
        },
      });
    },
    [undoToastsEnabled],
  );

  const maxItems = (() => {
    if (size.pixelHeight < 320) return 1;
    if (size.pixelHeight < 460) return 2;
    switch (size.sizeClass) {
      case 'tiny':   return 0; // just count
      case 'small':  return size.isTall ? 4 : 2;
      case 'medium': return size.isTall ? 6 : 4;
      case 'large':  return 8;
      case 'xlarge': return 12;
    }
  })();
  const activeReminders = useMemo(
    () => storedReminders.filter((item) => !item.done),
    [storedReminders],
  );
  const finishedReminders = useMemo(
    () => storedReminders.filter((item) => item.done),
    [storedReminders],
  );
  const reminders = showFinished ? finishedReminders : activeReminders;

  const handleReorderVisibleReminders = (nextVisible: SavedReminder[]) => {
    // The displayed list is a filtered subset (active OR finished).
    // Preserve positions of the unseen subset by rewriting only the
    // slots the visible subset occupies in the full stored list.
    const visibleIds = new Set(nextVisible.map((item) => item.id));
    const queue = [...nextVisible];
    const nextStored = storedReminders.map((item) => {
      if (!visibleIds.has(item.id)) return item;
      return queue.shift() || item;
    });
    setReminders(nextStored);
  };

  const {
    getRowBindings,
    announcement: dragAnnouncement,
  } = useDragReorder<SavedReminder>(
    reminders,
    handleReorderVisibleReminders,
    {
      keyExtractor: (item) => item.id,
      enabled: dragReorderEnabled,
    },
  );

  const formatReminderTime = (date: string, time: string) => {
    if (!date) return 'Soon';
    const dueDateTime = `${date}T${time || '00:00'}`;
    const parsed = new Date(dueDateTime);
    if (Number.isNaN(parsed.getTime())) return time ? `${date} ${time}` : date;
    return parsed.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: time ? 'numeric' : undefined,
      minute: time ? '2-digit' : undefined,
    });
  };

  const makeDueDateTime = (date: string, time: string) =>
    date ? `${date}T${time || '00:00'}` : undefined;

  const createReminder = () => {
    const text = draft.trim();
    if (!text) return;
    saveReminder(text, formatReminderTime(draftDate, draftTime), makeDueDateTime(draftDate, draftTime));
    setDraft('');
    setDraftDate('');
    setDraftTime('');
  };

  const handleQuickAddReminderSubmit = useCallback(
    (parsed: { title: string; remindAt: number }) => {
      const due = new Date(parsed.remindAt);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const date = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
      const time = `${pad(due.getHours())}:${pad(due.getMinutes())}`;
      saveReminder(
        parsed.title,
        formatReminderTime(date, time),
        makeDueDateTime(date, time),
      );
    },
    [],
  );

  const beginEdit = (reminder: SavedReminder) => {
    const [date = '', time = ''] = (reminder.dueDateTime || '').split('T');
    setEditingId(reminder.id);
    setEditingText(reminder.text);
    setEditingDate(date);
    setEditingTime(time.slice(0, 5));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
    setEditingDate('');
    setEditingTime('');
  };

  const saveEdit = () => {
    if (!editingId) return;
    const text = editingText.trim();
    if (!text) {
      cancelEdit();
      return;
    }
    updateReminder(editingId, {
      text,
      dueDateTime: makeDueDateTime(editingDate, editingTime),
      timeDescription: formatReminderTime(editingDate, editingTime),
    });
    cancelEdit();
  };

  const toggleReminderDone = (reminder: SavedReminder) => {
    if (reminder.done) {
      reopenReminder(reminder.id);
    } else {
      markReminderDone(reminder.id);
    }
  };

  // Tiny: count only
  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare>
        <div className="flex flex-1 flex-col items-center justify-center">
          <span className={`text-4xl font-bold tabular-nums ${theme.onSurface}`}>
            {activeReminders.length}
          </span>
          <WidgetText variant="label" tone="muted" align="center">
            Reminder{activeReminders.length === 1 ? '' : 's'}
          </WidgetText>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title="Reminders"
      icon={<IconBell />}
      accent="rose"
      rightSlot={
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold ${theme.muted}`}>
            {showFinished ? `${finishedReminders.length} done` : `${activeReminders.length} active`}
          </span>
          <button
            type="button"
            onClick={() => setShowFinished((value) => !value)}
            className={`dashboard-widget-control-button ${
              showFinished ? 'dashboard-widget-control-button-active' : ''
            }`}
            aria-label={showFinished ? 'Show active reminders' : 'Show finished reminders'}
          >
            <CheckCircle2 size={13} />
          </button>
        </div>
      }
    >
      <div role="status" aria-live="polite" className="sr-only">
        {dragAnnouncement}
      </div>
      <div className="mb-2 flex gap-2">
        {inlineQuickAddEnabled ? (
          <div className="flex-1">
            <InlineQuickAdd
              placeholder='Add reminder (e.g. "Call Sam tomorrow 9am")'
              parser={(input) => parseReminderQuickAdd(input)}
              onSubmit={handleQuickAddReminderSubmit}
              ariaLabel="Add reminder"
              compact
            />
          </div>
        ) : (
          <>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={async (event) => {
                event.stopPropagation();
                if (event.key === 'Enter' && draft.trim()) {
                  event.preventDefault();
                  createReminder();
                }
              }}
              placeholder="Add a reminder"
              className={`flex-1 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm outline-none ${theme.onSurface}`}
            />
            <button
              onClick={createReminder}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-[0_12px_28px_rgba(244,63,94,0.34)]"
              aria-label="Add reminder"
            >
              <Plus size={15} />
            </button>
          </>
        )}
      </div>
      {!inlineQuickAddEnabled && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <input
            type="date"
            value={draftDate}
            onChange={(event) => setDraftDate(event.target.value)}
            className={`rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-medium outline-none ${theme.onSurface}`}
            aria-label="New reminder date"
          />
          <input
            type="time"
            value={draftTime}
            onChange={(event) => setDraftTime(event.target.value)}
            className={`rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-medium outline-none ${theme.onSurface}`}
            aria-label="New reminder time"
          />
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className={`text-sm ${theme.muted}`}>
            {showFinished ? 'No finished reminders yet.' : 'No reminders right now.'}
          </p>
        </div>
      ) : (
        <WidgetBody gap="sm" scroll="y">
          {reminders.slice(0, Math.max(maxItems, 1)).map((reminder, index) => {
            const rowBindings = getRowBindings(index);
            return (
            <ReminderRow
              key={reminder.id}
              ariaLabel={`Reminder: ${reminder.text}`}
              data-dragging={rowBindings.isDragging ? 'true' : undefined}
              swipeEnabled={swipeGesturesEnabled && editingId !== reminder.id}
              onPrimaryCommit={() => commitReminderAcknowledge(reminder)}
              onSecondaryCommit={() => commitReminderSnooze(reminder)}
              draggable
              onDragStart={(event) => {
                setDashboardDragPayload(event.dataTransfer, {
                  kind: 'reminder',
                  sourceWidgetId: widget.id,
                  sourceWidgetType: 'reminders',
                  data: {
                    taskId: reminder.id,
                    title: reminder.text,
                    dueDateTime: reminder.dueDateTime || undefined,
                  },
                });
              }}
              className={`rounded-lg px-3 py-2 ${theme.surfaceContainerLow} data-[dragging=true]:ring-2 data-[dragging=true]:ring-rose-400/40`}
            >
              <div className="flex items-start gap-2">
                {dragReorderEnabled && (
                  <DragReorderHandle
                    bindings={rowBindings}
                    ariaLabel={`Reorder reminder ${reminder.text}`}
                    compact
                    className="mt-0.5"
                  />
                )}
                <button
                  onClick={() => toggleReminderDone(reminder)}
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rose-400/35 text-rose-300"
                  aria-label={`${reminder.done ? 'Reopen' : 'Complete'} reminder ${reminder.text}`}
                >
                  <Check size={13} />
                </button>
                <div className="min-w-0 flex-1">
                  {editingId === reminder.id ? (
                    <div className="space-y-2">
                      <input
                        value={editingText}
                        onChange={(event) => setEditingText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveEdit();
                          if (event.key === 'Escape') cancelEdit();
                        }}
                        className={`w-full rounded-xl border border-rose-400/25 bg-white/[0.06] px-3 py-2 text-sm outline-none ${theme.onSurface}`}
                        aria-label="Reminder text"
                        autoFocus
                      />
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <input
                          type="date"
                          value={editingDate}
                          onChange={(event) => setEditingDate(event.target.value)}
                          className={`min-w-0 rounded-xl border border-white/10 bg-white/[0.06] px-2 py-1.5 text-[11px] outline-none ${theme.onSurface}`}
                          aria-label="Reminder date"
                        />
                        <input
                          type="time"
                          value={editingTime}
                          onChange={(event) => setEditingTime(event.target.value)}
                          className={`min-w-0 rounded-xl border border-white/10 bg-white/[0.06] px-2 py-1.5 text-[11px] outline-none ${theme.onSurface}`}
                          aria-label="Reminder time"
                        />
                        <button
                          onClick={saveEdit}
                          className="rounded-xl bg-rose-500 px-3 py-1.5 text-[11px] font-bold text-white"
                          aria-label="Save reminder"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className={`truncate text-sm font-medium ${reminder.done ? `${theme.muted} line-through` : theme.onSurface}`}>
                        {reminder.text}
                      </p>
                      {reminder.timeDescription && (
                        <p className={`mt-0.5 text-[11px] font-medium ${theme.muted}`}>
                          {reminder.timeDescription}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {editingId !== reminder.id && (
                  <button
                    onClick={() => beginEdit(reminder)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${theme.surfaceContainer}`}
                    aria-label={`Edit reminder ${reminder.text}`}
                  >
                    <Edit3 size={13} />
                  </button>
                )}
                <button
                  onClick={() => {
                    deleteReminder(reminder.id);
                  }}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${theme.surfaceContainer}`}
                  aria-label="Delete reminder"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </ReminderRow>
            );
          })}
        </WidgetBody>
      )}
    </WidgetShell>
  );
};

export default RemindersWidget;
