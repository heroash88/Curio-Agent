import React, { useEffect, useRef, useState } from 'react';
import { Target, CheckCircle2, Circle, Flame, Plus, Trash2 } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDragReorder } from '../../../hooks/useDragReorder';
import { useWidgetAriaAnnouncer } from '../../../hooks/useWidgetAriaAnnouncer';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import type { HabitItem } from '../../../services/habitsPersistence';
import { getHabits, saveHabits, toggleHabit, addHabit, deleteHabit } from '../../../services/habitsPersistence';
import { useSettingsStorageValue } from '../../../utils/settingsStorage';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { DragReorderHandle, WidgetBody, WidgetCounter, WidgetEmptyState, WidgetSkeleton, WidgetText } from './widgetPrimitives';

const HabitsFocusedHeatmapLazy = React.lazy(() => import('./habits/HabitsFocusedHeatmap'));

const HabitsWidget: React.FC<{ widget: DashboardWidget; focused?: boolean }> = ({ widget, focused }) => {
  if (focused) {
    return (
      <React.Suspense fallback={<WidgetSkeleton variant="list" />}>
        <HabitsFocusedHeatmapLazy widget={widget} focused />
      </React.Suspense>
    );
  }

  return <HabitsWidgetCompact widget={widget} />;
};

const HabitsWidgetCompact: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const habits = useSettingsStorageValue<HabitItem[]>(getHabits, []);
  const [draft, setDraft] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const handleToggle = (id: string) => toggleHabit(id);
  const handleDelete = (id: string) => deleteHabit(id);

  const handleAdd = () => {
    if (!draft.trim()) return;
    addHabit(draft.trim());
    setDraft('');
    setShowAdd(false);
  };

  const completedCount = habits.filter(h => h.completedToday).length;
  const totalStreaks = habits.reduce((sum, habit) => sum + Math.max(0, habit.streak || 0), 0);
  const progress = habits.length > 0 ? (completedCount / habits.length) * 100 : 0;

  const boardInteractivity = useDashboardInteractivitySettings();
  const rollingEnabled = effectiveToggle(
    'rollingNumbersEnabled',
    boardInteractivity,
    widget.config,
  );
  const dragReorderEnabled = effectiveToggle(
    'dragReorderEnabled',
    boardInteractivity,
    widget.config,
  );
  const doubleClickEditEnabled = effectiveToggle(
    'doubleClickEditEnabled',
    boardInteractivity,
    widget.config,
  );
  // Note: HabitItem has no `goal` field in the persisted schema, so this
  // inline edit surface reinterprets Requirement 9.1's "Habits goal" as
  // the closest numeric per-habit field we do store: `streak`. Editing
  // the streak inline is a common pattern when users drift off-track and
  // want to correct the record without full recreation. If a `goal`
  // field is later added to HabitItem, this edit target should migrate.
  const [editingStreakId, setEditingStreakId] = useState<string | null>(null);
  const [streakDraft, setStreakDraft] = useState<string>('');
  const streakInputRef = useRef<HTMLInputElement | null>(null);
  const lastStreakTapRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (editingStreakId) {
      streakInputRef.current?.focus();
      streakInputRef.current?.select();
    }
  }, [editingStreakId]);
  const commitStreakEdit = () => {
    const id = editingStreakId;
    if (!id) return;
    const parsed = Number(streakDraft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditingStreakId(null);
      return;
    }
    const nextStreak = Math.max(0, Math.round(parsed));
    const current = getHabits();
    const next = current.map((h) =>
      h.id === id ? { ...h, streak: nextStreak } : h,
    );
    saveHabits(next);
    setEditingStreakId(null);
  };
  const {
    getRowBindings,
    announcement: dragAnnouncement,
  } = useDragReorder<HabitItem>(
    habits,
    (next) => saveHabits(next),
    {
      keyExtractor: (item) => item.id,
      enabled: dragReorderEnabled,
    },
  );

  useWidgetAriaAnnouncer(
    widget.id,
    habits.length > 0 ? `Habits: ${totalStreaks} total streaks` : '',
  );

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare accent="emerald" widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center">
            <span className={`text-3xl font-bold tabular-nums ${theme.onSurface}`}>{completedCount}/{habits.length}</span>
            <WidgetText variant="label" tone="muted" align="center">Done</WidgetText>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title="Daily Habits"
      icon={<Target size={14} />}
      accent="emerald"
      rightSlot={
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold tabular-nums ${theme.onSurfaceVariant}`}>
            {completedCount}/{habits.length}
          </span>
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className={`dashboard-widget-control-button ${
              showAdd ? 'dashboard-widget-control-button-active' : ''
            }`}
            aria-label={showAdd ? 'Close habit form' : 'Add habit'}
          >
            <Plus size={13} className={showAdd ? 'rotate-45' : ''} />
          </button>
        </div>
      }
    >
      <div className="flex h-full flex-col">
        <div role="status" aria-live="polite" className="sr-only">
          {dragAnnouncement}
        </div>
        {showAdd && (
          <div className="ether-widget-enter mb-4 flex gap-2 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-1">
            <input
              placeholder="New habit..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className={`min-w-0 flex-1 bg-transparent px-3 py-2 text-xs outline-none placeholder:text-[var(--ether-on-surface-variant)]/60 ${theme.onSurface}`}
            />
            <button
              onClick={handleAdd}
              className="bg-[var(--ether-emerald)] text-black px-4 rounded-xl text-[10px] font-bold"
            >
              ADD
            </button>
          </div>
        )}

        <WidgetBody
          data-testid="habits-widget-list"
          gap="md"
          scroll="y"
        >
          {habits.length === 0 ? (
            <WidgetEmptyState
              icon={<Target size={32} />}
              title="Build streaks"
            />
          ) : (
            habits.map((h, index) => {
              const rowBindings = getRowBindings(index);
              return (
              <div
                key={h.id}
                data-dragging={rowBindings.isDragging ? 'true' : undefined}
                className={`group flex items-center gap-3 p-3 rounded-2xl border border-[var(--ether-glass-border)] transition-all data-[dragging=true]:border-[var(--ether-primary)]/50 data-[dragging=true]:shadow-lg ${
                    h.completedToday 
                        ? 'bg-[var(--ether-emerald)]/10 border-[var(--ether-emerald)]/20' 
                        : 'bg-[var(--ether-surface-container)] hover:bg-[var(--ether-surface-container-high)]'
                }`}
              >
                {dragReorderEnabled && (
                  <DragReorderHandle
                    bindings={rowBindings}
                    ariaLabel={`Reorder habit ${h.name}`}
                    compact
                  />
                )}
                {/* TODO: [Habits tap-to-toggle burst] Add a subtle burst animation on this toggle
                   button when the habit is completed. Skip under reduced motion. The streak count
                   already animates upward via WidgetCounter (Task 10.1). */}
                <button
                  onClick={() => handleToggle(h.id)}
                  className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                      h.completedToday 
                        ? 'text-[var(--ether-emerald)]' 
                        : 'border border-[var(--ether-glass-border)] text-[var(--ether-on-surface-variant)] opacity-55 hover:border-[var(--ether-on-surface-variant)]/30 hover:opacity-80'
                  }`}
                  aria-label={`${h.completedToday ? 'Mark habit incomplete' : 'Complete habit'} ${h.name}`}
                >
                  {h.completedToday ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                </button>
                
                <div className="min-w-0 flex-1">
                  <div className={`text-[13px] font-bold truncate ${h.completedToday ? theme.onSurface : theme.onSurfaceVariant}`}>
                    {h.name}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Flame size={10} className={h.streak > 0 ? 'text-orange-400' : 'text-[var(--ether-on-surface-variant)] opacity-45'} />
                    {doubleClickEditEnabled && editingStreakId === h.id ? (
                      <input
                        ref={streakInputRef}
                        type="number"
                        min={0}
                        value={streakDraft}
                        aria-label={`Edit ${h.name} streak`}
                        onChange={(event) => setStreakDraft(event.target.value)}
                        onBlur={commitStreakEdit}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitStreakEdit();
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            setEditingStreakId(null);
                          }
                        }}
                        className="w-16 rounded-md border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)] px-1 py-0.5 text-[10px] font-bold text-[var(--ether-on-surface)] outline-none focus:border-[var(--ether-primary)]/45"
                      />
                    ) : (
                      <span
                        className={`text-[10px] font-bold tabular-nums text-[var(--ether-on-surface-variant)] opacity-75 ${doubleClickEditEnabled ? 'cursor-pointer rounded px-0.5 hover:bg-[var(--ether-control-hover)]' : ''}`}
                        onDoubleClick={
                          doubleClickEditEnabled
                            ? (event) => {
                                event.stopPropagation();
                                setStreakDraft(String(h.streak));
                                setEditingStreakId(h.id);
                              }
                            : undefined
                        }
                        onPointerUp={
                          doubleClickEditEnabled
                            ? (event) => {
                                if (event.pointerType !== 'touch') return;
                                const now = Date.now();
                                const last = lastStreakTapRef.current.get(h.id) || 0;
                                if (last > 0 && now - last <= 320) {
                                  event.stopPropagation();
                                  lastStreakTapRef.current.set(h.id, 0);
                                  setStreakDraft(String(h.streak));
                                  setEditingStreakId(h.id);
                                  return;
                                }
                                lastStreakTapRef.current.set(h.id, now);
                              }
                            : undefined
                        }
                        aria-label={
                          doubleClickEditEnabled
                            ? `${h.streak} day streak. Double-click to edit.`
                            : undefined
                        }
                      >
                        {rollingEnabled ? (
                          <WidgetCounter
                            value={h.streak}
                            ariaLabel={`${h.name} streak ${h.streak}`}
                            format={(n) => `${n} day streak`}
                          />
                        ) : (
                          <>{h.streak} day streak</>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(h.id)}
                  className="h-7 w-7 flex shrink-0 items-center justify-center rounded-lg text-[var(--ether-error)]/80 hover:bg-[var(--ether-error)]/10 hover:text-[var(--ether-error)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ether-error)]/35 transition-all"
                  aria-label={`Delete habit ${h.name}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              );
            })
          )}
        </WidgetBody>

        {/* ── Progress Footer ── */}
        <div className="mt-4 border-t border-[var(--ether-glass-border)] pt-4">
            <div className={`mb-1.5 flex justify-between ${theme.onSurfaceVariant}`}>
                <WidgetText variant="label" tone="muted">Daily Discipline</WidgetText>
                <WidgetText variant="label" tone="muted">{Math.round(progress)}%</WidgetText>
            </div>
            <div className="mb-1.5">
                <WidgetText variant="label" tone="muted">
                    {totalStreaks} total streak{totalStreaks === 1 ? '' : 's'}
                </WidgetText>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ether-control-bg)]">
                <div 
                    className="h-full bg-[var(--ether-emerald)] transition-all duration-500"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
      </div>
    </WidgetShell>
  );
};

export default HabitsWidget;
