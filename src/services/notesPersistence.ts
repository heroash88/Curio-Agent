import { randomId } from '../utils/randomId';

const NOTES_KEY = 'curio_notes';
const REMINDERS_KEY = 'curio_reminders';
export const NOTES_EVENT = 'curio:notes-changed';
export const REMINDERS_EVENT = 'curio:reminders-changed';
const MAX_NOTES = 200;
const MAX_REMINDERS = 200;

const emitStorageEvent = (eventName: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent(eventName));
  window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export interface SavedNote {
  id: string;
  text: string;
  category: string;
  createdAt: number;
  pinned?: boolean;
}

export interface SavedReminder {
  id: string;
  text: string;
  timeDescription: string;
  dueDateTime?: string;
  createdAt: number;
  done: boolean;
}

export function saveNote(text: string, category = 'general'): SavedNote {
  const note: SavedNote = {
    id: randomId(),
    text,
    category,
    createdAt: Date.now(),
  };
  const notes = getNotes();
  notes.unshift(note);
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes.slice(0, MAX_NOTES))); } catch {}
  emitStorageEvent(NOTES_EVENT);
  return note;
}

export function getNotes(): SavedNote[] {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function deleteNote(id: string): void {
  const notes = getNotes().filter(n => n.id !== id);
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch {}
  emitStorageEvent(NOTES_EVENT);
}

export function updateNote(id: string, text: string): void {
  const notes = getNotes().map(n => n.id === id ? { ...n, text } : n);
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch {}
  emitStorageEvent(NOTES_EVENT);
}

export function togglePinNote(id: string): void {
  const notes = getNotes().map(n => n.id === id ? { ...n, pinned: !n.pinned } : n);
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch {}
  emitStorageEvent(NOTES_EVENT);
}

export function saveReminder(text: string, timeDescription = 'Soon', dueDateTime?: string): SavedReminder {
  const reminder: SavedReminder = {
    id: randomId(),
    text,
    timeDescription,
    dueDateTime,
    createdAt: Date.now(),
    done: false,
  };
  const reminders = getReminders();
  reminders.unshift(reminder);
  try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders.slice(0, MAX_REMINDERS))); } catch {}
  emitStorageEvent(REMINDERS_EVENT);
  return reminder;
}

export function getReminders(): SavedReminder[] {
  try {
    const raw = localStorage.getItem(REMINDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function deleteReminder(id: string): void {
  const reminders = getReminders().filter(r => r.id !== id);
  try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders)); } catch {}
  emitStorageEvent(REMINDERS_EVENT);
}

export function markReminderDone(id: string): void {
  const reminders = getReminders().map((reminder) =>
    reminder.id === id ? { ...reminder, done: true } : reminder,
  );
  try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders)); } catch {}
  emitStorageEvent(REMINDERS_EVENT);
}

export function reopenReminder(id: string): void {
  const reminders = getReminders().map((reminder) =>
    reminder.id === id ? { ...reminder, done: false } : reminder,
  );
  try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders)); } catch {}
  emitStorageEvent(REMINDERS_EVENT);
}

export function updateReminder(
  id: string,
  patch: Partial<Pick<SavedReminder, 'text' | 'timeDescription' | 'dueDateTime' | 'done'>>,
): void {
  const reminders = getReminders().map((reminder) =>
    reminder.id === id ? { ...reminder, ...patch } : reminder,
  );
  try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders)); } catch {}
  emitStorageEvent(REMINDERS_EVENT);
}

/**
 * Replace the stored reminders list with `reminders` verbatim.
 *
 * Fires the normal storage events so consumers refresh. Used by
 * drag-reorder wiring to persist a user-chosen order without mutating
 * any single item.
 */
export function setReminders(reminders: SavedReminder[]): void {
  try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders)); } catch {}
  emitStorageEvent(REMINDERS_EVENT);
}
