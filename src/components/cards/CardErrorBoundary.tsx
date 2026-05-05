import React from 'react';

interface CardErrorBoundaryProps {
    cardType: string;
    onDismiss: () => void;
    children: React.ReactNode;
}

interface CardErrorBoundaryState {
    hasError: boolean;
}

/**
 * Per-card error boundary that catches render errors in individual card
 * components without crashing the entire app. Shows a minimal fallback
 * with a dismiss button.
 */
export class CardErrorBoundary extends React.Component<CardErrorBoundaryProps, CardErrorBoundaryState> {
    constructor(props: CardErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): CardErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[CardErrorBoundary] "${this.props.cardType}" card crashed:`, error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="card-glass flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="text-red-400 opacity-80">
                        Card failed to render
                    </span>
                    <button
                        onClick={this.props.onDismiss}
                        className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/20 transition-colors"
                    >
                        Dismiss
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
