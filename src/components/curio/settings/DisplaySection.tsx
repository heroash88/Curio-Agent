import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Palette, Clock, CloudRain, MessageCircle, Power, Maximize, MapPin, AudioLines, Monitor, LayoutGrid, SunMoon, Check, Image as ImageIcon, Upload } from 'lucide-react';
import { APP_BACKGROUND_PRESETS } from '../../../utils/settingsStorage';
import type { AppBackgroundStyle, WidgetPosition, IdlePromptPosition, ConnectButtonPosition } from '../../../utils/settingsStorage';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';
import ColorWheelInput from '../ColorWheelInput';

interface DisplaySectionProps {
    themeMode: string;
    setThemeMode: (v: 'light' | 'dark') => void;
    isFullscreen: boolean;
    toggleFullscreen: () => void;
    appBackgroundStyle: AppBackgroundStyle;
    setAppBackgroundStyle: (v: AppBackgroundStyle) => void;
    appBackgroundColor: string;
    setAppBackgroundColor: (v: string) => void;
    showClockWidget: boolean;
    setShowClockWidget: (v: boolean) => void;
    clockWidgetScale: number;
    setClockWidgetScale: (v: number) => void;
    clockWidgetPosition: string;
    setClockWidgetPosition: (v: WidgetPosition) => void;
    showWeatherWidget: boolean;
    setShowWeatherWidget: (v: boolean) => void;
    weatherWidgetScale: number;
    setWeatherWidgetScale: (v: number) => void;
    weatherWidgetPosition: string;
    setWeatherWidgetPosition: (v: WidgetPosition) => void;
    showIdlePrompt: boolean;
    setShowIdlePrompt: (v: boolean) => void;
    idlePromptScale: number;
    setIdlePromptScale: (v: number) => void;
    idlePromptPosition: string;
    setIdlePromptPosition: (v: IdlePromptPosition) => void;
    connectButtonScale: number;
    setConnectButtonScale: (v: number) => void;
    connectButtonPosition: string;
    setConnectButtonPosition: (v: ConnectButtonPosition) => void;
    clockShowSeconds: boolean;
    setClockShowSeconds: (v: boolean) => void;
    clockUse24Hour: boolean;
    setClockUse24Hour: (v: boolean) => void;
    showVoiceWaveform: boolean;
    setShowVoiceWaveform: (v: boolean) => void;
}

