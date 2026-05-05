type CurioConnectControlsProps = {
    showDashboard: boolean;
    connectButtonPosition: string;
    isMiniPlayerActive: boolean;
    controlsVisible: boolean;
    wakeWordEnabled: boolean;
    connectButtonScale: number;
    connectionActive: boolean;
    connectionBusy: boolean;
    connectionLabel: string;
    onToggleConnection: () => void;
};

export function CurioConnectControls({
    showDashboard,
    connectButtonPosition,
    isMiniPlayerActive,
    controlsVisible,
    wakeWordEnabled,
    connectButtonScale,
    connectionActive,
    connectionBusy,
    connectionLabel,
    onToggleConnection,
}: CurioConnectControlsProps) {
    if (showDashboard) {
        return null;
    }

    return (
        <div
            className={`absolute left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1.5 px-4 transition-opacity duration-500 curio-face-connect-controls ${connectButtonPosition === 'top' ? 'top-[calc(240px+env(safe-area-inset-top,0px))] sm:top-[calc(96px+env(safe-area-inset-top,0px))]' : ''} ${(!controlsVisible && wakeWordEnabled) ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}
            data-position={connectButtonPosition}
            data-mini-player={isMiniPlayerActive ? 'true' : undefined}
        >
            <div
                className="flex flex-wrap items-center justify-center gap-3 pointer-events-auto"
                style={{ transform: `scale(${connectButtonScale / 100})`, transformOrigin: 'center' }}
            >
                <button
                    onClick={(event) => { event.stopPropagation(); onToggleConnection(); }}
                    className={`group relative flex items-center justify-center gap-2.5 overflow-hidden rounded-full border transition-all duration-300 active:scale-[0.96] ${connectionActive || connectionBusy
                        ? 'bg-rose-500/90 border-rose-400/30 text-white'
                        : 'border-[#00B2FF]/30 text-white hover:brightness-110'
                    }`}
                    style={!(connectionActive || connectionBusy) ? { padding: '12px 28px', backgroundColor: '#00B2FF' } : { padding: '12px 28px' }}
                >
                    {connectionBusy && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                    )}
                    <span className="relative z-10 flex items-center gap-2.5">
                        {connectionActive || connectionBusy ? (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                        )}
                        <span className="text-[13px] font-semibold tracking-wide">
                            {connectionLabel}
                        </span>
                    </span>
                </button>
            </div>
        </div>
    );
}
