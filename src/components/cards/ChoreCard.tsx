import React, { useState } from 'react';
import type { CardComponentProps, ChoreCardData, ChoreItem } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';
import { CheckCircle2, Circle, RotateCcw, Trash2, Plus } from 'lucide-react';

const ChoreCard: React.FC<CardComponentProps> = ({ card, onInteractionStart, onInteractionEnd }) => {
    const t = useCardTheme();
    const data = card.data as unknown as ChoreCardData;
    const [chores, setChores] = useState<ChoreItem[]>(data.chores || []);
    const [newName, setNewName] = useState('');
    const [adding, setAdding] = useState(false);

    const toggle = (id: string) => {
        setChores(prev => prev.map(c =>
            c.id === id ? { ...c, completed: !c.completed, lastCompleted: !c.completed ? new Date().toISOString() : c.lastCompleted } : c
        ));
        import('../../services/chorePersistence').then(({ completeChore }) => completeChore(id)).catch(() => {});
    };

    const remove = (id: string) => {
        setChores(prev => prev.filter(c => c.id !== id));
        import('../../services/chorePersistence').then(({ deleteChore }) => deleteChore(id)).catch(() => {});
    };

    const resetAll = () => {
        setChores(prev => prev.map(c => ({ ...c, completed: false })));
        import('../../services/chorePersistence').then(({ resetCompletedChores }) => resetCompletedChores()).catch(() => {});
    };

    const addChore = () => {
        const name = newName.trim();
        if (!name) return;
        import('../../services/chorePersistence').then(({ addChore: persist }) => {
            const chore = persist(name);
            setChores(prev => [...prev, chore]);
        }).catch(() => {
            setChores(prev => [...prev, { id: `chore_${Date.now()}`, name, completed: false }]);
        });
        setNewName('');
        setAdding(false);
    };

    const done = chores.filter(c => c.completed).length;
    const total = chores.length;

    return (
        <div
            className="card-glass min-w-[340px] max-w-[420px]"
            onMouseEnter={onInteractionStart}
            onMouseLeave={onInteractionEnd}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h3 className={`text-base font-bold ${t.text}`}>{data.title || 'Chores & Tasks'}</h3>
                    <p className={`text-xs ${t.muted}`}>{done}/{total} done</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={resetAll} className={`rounded-lg p-1.5 ${t.btn} ${t.btnText}`} title="Reset all">
                        <RotateCcw size={14} />
                    </button>
                    <button onClick={() => setAdding(v => !v)} className={`rounded-lg p-1.5 ${t.btn} ${t.btnText}`} title="Add chore">
                        <Plus size={14} />
                    </button>
                </div>
            </div>

            {/* Progress bar */}
            {total > 0 && (
                <div className={`h-1.5 w-full rounded-full mb-3 ${t.panel}`}>
                    <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                        style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                    />
                </div>
            )}

            {/* Add input */}
            {adding && (
                <div className="flex gap-2 mb-3">
                    <input
                        autoFocus
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addChore(); if (e.key === 'Escape') setAdding(false); }}
                        placeholder="Chore name..."
                        className={`flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none ${t.panel} ${t.panelBorder} ${t.text2}`}
                    />
                    <button onClick={addChore} className="rounded-lg px-3 py-1.5 text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600">Add</button>
                </div>
            )}

            {/* Chore list */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {chores.length === 0 && (
                    <p className={`text-center text-sm py-4 ${t.muted}`}>No chores yet. Tap + to add one.</p>
                )}
                {chores.map(chore => (
                    <div
                        key={chore.id}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${t.panel} border ${t.panelBorder}`}
                    >
                        <button onClick={() => toggle(chore.id)} className="shrink-0">
                            {chore.completed
                                ? <CheckCircle2 size={18} className="text-emerald-400" />
                                : <Circle size={18} className={t.muted} />
                            }
                        </button>
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${chore.completed ? `line-through ${t.muted}` : t.text2}`}>
                                {chore.name}
                            </p>
                            {chore.assignee && (
                                <p className={`text-xs ${t.muted}`}>{chore.assignee}</p>
                            )}
                        </div>
                        {chore.recurring && (
                            <span className={`text-[10px] font-bold uppercase rounded-full px-1.5 py-0.5 ${t.btn} ${t.btnText}`}>
                                {chore.recurring}
                            </span>
                        )}
                        <button onClick={() => remove(chore.id)} className={`shrink-0 opacity-40 hover:opacity-100 transition-opacity ${t.muted}`}>
                            <Trash2 size={13} />
                        </button>
                    </div>
                ))}
            </div>

            {data.message && (
                <p className={`mt-3 text-xs text-center ${t.muted}`}>{data.message}</p>
            )}
        </div>
    );
};

export default ChoreCard;
