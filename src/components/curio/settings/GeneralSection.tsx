import React from 'react';
import { User, Settings, VolumeX, Volume2, Battery } from 'lucide-react';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';

interface GeneralSectionProps {
    localUserName: string;
    setLocalUserName: (v: string) => void;
    userName: string;
    setUserName: (v: string) => void;
    muteMicWhileAiSpeaking: boolean;
    setMuteMicWhileAiSpeaking: (v: boolean) => void;
    speakerMuted: boolean;
    setSpeakerMuted: (v: boolean) => void;
    lowPowerMode: boolean;
    setLowPowerMode: (v: boolean) => void;
}

const GeneralSection: React.FC<GeneralSectionProps> = ({
    localUserName,
    setLocalUserName,
    userName,
    setUserName,
    muteMicWhileAiSpeaking,
    setMuteMicWhileAiSpeaking,
    speakerMuted,
    setSpeakerMuted,
    lowPowerMode,
    setLowPowerMode,
}) => (
    <SettingsSection title="General" icon={<Settings size={18} className="text-slate-500" />}>
        <div className="space-y-3">
            <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><User size={14} className="text-sky-500" /> Your Name</label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition-all focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
                    <input
                        type="text"
                        placeholder="What should Curio call you?"
                        className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
                        value={localUserName}
                        onChange={(event) => setLocalUserName(event.target.value)}
                        onBlur={() => { if (localUserName !== userName) setUserName(localUserName); }}
                        onKeyDown={(e) => e.stopPropagation()}
                    />
                </div>
            </div>
            <SettingsToggle
                label="Echo Ducking"
                description="Mute mic while AI speaks"
                enabled={muteMicWhileAiSpeaking}
                onToggle={() => setMuteMicWhileAiSpeaking(!muteMicWhileAiSpeaking)}
                color="bg-indigo-500"
                icon={<VolumeX size={14} className="text-indigo-500" />}
            />
            <SettingsToggle
                label="Speaker Mute"
                description="Mute AI voice output"
                enabled={speakerMuted}
                onToggle={() => setSpeakerMuted(!speakerMuted)}
                color="bg-rose-500"
                icon={<Volume2 size={14} className="text-rose-500" />}
            />
            <SettingsToggle
                label="Low Power Mode"
                description="Optimizes for weak devices"
                enabled={lowPowerMode}
                onToggle={() => setLowPowerMode(!lowPowerMode)}
                color="bg-amber-500"
                icon={<Battery size={14} className="text-amber-500" />}
            />
        </div>
    </SettingsSection>
);

export default React.memo(GeneralSection);
