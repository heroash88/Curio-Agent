import React, { useState, useCallback } from 'react';
import { useCardManager } from '../../contexts/CardManagerContext';
import { show, list, clear } from '../../services/cardDebug';

if (!import.meta.env.DEV) {
    // This component should never be rendered in production
    throw new Error('CardDebugPanel is dev-only');
}

const CARD_TYPES = list();

const CardDebugPanel: React.FC = () => {
    const [open, setOpen] = useState(false);
    const { emitCardEvent } = useCardManager();

    const handleShow = useCallback((type: string) => {
        show(type);
    }, []);

    // Don't render if emitter isn't ready
    void emitCardEvent;

    return (
        <div className="fixed bottom-4 left-4 z-[999] pointer-events-auto" onClick={e => e.stopPropagation()}>
            {open && (
                <div className="mb-2 rounded-2xl bg-black/80 backdrop-blur-xl border border-white/10 p-3 shadow-2xl max-h-[60vh] overflow-y-auto w-56">
                    <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Card Debug</span>
                        <button
                            onClick={() => { clear(); setOpen(false); }}
                            className="text-[10px] font-bold text-rose-400 hover:text-rose-300"
                        >
                            Clear All
                        </button>
                    </div>
                    <button
                        onClick={() => { show('all'); setOpen(false); }}
                        className="w-full mb-1.5 rounded-xl bg-[#00B2FF]/20 border border-[#00B2FF]/30 px-3 py-2 text-xs font-bold text-[#00B2FF] hover:bg-[#00B2FF]/30 active:scale-[0.98] transition-all"
                    >
                        Show All Cards
                    </button>
                    <div className="space-y-0.5">
                        {CARD_TYPES.map(type => (
                            <button
                                key={type}
                                onClick={() => handleShow(type)}
                                className="w-full text-left rounded-lg px-3 py-1.5 text-[11px] font-medium text-white/70 hover:bg-white/10 active:scale-[0.98] transition-all"
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <button
                onClick={() => setOpen(v => !v)}
                className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all active:scale-90 ${
                    open
                        ? 'bg-rose-500 text-white'
                        : 'bg-black/60 backdrop-blur-md border border-white/10 text-white/60 hover:text-white'
                }`}
                title="Card Debug Panel"
            >
                {open ? '✕' : '🃏'}
            </button>
        </div>
    );
};

export default CardDebugPanel;