const DisplaySection: React.FC<DisplaySectionProps> = ({
    themeMode, setThemeMode,
    isFullscreen, toggleFullscreen,
    appBackgroundStyle, setAppBackgroundStyle,
    appBackgroundColor, setAppBackgroundColor,
    showClockWidget, setShowClockWidget,
    clockWidgetScale, setClockWidgetScale,
    clockWidgetPosition, setClockWidgetPosition,
    showWeatherWidget, setShowWeatherWidget,
    weatherWidgetScale, setWeatherWidgetScale,
    weatherWidgetPosition, setWeatherWidgetPosition,
    showIdlePrompt, setShowIdlePrompt,
    idlePromptScale, setIdlePromptScale,
    idlePromptPosition, setIdlePromptPosition,
    connectButtonScale, setConnectButtonScale,
    connectButtonPosition, setConnectButtonPosition,
    clockShowSeconds, setClockShowSeconds,
    clockUse24Hour, setClockUse24Hour,
    showVoiceWaveform, setShowVoiceWaveform,
}) => {
    const [draftBgColor, setDraftBgColor] = useState(appBackgroundColor);
    const bgCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const backgroundFileRef = useRef<HTMLInputElement>(null);
    const isHexBgColor = /^#[0-9a-fA-F]{6}$/.test(draftBgColor);
    const colorPickerValue = isHexBgColor ? draftBgColor : '#0a0a0a';

    useEffect(() => {
        setDraftBgColor(appBackgroundColor);
    }, [appBackgroundColor]);

    // Debounced slider state -- avoids writing to localStorage on every pixel drag
    const [draftClockScale, setDraftClockScale] = useState(clockWidgetScale);
    const [draftWeatherScale, setDraftWeatherScale] = useState(weatherWidgetScale);
    const [draftIdlePromptScale, setDraftIdlePromptScale] = useState(idlePromptScale);
    const [draftConnectScale, setDraftConnectScale] = useState(connectButtonScale);
    const sliderCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const commitSlider = useCallback((setter: (v: number) => void, value: number) => {
        if (sliderCommitRef.current) clearTimeout(sliderCommitRef.current);
        sliderCommitRef.current = setTimeout(() => setter(value), 300);
    }, []);

    const handleBackgroundUpload = useCallback((file: File | null) => {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            if (!dataUrl) return;
            setDraftBgColor(dataUrl);
            setAppBackgroundColor(dataUrl);
            setAppBackgroundStyle('image');
        };
        reader.readAsDataURL(file);
    }, [setAppBackgroundColor, setAppBackgroundStyle]);

    return (
        <SettingsSection title="Display" icon={<Monitor size={18} className="text-sky-500" />}>
            <div className="space-y-3">
                <SettingsToggle
                    label="Dark Mode"
                    description="Light / dark theme"
                    enabled={themeMode === 'dark'}
                    onToggle={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
                    color="bg-indigo-500"
                    icon={<SunMoon size={14} className="text-indigo-500" />}
                />
                <SettingsToggle
                    label="Fullscreen"
                    description="Toggle fullscreen (F11)"
                    enabled={isFullscreen}
                    onToggle={toggleFullscreen}
                    color="bg-sky-500"
                    icon={<Maximize size={14} className="text-sky-500" />}
                />
                <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Palette size={14} className="text-pink-500" /> Background</label>
                    <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-slate-100 p-1">
                        {([
                            { id: 'default' as AppBackgroundStyle, label: 'Theme', icon: <SunMoon size={12} /> },
                            { id: 'solid' as AppBackgroundStyle, label: 'Color', icon: <Palette size={12} /> },
                            { id: 'image' as AppBackgroundStyle, label: 'Image', icon: <ImageIcon size={12} /> },
                        ] as const).map((opt) => (
                            <button
                                key={opt.id}
                                onClick={() => setAppBackgroundStyle(opt.id as AppBackgroundStyle)}
                                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-bold transition-all ${appBackgroundStyle === opt.id ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {opt.icon}
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2 rounded-xl bg-slate-50/60 p-3 border border-slate-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Presets</span>
                    <div className="flex flex-wrap gap-2">
                        <input
                            ref={backgroundFileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                                handleBackgroundUpload(event.target.files?.[0] ?? null);
                                event.target.value = '';
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => backgroundFileRef.current?.click()}
                            className={`group relative flex h-9 min-w-9 items-center justify-center gap-1 rounded-xl border-2 px-2 text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95 ${
                                appBackgroundStyle === 'image' && draftBgColor.startsWith('data:')
                                    ? 'scale-105 border-pink-400 bg-white shadow-md'
                                    : 'border-transparent bg-white/60 text-slate-500 hover:border-slate-200 hover:text-slate-700'
                            }`}
                            title="Upload background"
                        >
                            <Upload size={12} />
                            Upload
                        </button>
                        {APP_BACKGROUND_PRESETS.map((preset) => {
                            const isActive = appBackgroundStyle === preset.style && draftBgColor === preset.value;
                            return (
                                <button
                                    key={preset.id}
                                    onClick={() => {
                                        setDraftBgColor(preset.value);
                                        setAppBackgroundColor(preset.value);
                                        setAppBackgroundStyle(preset.style);
                                    }}
                                    className={`group relative flex h-9 w-9 items-center justify-center rounded-xl border-2 transition-all active:scale-90 ${isActive ? 'scale-110 border-pink-400 shadow-md' : 'border-transparent hover:border-slate-200'}`}
                                    title={preset.label}
                                >
                                    <div
                                        className="h-6 w-6 rounded-lg border border-white/20 bg-cover bg-center"
                                        style={preset.style === 'image'
                                            ? { backgroundImage: `url("${preset.value}")` }
                                            : { background: preset.value }}
                                    />
                                    {isActive && (
                                        <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-pink-500 text-white shadow-sm">
                                            <Check size={10} strokeWidth={3} />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {appBackgroundStyle !== 'image' && (
                    <div className="flex items-center gap-3 pt-1">
                        <div className="flex flex-1 flex-col">
                            <span className="text-xs font-bold text-slate-600">Custom Color</span>
                            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 tabular-nums">{draftBgColor}</span>
                        </div>
                        <ColorWheelInput
                            value={colorPickerValue}
                            onChange={(val) => {
                                setDraftBgColor(val);
                                if (bgCommitRef.current) clearTimeout(bgCommitRef.current);
                                bgCommitRef.current = setTimeout(() => {
                                    setAppBackgroundColor(val);
                                    if (appBackgroundStyle === 'default') setAppBackgroundStyle('solid');
                                }, 300);
                            }}
                            onBlur={() => {
                                if (bgCommitRef.current) { clearTimeout(bgCommitRef.current); bgCommitRef.current = null; }
                                if (draftBgColor !== appBackgroundColor) {
                                    setAppBackgroundColor(draftBgColor);
                                    if (appBackgroundStyle === 'default') setAppBackgroundStyle('solid');
                                }
                            }}
                            ariaLabel="Custom app background color"
                            title="Custom app background color"
                            size="lg"
                            active
                            activeClassName="border-white shadow-sm"
                            inactiveClassName="border-white"
                        />
                    </div>
                    )}
                </div>

                {/* Homescreen Widgets */}
                <div className="space-y-3 pt-1">
                    <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400"><LayoutGrid size={12} /> Homescreen Widgets</span>
                    <div className="space-y-3">
                        {/* Clock */}
                        <div className="space-y-2.5 rounded-xl bg-slate-50/60 p-3">
                            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400"><Clock size={12} className="text-sky-400" /> Clock</span>
                            <SettingsToggle
                                label="Show Clock"
                                description="Display the time widget on homescreen"
                                enabled={showClockWidget}
                                onToggle={() => setShowClockWidget(!showClockWidget)}
                                color="bg-sky-500"
                                icon={<Clock size={14} className="text-sky-500" />}
                            />
                            {showClockWidget && (
                                <>
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-1 text-sm font-semibold text-slate-700"><Maximize size={13} className="text-slate-400" /> Size</span>
                                            <span className="text-xs font-bold text-slate-500 tabular-nums">{draftClockScale}%</span>
                                        </div>
                                        <input type="range" min="50" max="150" step="5" className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500" value={draftClockScale} onChange={(e) => { const v = parseInt(e.target.value, 10); setDraftClockScale(v); commitSlider(setClockWidgetScale, v); }} />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="flex items-center gap-1 text-sm font-semibold text-slate-700"><MapPin size={13} className="text-slate-400" /> Position</span>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((p) => (
                                                <button key={p} onClick={() => setClockWidgetPosition(p)} className={`rounded-xl px-3 py-2 text-xs font-bold capitalize transition-all active:scale-95 ${clockWidgetPosition === p ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{p.replace('-', ' ')}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <SettingsToggle
                                        label="24-Hour Format"
                                        description="Use 24h clock instead of AM/PM"
                                        enabled={clockUse24Hour}
                                        onToggle={() => setClockUse24Hour(!clockUse24Hour)}
                                        color="bg-sky-500"
                                        icon={<Clock size={14} className="text-sky-500" />}
                                    />
                                    <SettingsToggle
                                        label="Show Seconds"
                                        description="Display seconds on the clock"
                                        enabled={clockShowSeconds}
                                        onToggle={() => setClockShowSeconds(!clockShowSeconds)}
                                        color="bg-sky-500"
                                        icon={<Clock size={14} className="text-sky-500" />}
                                    />
                                </>
                            )}
                        </div>

                        {/* Weather / AQI */}
                        <div className="space-y-2.5 rounded-xl bg-slate-50/60 p-3">
                            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400"><CloudRain size={12} className="text-cyan-400" /> Weather / AQI</span>
                            <SettingsToggle
                                label="Show Weather"
                                description="Display weather and air quality widget"
                                enabled={showWeatherWidget}
                                onToggle={() => setShowWeatherWidget(!showWeatherWidget)}
                                color="bg-sky-500"
                                icon={<CloudRain size={14} className="text-sky-500" />}
                            />
                            {showWeatherWidget && (
                                <>
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-1 text-sm font-semibold text-slate-700"><Maximize size={13} className="text-slate-400" /> Size</span>
                                            <span className="text-xs font-bold text-slate-500 tabular-nums">{draftWeatherScale}%</span>
                                        </div>
                                        <input type="range" min="50" max="150" step="5" className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500" value={draftWeatherScale} onChange={(e) => { const v = parseInt(e.target.value, 10); setDraftWeatherScale(v); commitSlider(setWeatherWidgetScale, v); }} />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="flex items-center gap-1 text-sm font-semibold text-slate-700"><MapPin size={13} className="text-slate-400" /> Position</span>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((p) => (
                                                <button key={p} onClick={() => setWeatherWidgetPosition(p)} className={`rounded-xl px-3 py-2 text-xs font-bold capitalize transition-all active:scale-95 ${weatherWidgetPosition === p ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{p.replace('-', ' ')}</button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Idle Prompt */}
                        <div className="space-y-2.5 rounded-xl bg-slate-50/60 p-3">
                            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400"><MessageCircle size={12} className="text-violet-400" /> Idle Prompt</span>
                            <SettingsToggle
                                label="Show Idle Prompt"
                                description="Display wake word hints on screen"
                                enabled={showIdlePrompt}
                                onToggle={() => setShowIdlePrompt(!showIdlePrompt)}
                                color="bg-sky-500"
                                icon={<MessageCircle size={14} className="text-sky-500" />}
                            />
                            {showIdlePrompt && (
                                <>
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-1 text-sm font-semibold text-slate-700"><Maximize size={13} className="text-slate-400" /> Size</span>
                                            <span className="text-xs font-bold text-slate-500 tabular-nums">{draftIdlePromptScale}%</span>
                                        </div>
                                        <input type="range" min="50" max="150" step="5" className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500" value={draftIdlePromptScale} onChange={(e) => { const v = parseInt(e.target.value, 10); setDraftIdlePromptScale(v); commitSlider(setIdlePromptScale, v); }} />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="flex items-center gap-1 text-sm font-semibold text-slate-700"><MapPin size={13} className="text-slate-400" /> Position</span>
                                        <div className="flex gap-2">
                                            {(['top', 'bottom'] as const).map((p) => (
                                                <button key={p} onClick={() => setIdlePromptPosition(p)} className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold capitalize transition-all active:scale-95 ${idlePromptPosition === p ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{p}</button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Connect Button */}
                        <div className="space-y-2.5 rounded-xl bg-slate-50/60 p-3">
                            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400"><Power size={12} className="text-emerald-400" /> Connect Button</span>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1 text-sm font-semibold text-slate-700"><Maximize size={13} className="text-slate-400" /> Size</span>
                                    <span className="text-xs font-bold text-slate-500 tabular-nums">{draftConnectScale}%</span>
                                </div>
                                <input type="range" min="50" max="150" step="5" className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500" value={draftConnectScale} onChange={(e) => { const v = parseInt(e.target.value, 10); setDraftConnectScale(v); commitSlider(setConnectButtonScale, v); }} />
                            </div>
                            <div className="space-y-1">
                                <span className="flex items-center gap-1 text-sm font-semibold text-slate-700"><MapPin size={13} className="text-slate-400" /> Position</span>
                                <div className="flex gap-2">
                                    {(['top', 'bottom'] as const).map((p) => (
                                        <button key={p} onClick={() => setConnectButtonPosition(p)} className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold capitalize transition-all active:scale-95 ${connectButtonPosition === p ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{p}</button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Voice Waveform */}
                        <div className="space-y-2.5 rounded-xl bg-slate-50/60 p-3">
                            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400"><AudioLines size={12} className="text-pink-400" /> Voice Waveform</span>
                            <SettingsToggle
                                label="Show Voice Waveform"
                                description="Colorful animated waveform while AI speaks"
                                enabled={showVoiceWaveform}
                                onToggle={() => setShowVoiceWaveform(!showVoiceWaveform)}
                                color="bg-pink-500"
                                icon={<AudioLines size={14} className="text-pink-500" />}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </SettingsSection>
    );
};

export default React.memo(DisplaySection);
