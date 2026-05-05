import React from 'react';
import type { CardComponentProps, ObsidianNoteCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';

const MODE_CONFIG: Record<string, { icon: string; accent: string; border: string; bg: string }> = {
    view: { icon: '📖', accent: 'text-purple-400', border: 'border-purple-500/20', bg: 'bg-purple-500/15' },
    search: { icon: '🔍', accent: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/15' },
    created: { icon: '✨', accent: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/15' },
    appended: { icon: '📝', accent: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/15' },
};

const ObsidianNoteCard: React.FC<CardComponentProps> = ({ card, onInteractionStart, onInteractionEnd }) => {
    const t = useCardTheme();
    const data = card.data as unknown as ObsidianNoteCardData;
    const mode = MODE_CONFIG[data.mode] || MODE_CONFIG.view;

    return (
        <div className="card-glass overflow-hidden min-w-[360px] max-w-[480px]">
            {/* Header */}
            <div className={`px-5 pt-5 pb-3 ${mode.bg}`}>
                <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${mode.bg} border ${mode.border}`}>
                        <span className="text-xl">{mode.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold font-headline truncate ${t.text}`}>{data.title}</p>
                        {data.path && (
                            <p className={`text-[10px] font-medium ${t.faint} truncate`}>{data.path}</p>
                        )}
                    </div>
                    <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${mode.bg} ${mode.accent}`}>
                        Obsidian
                    </div>
                </div>
            </div>

            {/* Content */}
            <div
                className="px-5 py-4 max-h-[300px] overflow-y-auto"
                onPointerDown={onInteractionStart}
                onPointerUp={onInteractionEnd}
            >
                {data.mode === 'search' && data.matches && data.matches.length > 0 ? (
                    <div className="space-y-2">
                        {data.matches.map((m, i) => (
                            <div key={i} className={`rounded-xl px-3 py-2 ${mode.bg} border ${mode.border}`}>
                                <p className={`text-xs font-semibold ${t.text} truncate`}>{m.filename}</p>
                                {m.context && (
                                    <p className={`text-[11px] ${t.muted} mt-1 line-clamp-2`}>{m.context}</p>
                                )}
                            </div>
                        ))}
                    </div>
                ) : data.content ? (
                    <pre className={`text-xs ${t.muted} whitespace-pre-wrap break-words font-sans leading-relaxed`}>
                        {data.content}
                    </pre>
                ) : (
                    <p className={`text-xs ${t.faint} italic`}>No content</p>
                )}
            </div>
        </div>
    );
};

export default ObsidianNoteCard;
