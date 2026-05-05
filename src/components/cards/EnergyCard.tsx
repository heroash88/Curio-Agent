import React from 'react';
import type { CardComponentProps, EnergyCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';
import { Zap, Sun, Battery, TrendingDown, TrendingUp } from 'lucide-react';

function fmtW(w?: number): string {
    if (w == null) return '--';
    if (Math.abs(w) >= 1000) return `${(w / 1000).toFixed(1)} kW`;
    return `${Math.round(w)} W`;
}

function fmtKwh(kwh?: number): string {
    if (kwh == null) return '--';
    return `${kwh.toFixed(1)} kWh`;
}

const EnergyCard: React.FC<CardComponentProps> = ({ card, onInteractionStart, onInteractionEnd }) => {
    const t = useCardTheme();
    const d = card.data as unknown as EnergyCardData;

    const batteryColor = (d.batteryPercent ?? 0) > 50 ? 'text-emerald-400' : (d.batteryPercent ?? 0) > 20 ? 'text-amber-400' : 'text-rose-400';

    return (
        <div
            className="card-glass min-w-[360px] max-w-[440px]"
            onMouseEnter={onInteractionStart}
            onMouseLeave={onInteractionEnd}
        >
            <div className="flex items-center gap-2 mb-4">
                <Zap size={18} className="text-amber-400" />
                <h3 className={`text-base font-bold ${t.text}`}>Energy Dashboard</h3>
            </div>

            {/* Main usage row */}
            <div className="grid grid-cols-2 gap-3 mb-3">
                <div className={`rounded-xl p-3 ${t.panel} border ${t.panelBorder}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${t.muted}`}>Current Usage</p>
                    <p className={`text-2xl font-black ${t.text}`}>{fmtW(d.currentUsageW)}</p>
                    <p className={`text-xs ${t.muted}`}>Today: {fmtKwh(d.todayKwh)}</p>
                </div>
                {d.solarProductionW != null && (
                    <div className={`rounded-xl p-3 ${t.panel} border ${t.panelBorder}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${t.muted} flex items-center gap-1`}>
                            <Sun size={10} className="text-yellow-400" /> Solar
                        </p>
                        <p className="text-2xl font-black text-yellow-400">{fmtW(d.solarProductionW)}</p>
                        <p className={`text-xs ${t.muted}`}>Today: {fmtKwh(d.solarTodayKwh)}</p>
                    </div>
                )}
            </div>

            {/* Grid import/export */}
            {(d.gridImportW != null || d.gridExportW != null) && (
                <div className="grid grid-cols-2 gap-3 mb-3">
                    {d.gridImportW != null && (
                        <div className={`rounded-xl p-3 ${t.panel} border ${t.panelBorder} flex items-center gap-2`}>
                            <TrendingDown size={16} className="text-rose-400 shrink-0" />
                            <div>
                                <p className={`text-[10px] font-bold uppercase ${t.muted}`}>Grid Import</p>
                                <p className={`text-sm font-bold text-rose-400`}>{fmtW(d.gridImportW)}</p>
                            </div>
                        </div>
                    )}
                    {d.gridExportW != null && (
                        <div className={`rounded-xl p-3 ${t.panel} border ${t.panelBorder} flex items-center gap-2`}>
                            <TrendingUp size={16} className="text-emerald-400 shrink-0" />
                            <div>
                                <p className={`text-[10px] font-bold uppercase ${t.muted}`}>Grid Export</p>
                                <p className="text-sm font-bold text-emerald-400">{fmtW(d.gridExportW)}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Battery */}
            {d.batteryPercent != null && (
                <div className={`rounded-xl p-3 mb-3 ${t.panel} border ${t.panelBorder} flex items-center gap-3`}>
                    <Battery size={20} className={batteryColor} />
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                            <p className={`text-xs font-bold ${t.text2}`}>Battery {d.batteryCharging ? '(Charging)' : ''}</p>
                            <p className={`text-sm font-black ${batteryColor}`}>{d.batteryPercent}%</p>
                        </div>
                        <div className={`h-2 w-full rounded-full ${t.panel}`}>
                            <div
                                className={`h-full rounded-full transition-all ${batteryColor.replace('text-', 'bg-')}`}
                                style={{ width: `${d.batteryPercent}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Cost */}
            {d.costToday != null && (
                <p className={`text-xs text-center ${t.muted}`}>
                    Today's cost: <span className={`font-bold ${t.text2}`}>{d.costCurrency || '$'}{d.costToday.toFixed(2)}</span>
                </p>
            )}

            {/* Monthly */}
            {d.monthKwh != null && (
                <p className={`text-xs text-center mt-1 ${t.muted}`}>
                    This month: <span className={`font-bold ${t.text2}`}>{fmtKwh(d.monthKwh)}</span>
                </p>
            )}
        </div>
    );
};

export default EnergyCard;
