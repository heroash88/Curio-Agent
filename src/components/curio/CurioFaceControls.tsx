import React from 'react';
import {
    Camera,
    CameraOff,
    Maximize2,
    Mic,
    MicOff,
    Moon,
    Settings,
    Sun,
    SwitchCamera,
    Volume2,
    VolumeX,
    Wifi,
    WifiOff,
} from 'lucide-react';

import { FaceModeDashboardButton } from './FaceModeDashboardButton';

type CurioFaceControlsProps = {
    visible: boolean;
    isConnected: boolean;
    isSpeaking: boolean;
    themeMode: string;
    cameraEnabled: boolean;
    canFlipCamera: boolean;
    isMuted: boolean;
    speakerMuted: boolean;
    bgIsDark: boolean;
    canUseDesktopFloating: boolean;
    desktopFloatingActive: boolean;
    onToggleTheme: () => void;
    onToggleCamera: () => void;
    onFlipCamera: () => void;
    onToggleMicMuted: () => void;
    onToggleSpeakerMuted: () => void;
    onStartFloatingFace: (event: React.MouseEvent<HTMLButtonElement>) => void;
    onOpenDashboardMode: () => void;
    onOpenSettings: (event: React.MouseEvent<HTMLButtonElement>) => void;
    onPointerOpenSettings: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

export function CurioFaceControls({
    visible,
    isConnected,
    isSpeaking,
    themeMode,
    cameraEnabled,
    canFlipCamera,
    isMuted,
    speakerMuted,
    bgIsDark,
    canUseDesktopFloating,
    desktopFloatingActive,
    onToggleTheme,
    onToggleCamera,
    onFlipCamera,
    onToggleMicMuted,
    onToggleSpeakerMuted,
    onStartFloatingFace,
    onOpenDashboardMode,
    onOpenSettings,
    onPointerOpenSettings,
}: CurioFaceControlsProps) {
    return (
        <div
            className={`absolute top-[calc(10rem+env(safe-area-inset-top,0px))] right-[calc(0.75rem+env(safe-area-inset-right,0px))] sm:top-[calc(12rem+env(safe-area-inset-top,0px))] sm:right-5 z-20 flex items-center transition-opacity duration-500 ${!visible ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}
        >
            <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 max-w-[200px] sm:max-w-none">
                <div className={`h-11 w-11 flex items-center justify-center rounded-full border shadow-sm transition-all ${isConnected
                    ? 'border-sky-200/60 bg-white/90 text-green-500'
                    : 'border-red-200/60 bg-red-50/90 text-red-500'
                }`}>
                    {isConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
                </div>

                <button
                    onClick={(event) => { event.stopPropagation(); onToggleTheme(); }}
                    className={`h-11 w-11 flex items-center justify-center rounded-full border transition-all active:scale-95 shadow-sm ${themeMode === 'dark'
                        ? 'border-amber-400/30 bg-amber-400/10 text-amber-500 hover:bg-amber-400/20'
                        : 'border-sky-200/60 bg-white/90 text-slate-700 hover:bg-white'
                    }`}
                    aria-label="Toggle theme"
                    title={themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {themeMode === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </button>

                {cameraEnabled && canFlipCamera && (
                    <button
                        onClick={(event) => { event.stopPropagation(); onFlipCamera(); }}
                        className="h-11 w-11 flex items-center justify-center rounded-full border border-sky-200/60 bg-white/90 text-slate-700 shadow-sm transition-all hover:bg-white active:scale-95"
                        aria-label="Flip camera"
                        title="Flip camera"
                    >
                        <SwitchCamera size={20} />
                    </button>
                )}

                <button
                    onClick={(event) => { event.stopPropagation(); onToggleCamera(); }}
                    className={`h-11 w-11 flex items-center justify-center rounded-full border transition-all active:scale-95 shadow-sm ${cameraEnabled
                        ? 'border-purple-400/50 bg-purple-100 text-purple-700 hover:bg-purple-200'
                        : 'border-sky-200/60 bg-white/90 text-slate-700 hover:bg-white'
                    }`}
                    aria-label={cameraEnabled ? 'Disable camera' : 'Enable camera'}
                    title={cameraEnabled ? 'Disable camera' : 'Enable camera'}
                >
                    {cameraEnabled ? <Camera size={20} /> : <CameraOff size={20} />}
                </button>

                {isConnected && (
                    <button
                        onClick={(event) => { event.stopPropagation(); onToggleMicMuted(); }}
                        className={`h-11 w-11 flex items-center justify-center rounded-full border transition-all active:scale-95 shadow-sm ${isMuted
                            ? 'border-red-400/50 bg-red-100 text-red-700 hover:bg-red-200'
                            : 'border-sky-200/60 bg-white/90 text-slate-700 hover:bg-white'
                        } ${!isMuted && isSpeaking ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}
                        aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                        title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                    >
                        {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                )}

                <button
                    onClick={(event) => { event.stopPropagation(); onToggleSpeakerMuted(); }}
                    className={`h-11 w-11 flex items-center justify-center rounded-full border shadow-sm transition-all active:scale-95 ${
                        speakerMuted
                            ? 'border-rose-300 bg-rose-500/90 text-white hover:bg-rose-600'
                            : bgIsDark ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-sky-200/60 bg-white/90 text-slate-700 hover:bg-white'
                    }`}
                    aria-label={speakerMuted ? 'Unmute speaker' : 'Mute speaker'}
                    title={speakerMuted ? 'Unmute speaker' : 'Mute speaker'}
                >
                    {speakerMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>

                {canUseDesktopFloating && (
                    <button
                        onClick={onStartFloatingFace}
                        className={`h-11 w-11 flex items-center justify-center rounded-full border shadow-sm transition-all active:scale-95 ${
                            desktopFloatingActive
                                ? 'border-teal-300 bg-teal-500/90 text-white hover:bg-teal-600'
                                : bgIsDark ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-sky-200/60 bg-white/90 text-slate-700 hover:bg-white'
                        }`}
                        aria-label="Float robot face"
                        title="Float robot face"
                    >
                        <Maximize2 size={18} />
                    </button>
                )}

                <FaceModeDashboardButton
                    dark={themeMode === 'dark'}
                    onOpenDashboard={onOpenDashboardMode}
                />

                <button
                    onPointerDown={onPointerOpenSettings}
                    onClick={onOpenSettings}
                    className={`h-11 w-11 flex items-center justify-center rounded-full border shadow-sm transition-all active:scale-95 ${themeMode === 'dark'
                        ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                        : 'border-sky-200/60 bg-white/90 text-slate-700 hover:bg-white'
                    }`}
                    aria-label="Settings"
                    title="Settings"
                >
                    <Settings size={20} />
                </button>
            </div>
        </div>
    );
}
