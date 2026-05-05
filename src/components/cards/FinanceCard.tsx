import React from 'react';
import { CardComponentProps, FinanceCardData } from '../../services/cardTypes';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useCardTheme } from '../../hooks/useCardTheme';

export const FinanceCard: React.FC<CardComponentProps> = ({ card, onInteractionStart, onInteractionEnd }) => {
    const t = useCardTheme();
    const data = card.data as unknown as FinanceCardData;
    const isPositive = data.change >= 0;
    
    // Safety fallback for formatting
    let formattedPrice = `${data.price}`;
    try {
        const currencyFormat = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: data.currency || 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        formattedPrice = currencyFormat.format(data.price);
    } catch (e) {
        // Fallback applied
    }

    const isCrypto = data.symbol.includes('-') || ['BTC', 'ETH', 'DOGE', 'SOL', 'ADA'].includes(data.symbol.toUpperCase());
    
    return (
        <div
            className="card-glass min-w-[420px]"
            onMouseEnter={onInteractionStart}
            onMouseLeave={onInteractionEnd}
            onTouchStart={onInteractionStart}
            onTouchEnd={onInteractionEnd}
        >
            <div className={`h-1.5 w-full rounded-full mb-4 ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <div className="flex flex-col">
                <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                        <span className={`text-2xl font-black font-headline tracking-tight ${t.text}`}>
                            {data.symbol.toUpperCase()}
                        </span>
                        <span className={`text-xs font-semibold ${t.muted}`}>
                            {data.name || (isCrypto ? 'Cryptocurrency' : 'Equity')}
                        </span>
                    </div>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                        {isPositive ? <TrendingUp size={20} className="stroke-[2.5px]" /> : <TrendingDown size={20} className="stroke-[2.5px]" />}
                    </div>
                </div>

                <div className="mt-6 flex flex-col">
                    <span className={`text-4xl font-light font-headline tracking-tighter ${t.text}`}>
                        {formattedPrice}
                    </span>
                    <div className="mt-1 flex items-center gap-2 font-semibold">
                        <span className={`flex items-center gap-0.5 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? '+' : ''}{data.change.toFixed(2)}
                        </span>
                        <span className={`${t.faint}`}>•</span>
                        <span className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs ${isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            {isPositive ? '+' : ''}{data.changePercent.toFixed(2)}%
                        </span>
                    </div>
                </div>

                {data.marketCap && (
                    <div className={`mt-5 flex items-center justify-between rounded-xl ${t.panel} p-3`}>
                        <span className={`text-xs font-bold uppercase tracking-wider ${t.faint}`}>Market Cap</span>
                        <span className={`text-sm font-semibold ${t.text2}`}>{data.marketCap}</span>
                    </div>
                )}
            </div>
        </div>
    );
};
