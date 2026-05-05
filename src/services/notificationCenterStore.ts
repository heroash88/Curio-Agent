import type { NotificationPriority, NotificationSource } from './proactiveTypes';
import { useSettingsStorageValue } from '../utils/settingsStorage';

const STORAGE_KEY = 'curio_notification_center_v1';
const MAX_ENTRIES = 48;

export type NotificationCenterSource = NotificationSource | 'routine';
export type NotificationCenterState =
  | 'queued'
  | 'delivered'
  | 'running'
  | 'completed'
  | 'failed';

export interface NotificationCenterEntry {
  id: string;
  source: NotificationCenterSource;
  title: string;
  message: string;
  priority: NotificationPriority;
  state: NotificationCenterState;
  createdAt: number;
  unread: boolean;
}

type NotificationCenterEntryInput = Partial<NotificationCenterEntry> &
  Pick<NotificationCenterEntry, 'id' | 'source' | 'title' | 'message'>;

const notifyStorageChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

const normalizeEntry = (
  entry: Partial<NotificationCenterEntry>,
  existing?: NotificationCenterEntry,
): NotificationCenterEntry => ({
  id: String(entry.id || existing?.id || `notification_${Date.now()}`),
  source: (entry.source || existing?.source || 'schedule') as NotificationCenterSource,
  title: String(entry.title || existing?.title || 'Notification'),
  message: String(entry.message || existing?.message || ''),
  priority: (entry.priority || existing?.priority || 'normal') as NotificationPriority,
  state: (entry.state || existing?.state || 'delivered') as NotificationCenterState,
  createdAt: Number.isFinite(entry.createdAt) ? Number(entry.createdAt) : existing?.createdAt || Date.now(),
  unread: entry.unread ?? existing?.unread ?? true,
});

const normalizeRemovedRoutineTitle = (title: string): string =>
  title.replace(/^[^A-Za-z0-9]+/, '').replace(/\s+/g, ' ').trim();

const isRemovedDefaultRoutineNotification = (entry: NotificationCenterEntry): boolean =>
  entry.source === 'routine' &&
  normalizeRemovedRoutineTitle(entry.title) === 'Good Morning';

const writeEntries = (entries: NotificationCenterEntry[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  notifyStorageChanged();
};

export const getNotificationCenterEntries = (): NotificationCenterEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<NotificationCenterEntry>>;
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map((entry) => normalizeEntry(entry))
      .filter((entry) => !isRemovedDefaultRoutineNotification(entry));
    const entries = normalized
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, MAX_ENTRIES);
    if (normalized.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
    return entries;
  } catch {
    return [];
  }
};

export const useNotificationCenterEntries = () =>
  useSettingsStorageValue(getNotificationCenterEntries, [] as NotificationCenterEntry[]);

export const getUnreadNotificationCount = (): number =>
  getNotificationCenterEntries().filter((entry) => entry.unread).length;

export const useUnreadNotificationCount = () =>
  useSettingsStorageValue(getUnreadNotificationCount, 0);

export const upsertNotificationCenterEntry = (entry: NotificationCenterEntryInput) => {
  const current = getNotificationCenterEntries();
  const existing = current.find((item) => item.id === entry.id);
  const nextEntry = normalizeEntry(entry, existing);
  const nextEntries = [
    nextEntry,
    ...current.filter((item) => item.id !== nextEntry.id),
  ].sort((left, right) => right.createdAt - left.createdAt);
  writeEntries(nextEntries);
};

export const markNotificationCenterEntryRead = (entryId: string) => {
  const entries = getNotificationCenterEntries();
  writeEntries(
    entries.map((entry) =>
      entry.id === entryId
        ? { ...entry, unread: false }
        : entry,
    ),
  );
};

export const markAllNotificationCenterEntriesRead = () => {
  const entries = getNotificationCenterEntries();
  if (entries.every((entry) => !entry.unread)) return;
  writeEntries(entries.map((entry) => ({ ...entry, unread: false })));
};

export const clearNotificationCenterEntries = () => {
  writeEntries([]);
};
