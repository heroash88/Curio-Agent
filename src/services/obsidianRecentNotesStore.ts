export interface RecentObsidianNote {
  path: string;
  title: string;
  preview?: string;
  updatedAt: number;
}

const STORAGE_KEY = 'curio_obsidian_recent_notes';
const MAX_RECENT_NOTES = 200;

export const getRecentObsidianNotes = (): RecentObsidianNote[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const rememberObsidianNote = (note: RecentObsidianNote) => {
  if (typeof window === 'undefined') {
    return;
  }

  const next = [
    note,
    ...getRecentObsidianNotes().filter((entry) => entry.path !== note.path),
  ]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_RECENT_NOTES);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};

export const rememberObsidianNotes = (notes: RecentObsidianNote[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  const merged = [...notes, ...getRecentObsidianNotes()];
  const seen = new Set<string>();
  const next = merged
    .filter((entry) => {
      if (!entry.path || seen.has(entry.path)) return false;
      seen.add(entry.path);
      return true;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_RECENT_NOTES);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('curio:settings-changed'));
};
