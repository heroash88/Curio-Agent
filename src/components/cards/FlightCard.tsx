import React from 'react';
import type { CardComponentProps, FlightCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';
import { Plane, AlertCircle, CheckCircle2 } from 'lucide-react';

const STATUS_CONFIG: Record<FlightCardData['status'], { label: string; color: string }> = {
    scheduled: { label: 'Scheduled',  color: 'text-sky-400' },
    active:    { label: 'In Flight',  color: 'text-emerald-400' },
    landed:    { label: 'Landed',     color: 'text-slate-400' },
    cancelled: { label: 'Cancelled',  color: 'text-rose-400' },
    diverted:  { label: 'Diverted',   color: 'text-amber-400' },
    unknown:   { label: 'Unknown',    color: 'text-slate-400' },
};

const FlightCard: React.FC<CardComponentProps> = ({ card, onInteractionStart, onInteractionEnd }) => {
    const t = useCardTheme();
    const d = card.data as unknown as FlightCardData;
    const status = STATUS_CONFIG[d.status] || STATUS_CONFIG.unknown;

    return (
        <div
            className="card-glass min-w-[360px] max-w-[460px]"
            onMouseEnter={onInteractionStart}
            onMouseLeave={onInteractionEnd}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Plane size={18} className={status.color} />
                    <div>
                        <p className={`text-lg font-black ${t.text}`}>{d.flightNumber}</p>
                        {d.airline && <p className={`text-xs ${t.muted}`}>{d.airline}</p>}
                    </div>
                </div>
                <span className={`text-sm font-bold ${status.color}`}>{status.label}</span>
            </div>

            {/* Route */}
            <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 text-center">
                    <p className={`text-2xl font-black ${t.text}`}>{d.originCode}</p>
                    <p className={`text-xs ${t.muted} truncate`}>{d.origin}</p>
                </div>
                <div className="flex flex-col items-center gap-1 px-2">
                    <div className={`h-px w-16 ${t.panelBorder} border-t border-dashed`} />
                    <Plane size={14} className={`${status.color} rotate-90`} />
                </div>
                <div className="flex-1 text-center">
                    <p className={`text-2xl font-black ${t.text}`}>{d.destinationCode}</p>
                    <p className={`text-xs ${t.muted} truncate`}>{d.destination}</p>
                </div>
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-3 mb-3">
                <div className={`rounded-xl p-3 ${t.panel} border ${t.panelBorder}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${t.muted}`}>Departure</p>
                    <p className={`text-sm font-bold ${t.text}`}>{d.departureActual || d.departureScheduled || '--'}</p>
                    {d.departureActual && d.departureScheduled && d.departureActual !== d.departureScheduled && (
                        <p className={`text-xs line-through ${t.muted}`}>{d.departureScheduled}</p>
                    )}
                </div>
                <div className={`rounded-xl p-3 ${t.panel} border ${t.panelBorder}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${t.muted}`}>Arrival</p>
                    <p className={`text-sm font-bold ${t.text}`}>{d.arrivalActual || d.arrivalScheduled || '--'}</p>
                    {d.arrivalActual && d.arrivalScheduled && d.arrivalActual !== d.arrivalScheduled && (
                        <p className={`text-xs line-through ${t.muted}`}>{d.arrivalScheduled}</p>
                    )}
                </div>
            </div>

            {/* Delay / gate / progress */}
            <div className="flex items-center gap-3 flex-wrap">
                {d.delayMinutes != null && d.delayMinutes > 0 && (
                    <div className="flex items-center gap-1 text-amber-400">
                        <AlertCircle size={13} />
                        <span className="text-xs font-bold">{d.delayMinutes}m delay</span>
                    </div>
                )}
                {d.delayMinutes === 0 && d.status !== 'cancelled' && (
                    <div className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 size={13} />
                        <span className="text-xs font-bold">On time</span>
                    </div>
                )}
                {d.gate && (
                    <span className={`text-xs ${t.muted}`}>Gate <span className={`font-bold ${t.text2}`}>{d.gate}</span></span>
                )}
                {d.terminal && (
                    <span className={`text-xs ${t.muted}`}>Terminal <span className={`font-bold ${t.text2}`}>{d.terminal}</span></span>
                )}
                {d.aircraft && (
                    <span className={`text-xs ${t.muted}`}>{d.aircraft}</span>
                )}
            </div>

            {/* In-flight stats */}
            {d.status === 'active' && (d.altitude != null || d.speed != null) && (
                <div className={`mt-3 flex gap-4 rounded-xl p-3 ${t.panel} border ${t.panelBorder}`}>
                    {d.altitude != null && (
                        <div>
                            <p className={`text-[10px] uppercase ${t.muted}`}>Altitude</p>
                            <p className={`text-sm font-bold ${t.text2}`}>{d.altitude.toLocaleString()} ft</p>
                        </div>
                    )}
                    {d.speed != null && (
                        <div>
                            <p className={`text-[10px] uppercase ${t.muted}`}>Speed</p>
                            <p className={`text-sm font-bold ${t.text2}`}>{d.speed} kts</p>
                        </div>
                    )}
                    {d.progress != null && (
                        <div className="flex-1">
                            <p className={`text-[10px] uppercase ${t.muted} mb-1`}>Progress</p>
                            <div className={`h-1.5 w-full rounded-full ${t.panel}`}>
                                <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${d.progress}%` }} />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FlightCard;
