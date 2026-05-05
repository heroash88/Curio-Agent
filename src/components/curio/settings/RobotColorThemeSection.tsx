import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import { ROBOT_COLOR_THEMES } from '../../../utils/settingsStorage';
import { applyRobotThemeCss } from './settingsTypes';
import ColorWheelInput from '../ColorWheelInput';

interface RobotColorThemeSectionProps {
    robotColorThemeId: 'blue' | 'purple' | 'green' | 'pink' | 'orange' | 'red' | 'cyan' | 'amber' | 'custom';
    customRobotColor: string;
    setRobotColorThemeId: (id: 'blue' | 'purple' | 'green' | 'pink' | 'orange' | 'red' | 'cyan' | 'amber' | 'custom') => void;
    setCustomRobotColor: (color: string) => void;
}

const RobotColorThemeSection: React.FC<RobotColorThemeSectionProps> = ({
    robotColorThemeId,
    customRobotColor,
    setRobotColorThemeId,
    setCustomRobotColor,
}) => {
    const [draftCustomColor, setDraftCustomColor] = useState(customRobotColor);
    const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const draftRef = useRef(draftCustomColor);
    draftRef.current = draftCustomColor;

    useEffect(() => {
        setDraftCustomColor(customRobotColor);
    }, [customRobotColor]);

    useEffect(() => {
        return () => {
            if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
        };
    }, []);

    const commitCustomColor = useCallback(() => {
        if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
        const color = draftRef.current;
        if (color === customRobotColor) return;
        setCustomRobotColor(color);
    }, [customRobotColor, setCustomRobotColor]);

    const scheduleCommit = useCallback(() => {
        if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
        commitTimerRef.current = setTimeout(() => {
            const color = draftRef.current;
            if (color !== customRobotColor) {
                setCustomRobotColor(color);
            }
        }, 300);
    }, [customRobotColor, setCustomRobotColor]);

    return (
        <div className="space-y-2">
            <div className="flex flex-col">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Palette size={14} className="text-rose-500" /> Color Theme</span>
                <span className="text-[10px] text-slate-400 italic">Curio's UI accent color</span>
            </div>
            <div className="flex flex-wrap gap-2">
                {ROBOT_COLOR_THEMES.map((theme) => (
                    <button
                        key={theme.id}
                        onClick={() => {
                            applyRobotThemeCss(theme.accent, theme.eyeArc, theme.eyeRimOuter);
                            setRobotColorThemeId(theme.id);
                        }}
                        className={`group relative flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-all active:scale-90 ${robotColorThemeId === theme.id ? 'scale-110 border-slate-400 shadow-md' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
                        title={theme.label}
                    >
                        <div className="h-6 w-6 rounded-lg" style={{ backgroundColor: theme.accent }} />
                        {robotColorThemeId === theme.id && (
                            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-[8px] text-white shadow-sm">&#x2713;</div>
                        )}
                    </button>
                ))}

                <button
                    onClick={() => {
                        applyRobotThemeCss(draftCustomColor);
                        setRobotColorThemeId('custom');
                    }}
                    className={`group relative flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-all active:scale-90 ${robotColorThemeId === 'custom' ? 'scale-110 border-slate-400 shadow-md' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
                    title="Custom Color"
                >
                    <div
                        className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200"
                        style={{ backgroundColor: robotColorThemeId === 'custom' ? draftCustomColor : '#f1f5f9' }}
                    >
                        <Palette size={14} className={robotColorThemeId === 'custom' ? 'text-white drop-shadow-sm' : 'text-slate-400'} />
                    </div>
                    {robotColorThemeId === 'custom' && (
                        <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-[8px] text-white shadow-sm">&#x2713;</div>
                    )}
                </button>
            </div>

            {robotColorThemeId === 'custom' && (
                <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex flex-1 flex-col">
                        <span className="text-xs font-bold text-slate-600">Custom Accent</span>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 tabular-nums">{draftCustomColor}</span>
                    </div>
                    <ColorWheelInput
                        value={draftCustomColor}
                        onChange={(nextColor) => {
                            setDraftCustomColor(nextColor);
                            applyRobotThemeCss(nextColor);
                            scheduleCommit();
                        }}
                        ariaLabel="Custom Curio accent color"
                        title="Custom Curio accent color"
                        size="lg"
                        active
                        onBlur={commitCustomColor}
                        activeClassName="border-white shadow-sm"
                        inactiveClassName="border-white"
                    />
                </div>
            )}
        </div>
    );
};

export default RobotColorThemeSection;
