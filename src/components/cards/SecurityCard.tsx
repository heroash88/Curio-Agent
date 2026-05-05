import React from 'react';
import type { CardComponentProps, SecurityCardData } from '../../services/cardTypes';
import { useCardTheme } from '../../hooks/useCardTheme';
import { Shield, ShieldAlert, ShieldCheck, ShieldOff, Lock, Unlock, AlertTriangle } from 'lucide-react';

const ALARM_CONFIG: Record<SecurityCardData['alarmState'], { label: string; color: string; icon: React.ReactNode }> = {
    disarmed:    { label: 'Disarmed',     color: 'text-emerald-400', icon: <ShieldOff size={22} className="text-emerald-400" /> },
    armed_home:  { label: 'Armed Home',   color: 'text-sky-400',     icon: <ShieldCheck size={22} className="text-sky-400" /> },
    armed_away:  { label: 'Armed Away',   color: 'text-indigo-400',  icon: <Shield size={22} className="text-indigo-400" /> },
    armed_night: { label: 'Armed Night',  color: 'text-violet-400',  icon: <Shield size={22} className="text-violet-400" /> },
    triggered:   { label: 'TRIGGERED',    color: 'text-rose-400',    icon: <ShieldAlert size={22} className="text-rose-400 animate-pulse" /> },
    pending:     { label: 'Pending',      color: 'text-amber-400',   icon: <ShieldAlert size={22} className="text-amber-400 animate-pulse" /> },
    arming:      { label: 'Arming...',    color: 'text-amber-400',   icon: <Shield size={22} className="text-amber-400" /> },
    unknown:     { label: 'Unknown',      color: 'text-slate-400',   icon: <Shield size={22} className="text-slate-400" /> },
};

const SecurityCard: React.FC<CardComponentProps> = ({ card, onInteractionStart, onInteractionEnd }) => {
    const t = useCardTheme();
    const d = card.data as unknown as SecurityCardData;
    const alarm = ALARM_CONFIG[d.alarmState] || ALARM_CONFIG.unknown;

    return (
        <div
            className="card-glass min-w-[340px] max-w-[440px]"
            onMouseEnter={onInteractionStart}
            onMouseLeave={onInteractionEnd}
        >
            {/* Alarm state */}
            <div className={`flex items-center gap-3 rounded-xl p-4 mb-3 ${t.panel} border ${t.panelBorder}`}>
                {alarm.icon}
                <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${t.muted}`}>
                        {d.alarmName || 'Security System'}
                    </p>
                    <p className={`text-xl font-black ${alarm.color}`}>{alarm.label}</p>
                </div>
                {d.alarmState === 'triggered' && (
                    <AlertTriangle size={20} className="ml-auto text-rose-400 animate-bounce" />
                )}
            </div>

            {/* Locks */}
            {d.locks && d.locks.length > 0 && (
                <div className="mb-3">
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${t.muted}`}>Locks</p>
                    <div className="space-y-1.5">
                        {d.locks.map(lock => (
                            <div
                                key={lock.entityId}
                                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${t.panel} border ${t.panelBorder}`}
                            >
                                {lock.state === 'locked'
                                    ? <Lock size={15} className="text-emerald-400 shrink-0" />
                                    : <Unlock size={15} className="text-amber-400 shrink-0" />
                                }
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium truncate ${t.text2}`}>{lock.name}</p>
                                    {lock.area && <p className={`text-xs ${t.muted}`}>{lock.area}</p>}
                                </div>
                                <span className={`text-xs font-bold ${lock.state === 'locked' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {lock.state === 'locked' ? 'Locked' : lock.state === 'unlocked' ? 'Unlocked' : 'Unknown'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent events */}
            {d.recentEvents && d.recentEvents.length > 0 && (
                <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${t.muted}`}>Recent Events</p>
                    <div className="space-y-1">
                        {d.recentEvents.slice(0, 4).map((ev, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className={`text-[10px] ${t.muted} shrink-0 w-14`}>{ev.time}</span>
                                <span className={`text-xs ${t.text2} truncate`}>{ev.description}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SecurityCard;
