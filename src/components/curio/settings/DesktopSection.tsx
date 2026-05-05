import React, { useEffect, useRef, useState } from 'react';
import { Captions, MessageSquare, MonitorUp } from 'lucide-react';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';

interface DesktopSectionProps {
    desktopFaceScale: number;
    setDesktopFaceScale: (scale: number) => void;
    desktopTextInputEnabled: boolean;
    setDesktopTextInputEnabled: (enabled: boolean) => void;
    desktopSubtitlesEnabled: boolean;
    setDesktopSubtitlesEnabled: (enabled: boolean) => void;
}

const DesktopSection: React.FC<DesktopSectionProps> = ({
    desktopFaceScale,
    setDesktopFaceScale,
    desktopTextInputEnabled,
    setDesktopTextInputEnabled,
    desktopSubtitlesEnabled,
    setDesktopSubtitlesEnabled,
}) => {
    const [draftScale, setDraftScale] = useState(desktopFaceScale);
    const commitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setDraftScale(desktopFaceScale);
    }, [desktopFaceScale]);

    useEffect(() => () => {
        if (commitRef.current) clearTimeout(commitRef.current);
    }, []);

    const commitScale = (value: number) => {
        setDraftScale(value);
        if (commitRef.current) clearTimeout(commitRef.current);
        commitRef.current = setTimeout(() => setDesktopFaceScale(value), 200);
    };

    return (
        <SettingsSection title="Desktop" icon={<MonitorUp size={18} className="text-teal-500" />}>
            <div className="space-y-3">
                <SettingsToggle
                    label="Text Input Button"
                    description="Show the small message icon on the floating face"
                    enabled={desktopTextInputEnabled}
                    onToggle={() => setDesktopTextInputEnabled(!desktopTextInputEnabled)}
                    color="bg-sky-500"
                    icon={<MessageSquare size={14} className="text-sky-500" />}
                />
                <SettingsToggle
                    label="Subtitle Button"
                    description="Show optional floating subtitles"
                    enabled={desktopSubtitlesEnabled}
                    onToggle={() => setDesktopSubtitlesEnabled(!desktopSubtitlesEnabled)}
                    color="bg-violet-500"
                    icon={<Captions size={14} className="text-violet-500" />}
                />
                <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Floating Face Size
                        </label>
                        <span className="text-xs font-bold text-slate-600">{draftScale}%</span>
                    </div>
                    <input
                        className="w-full accent-teal-500"
                        type="range"
                        min={60}
                        max={600}
                        step={10}
                        value={draftScale}
                        onChange={(event) => commitScale(Number(event.currentTarget.value))}
                        onMouseUp={() => setDesktopFaceScale(draftScale)}
                        onTouchEnd={() => setDesktopFaceScale(draftScale)}
                        aria-label="Floating face size"
                    />
                </div>
            </div>
        </SettingsSection>
    );
};

export default React.memo(DesktopSection);
