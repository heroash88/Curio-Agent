import React, { useCallback, useState } from 'react';
import { CheckCircle2, Circle, GripVertical, Calendar, Plus, FileText } from 'lucide-react';
import { WidgetBody, WidgetText, WidgetInlineError } from '../widgetPrimitives';
import type { DashboardWidget } from '../../../../services/dashboardTypes';
import { useWidgetPersistentState } from '../../../../hooks/useWidgetPersistentState';

interface TasksFocusedProps {
  widget: DashboardWidget;
  focused?: boolean;
}

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

interface TaskDetail {
  notes: string;
  dueDate: string;
  subtasks: Subtask[];
}

/**
 * TasksFocused — focused overlay editor for the Tasks widget.
 * Renders subtask list with checkboxes, notes textarea, due-date picker,
 * and drag across sections (active/completed).
 *
 * Requirements: 13.8
 */
const TasksFocused: React.FC<TasksFocusedProps> = ({ widget }) => {
  const [error] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useWidgetPersistentState<TaskDetail>(
    widget.id, 'task-detail', { notes: '', dueDate: '', subtasks: [] },
  );
  const [newSubtask, setNewSubtask] = useState('');

  const activeSubtasks = taskDetail.subtasks.filter((s) => !s.completed);
  const completedSubtasks = taskDetail.subtasks.filter((s) => s.completed);

  const toggleSubtask = useCallback((id: string) => {
    setTaskDetail((prev) => ({
      ...prev,
      subtasks: prev.subtasks.map((s) =>
        s.id === id ? { ...s, completed: !s.completed } : s,
      ),
    }));
  }, [setTaskDetail]);

  const addSubtask = useCallback(() => {
    if (!newSubtask.trim()) return;
    const subtask: Subtask = {
      id: `sub-${Date.now()}`,
      title: newSubtask.trim(),
      completed: false,
    };
    setTaskDetail((prev) => ({
      ...prev,
      subtasks: [...prev.subtasks, subtask],
    }));
    setNewSubtask('');
  }, [newSubtask, setTaskDetail]);

  const removeSubtask = useCallback((id: string) => {
    setTaskDetail((prev) => ({
      ...prev,
      subtasks: prev.subtasks.filter((s) => s.id !== id),
    }));
  }, [setTaskDetail]);

  const moveSubtask = useCallback((fromIdx: number, toIdx: number, fromCompleted: boolean) => {
    setTaskDetail((prev) => {
      const section = fromCompleted
        ? prev.subtasks.filter((s) => s.completed)
        : prev.subtasks.filter((s) => !s.completed);
      const other = fromCompleted
        ? prev.subtasks.filter((s) => !s.completed)
        : prev.subtasks.filter((s) => s.completed);

      const [moved] = section.splice(fromIdx, 1);
      section.splice(toIdx, 0, moved);

      return {
        ...prev,
        subtasks: fromCompleted ? [...other, ...section] : [...section, ...other],
      };
    });
  }, [setTaskDetail]);

  const updateNotes = useCallback((notes: string) => {
    setTaskDetail((prev) => ({ ...prev, notes }));
  }, [setTaskDetail]);

  const updateDueDate = useCallback((dueDate: string) => {
    setTaskDetail((prev) => ({ ...prev, dueDate }));
  }, [setTaskDetail]);

  if (error) {
    return <WidgetInlineError message={error} widgetId={widget.id} />;
  }

  return (
    <WidgetBody gap="md" scroll="y">
      <WidgetText variant="title">Task Details</WidgetText>

      {/* Due date picker */}
      <div className="flex items-center gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 px-3 py-2">
        <Calendar size={14} className="text-[var(--ether-on-surface-variant)]" />
        <WidgetText variant="label" tone="muted">Due date</WidgetText>
        <input
          type="date"
          value={taskDetail.dueDate}
          onChange={(e) => updateDueDate(e.target.value)}
          className="ml-auto rounded-md border border-[var(--ether-glass-border)] bg-transparent px-2 py-1 text-xs text-[var(--ether-on-surface)]"
        />
      </div>

      {/* Active subtasks */}
      <div className="space-y-1">
        <WidgetText variant="label" tone="muted">
          Subtasks ({activeSubtasks.length} active)
        </WidgetText>
        {activeSubtasks.map((subtask, idx) => (
          <div
            key={subtask.id}
            className="flex items-center gap-2 rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 px-3 py-2"
          >
            <button
              type="button"
              className="cursor-grab text-[var(--ether-on-surface-variant)]"
              aria-label={`Move ${subtask.title}`}
              onClick={() => { if (idx > 0) moveSubtask(idx, idx - 1, false); }}
            >
              <GripVertical size={12} />
            </button>
            <button
              type="button"
              onClick={() => toggleSubtask(subtask.id)}
              className="text-[var(--ether-on-surface-variant)] hover:text-emerald-400"
              aria-label={`Complete ${subtask.title}`}
            >
              <Circle size={16} />
            </button>
            <span className="flex-1 text-xs text-[var(--ether-on-surface)]">{subtask.title}</span>
            <button
              type="button"
              onClick={() => removeSubtask(subtask.id)}
              className="text-[10px] text-[var(--ether-on-surface-variant)] hover:text-[var(--ether-error)]"
              aria-label={`Remove ${subtask.title}`}
            >
              ×
            </button>
          </div>
        ))}

        {/* Add subtask input */}
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--ether-glass-border)] px-3 py-2">
          <Plus size={12} className="text-[var(--ether-on-surface-variant)]" />
          <input
            type="text"
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); }}
            placeholder="Add subtask..."
            className="flex-1 bg-transparent text-xs text-[var(--ether-on-surface)] placeholder:text-[var(--ether-on-surface-variant)]/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Completed subtasks */}
      {completedSubtasks.length > 0 && (
        <div className="space-y-1">
          <WidgetText variant="label" tone="muted">
            Completed ({completedSubtasks.length})
          </WidgetText>
          {completedSubtasks.map((subtask, idx) => (
            <div
              key={subtask.id}
              className="flex items-center gap-2 rounded-xl border border-[var(--ether-glass-border)]/50 bg-[var(--ether-surface-container-low)]/30 px-3 py-2 opacity-60"
            >
              <button
                type="button"
                className="cursor-grab text-[var(--ether-on-surface-variant)]"
                aria-label={`Move ${subtask.title}`}
                onClick={() => { if (idx > 0) moveSubtask(idx, idx - 1, true); }}
              >
                <GripVertical size={12} />
              </button>
              <button
                type="button"
                onClick={() => toggleSubtask(subtask.id)}
                className="text-emerald-400"
                aria-label={`Uncomplete ${subtask.title}`}
              >
                <CheckCircle2 size={16} />
              </button>
              <span className="flex-1 text-xs text-[var(--ether-on-surface)] line-through">{subtask.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes textarea */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <FileText size={12} className="text-[var(--ether-on-surface-variant)]" />
          <WidgetText variant="label" tone="muted">Notes</WidgetText>
        </div>
        <textarea
          value={taskDetail.notes}
          onChange={(e) => updateNotes(e.target.value)}
          placeholder="Add notes..."
          rows={4}
          className="w-full resize-none rounded-xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container-low)]/60 px-3 py-2.5 text-xs leading-relaxed text-[var(--ether-on-surface)] placeholder:text-[var(--ether-on-surface-variant)]/50 focus:border-[var(--ether-primary)]/40 focus:outline-none"
        />
      </div>
    </WidgetBody>
  );
};

export default TasksFocused;
