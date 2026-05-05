import type { ChoreItem } from './cardTypes';
import { randomId } from '../utils/randomId';

const CHORES_KEY = 'curio_chores';
const TASKS_KEY = 'curio_tasks';
export const CHORES_EVENT = 'curio:chores-changed';
export const TASKS_EVENT = 'curio:tasks-changed';

type LocalTaskStore = {
    key: string;
    eventName: string;
    idPrefix: string;
};

const CHORES_STORE: LocalTaskStore = {
    key: CHORES_KEY,
    eventName: CHORES_EVENT,
    idPrefix: 'chore',
};

const TASKS_STORE: LocalTaskStore = {
    key: TASKS_KEY,
    eventName: TASKS_EVENT,
    idPrefix: 'task',
};

function read(store: LocalTaskStore): ChoreItem[] {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(store.key) || '[]'); } catch { return []; }
}

function write(store: LocalTaskStore, chores: ChoreItem[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(store.key, JSON.stringify(chores));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent(store.eventName));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
}

function addItem(store: LocalTaskStore, name: string, assignee?: string, priority: ChoreItem['priority'] = 'medium', recurring?: ChoreItem['recurring']): ChoreItem {
    const chore: ChoreItem = { id: `${store.idPrefix}_${randomId()}`, name, assignee, priority, recurring, completed: false };
    write(store, [...read(store), chore]);
    return chore;
}

function completeItem(store: LocalTaskStore, id: string): void {
    write(store, read(store).map(c => c.id === id ? { ...c, completed: true, lastCompleted: new Date().toISOString() } : c));
}

function reopenItem(store: LocalTaskStore, id: string): void {
    write(store, read(store).map(c => c.id === id ? { ...c, completed: false } : c));
}

function updateItem(store: LocalTaskStore, id: string, patch: Partial<Omit<ChoreItem, 'id'>>): void {
    write(store, read(store).map(c => c.id === id ? { ...c, ...patch } : c));
}

function deleteItem(store: LocalTaskStore, id: string): void {
    write(store, read(store).filter(c => c.id !== id));
}

function resetCompletedItems(store: LocalTaskStore): void {
    write(store, read(store).map(c => ({ ...c, completed: false })));
}

export function getChores(): ChoreItem[] { return read(CHORES_STORE); }
export function getTasks(): ChoreItem[] { return read(TASKS_STORE); }

/**
 * Replace the stored tasks array with `tasks` verbatim.
 *
 * Fires the normal storage events so list consumers (TasksWidget,
 * Routines, etc.) refresh. Used by drag-reorder wiring to persist a
 * user-chosen order without mutating any single item.
 */
export function setTasks(tasks: ChoreItem[]): void { write(TASKS_STORE, tasks); }

/**
 * Replace the stored chores array with `chores` verbatim.
 *
 * Fires the normal storage events. Used by drag-reorder wiring to
 * persist a user-chosen order without mutating any single item.
 */
export function setChores(chores: ChoreItem[]): void { write(CHORES_STORE, chores); }

export function addChore(name: string, assignee?: string, priority: ChoreItem['priority'] = 'medium', recurring?: ChoreItem['recurring']): ChoreItem {
    return addItem(CHORES_STORE, name, assignee, priority, recurring);
}

export function addTask(name: string, assignee?: string, priority: ChoreItem['priority'] = 'medium', recurring?: ChoreItem['recurring']): ChoreItem {
    return addItem(TASKS_STORE, name, assignee, priority, recurring);
}

export function completeChore(id: string): void { completeItem(CHORES_STORE, id); }
export function completeTask(id: string): void { completeItem(TASKS_STORE, id); }

export function reopenChore(id: string): void { reopenItem(CHORES_STORE, id); }
export function reopenTask(id: string): void { reopenItem(TASKS_STORE, id); }

export function updateChore(id: string, patch: Partial<Omit<ChoreItem, 'id'>>): void { updateItem(CHORES_STORE, id, patch); }
export function updateTask(id: string, patch: Partial<Omit<ChoreItem, 'id'>>): void { updateItem(TASKS_STORE, id, patch); }

export function setChorePriority(id: string, priority: ChoreItem['priority']): void { updateChore(id, { priority }); }
export function setTaskPriority(id: string, priority: ChoreItem['priority']): void { updateTask(id, { priority }); }

export function deleteChore(id: string): void { deleteItem(CHORES_STORE, id); }
export function deleteTask(id: string): void { deleteItem(TASKS_STORE, id); }

export function resetCompletedChores(): void { resetCompletedItems(CHORES_STORE); }
export function resetCompletedTasks(): void { resetCompletedItems(TASKS_STORE); }
