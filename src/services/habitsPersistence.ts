
import { randomId } from '../utils/randomId';

export interface HabitItem {
    id: string;
    name: string;
    streak: number;
    completedToday: boolean;
    lastCompleted?: number;
}

const STORAGE_KEY = 'etheros_habits';
export const HABITS_EVENT = 'curio:habits-changed';

const isSameLocalDay = (left: number, right: number) =>
    new Date(left).toDateString() === new Date(right).toDateString();

export function getHabits(): HabitItem[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];
        const habits = JSON.parse(stored) as HabitItem[];

        let changed = false;
        const now = Date.now();
        const resetHabits = habits.map(h => {
            if (h.completedToday && h.lastCompleted && !isSameLocalDay(h.lastCompleted, now)) {
                changed = true;
                return { ...h, completedToday: false };
            }
            return h;
        });
        if (changed && typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(resetHabits));
        }
        return resetHabits;
    } catch {
        return [];
    }
}

export function saveHabits(habits: HabitItem[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent(HABITS_EVENT));
    window.dispatchEvent(new CustomEvent('curio:settings-changed'));
}

export function toggleHabit(id: string) {
    const habits = getHabits();
    const updated = habits.map(h => {
        if (h.id === id) {
            const completed = !h.completedToday;
            return {
                ...h,
                completedToday: completed,
                streak: completed ? h.streak + 1 : Math.max(0, h.streak - 1),
                lastCompleted: completed ? Date.now() : h.lastCompleted
            };
        }
        return h;
    });
    saveHabits(updated);
}

export function addHabit(name: string) {
    const habits = getHabits();
    const newHabit: HabitItem = {
        id: randomId(),
        name,
        streak: 0,
        completedToday: false
    };
    saveHabits([...habits, newHabit]);
}

export function deleteHabit(id: string) {
    const habits = getHabits();
    saveHabits(habits.filter(h => h.id !== id));
}
