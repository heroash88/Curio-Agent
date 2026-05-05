import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Eye, Maximize, Play, RotateCcw, Sparkles, Timer, Bot, Volume2 } from 'lucide-react';
import { DEFAULT_ROBOT_FACE_SCALE, FACE_STYLES } from '../../../utils/settingsStorage';
import type { FaceStyleId } from '../../../utils/settingsStorage';
import SettingsSection from '../SettingsSection';
import SettingsToggle from '../SettingsToggle';
import RobotColorThemeSection from './RobotColorThemeSection';
import { DEFAULT_ANIMATIONS, ROBOT_ANIMATIONS_CATALOG } from './settingsTypes';

interface RobotSectionProps {
  faceStyleId: string;
  setFaceStyleId: (v: FaceStyleId) => void;
  robotFaceScale: number;
  setRobotFaceScale: (v: number) => void;
  robotColorThemeId: 'blue' | 'purple' | 'green' | 'pink' | 'orange' | 'red' | 'cyan' | 'amber' | 'custom';
  setRobotColorThemeId: (id: 'blue' | 'purple' | 'green' | 'pink' | 'orange' | 'red' | 'cyan' | 'amber' | 'custom') => void;
  customRobotColor: string;
  setCustomRobotColor: (v: string) => void;
  faceTrackingEnabled: boolean;
  setFaceTrackingEnabled: (v: boolean) => void;
  idleSleepTimeout: number;
  setIdleSleepTimeout: (v: number) => void;
  benderSoundsEnabled: boolean;
  setBenderSoundsEnabled: (v: boolean) => void;
}

const RobotSection: React.FC<RobotSectionProps> = ({
  faceStyleId,
  setFaceStyleId,
  robotFaceScale,
  setRobotFaceScale,
  robotColorThemeId,
  setRobotColorThemeId,
  customRobotColor,
  setCustomRobotColor,
  faceTrackingEnabled,
  setFaceTrackingEnabled,
  idleSleepTimeout,
  setIdleSleepTimeout,
  benderSoundsEnabled,
  setBenderSoundsEnabled,
}) => {
  const availableAnimations = useMemo(() => {
    return ROBOT_ANIMATIONS_CATALOG[faceStyleId as keyof typeof ROBOT_ANIMATIONS_CATALOG] || DEFAULT_ANIMATIONS;
  }, [faceStyleId]);

  const [selectedAnimationId, setSelectedAnimationId] = useState<number>(availableAnimations[0].id);
  const [draftFaceScale, setDraftFaceScale] = useState(robotFaceScale);
  const [draftSleepTimeout, setDraftSleepTimeout] = useState(idleSleepTimeout);

  const faceScaleCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimeoutCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitFaceScale = useCallback((value: number) => {
    if (faceScaleCommitRef.current) clearTimeout(faceScaleCommitRef.current);
    faceScaleCommitRef.current = setTimeout(() => setRobotFaceScale(value), 180);
  }, [setRobotFaceScale]);

  const commitSleepTimeout = useCallback((value: number) => {
    if (sleepTimeoutCommitRef.current) clearTimeout(sleepTimeoutCommitRef.current);
    sleepTimeoutCommitRef.current = setTimeout(() => setIdleSleepTimeout(value), 300);
  }, [setIdleSleepTimeout]);

  useEffect(() => {
    setSelectedAnimationId(availableAnimations[0].id);
  }, [availableAnimations]);

  useEffect(() => {
    setDraftFaceScale(robotFaceScale);
  }, [robotFaceScale]);

  useEffect(() => {
    setDraftSleepTimeout(idleSleepTimeout);
  }, [idleSleepTimeout]);

  useEffect(() => {
    return () => {
      if (faceScaleCommitRef.current) clearTimeout(faceScaleCommitRef.current);
      if (sleepTimeoutCommitRef.current) clearTimeout(sleepTimeoutCommitRef.current);
    };
  }, []);

  const handleAnimationPreview = (action: 'special' | 'nod' | 'bob' | 'blink', id?: number) => {
    window.dispatchEvent(new CustomEvent('curio:minimize-settings', { detail: { duration: 2500 } }));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('curio:preview-animation', {
        detail: action === 'special' ? { action, id } : { action },
      }));
    }, 100);
  };

  return (
    <SettingsSection title="Robot" icon={<Bot size={18} className="text-indigo-500" />}>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex flex-col">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Sparkles size={14} className="text-indigo-500" />
              Face Style
            </span>
            <span className="text-[10px] italic text-slate-400">Choose Curio&apos;s look</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {FACE_STYLES.map((faceStyle) => (
              <button
                key={faceStyle.id}
                onClick={() => setFaceStyleId(faceStyle.id)}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-all active:scale-95 ${
                  faceStyleId === faceStyle.id
                    ? 'bg-indigo-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{faceStyle.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2.5 rounded-xl bg-slate-50/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Maximize size={14} className="text-indigo-500" />
                Face Size
              </span>
              <span className="text-[10px] italic text-slate-400">Resize the robot face to fit this screen</span>
            </div>
            <button
              type="button"
              onClick={() => setRobotFaceScale(DEFAULT_ROBOT_FACE_SCALE)}
              disabled={robotFaceScale === DEFAULT_ROBOT_FACE_SCALE}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-100 disabled:cursor-default disabled:opacity-50 active:scale-95"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Scale</span>
              <span className="text-xs font-bold tabular-nums text-slate-500">{draftFaceScale}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="150"
              step="5"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-indigo-500"
              value={draftFaceScale}
              onChange={(event) => {
                const nextValue = parseInt(event.target.value, 10);
                setDraftFaceScale(nextValue);
                commitFaceScale(nextValue);
              }}
            />
          </div>
        </div>

        <RobotColorThemeSection
          robotColorThemeId={robotColorThemeId}
          customRobotColor={customRobotColor}
          setRobotColorThemeId={setRobotColorThemeId}
          setCustomRobotColor={setCustomRobotColor}
        />

        <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 pt-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <Sparkles size={12} className="text-indigo-400" />
              Special Effects
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <label className="pl-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Animation Preview</label>
              <p className="pl-1 text-[9px] italic text-slate-400">Settings hide briefly so you can see the face animate.</p>
              <div className="flex gap-2">
                <select
                  className="flex-1 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  value={selectedAnimationId}
                  onChange={(event) => setSelectedAnimationId(parseInt(event.target.value, 10))}
                >
                  {availableAnimations.map((animation) => (
                    <option key={animation.id} value={animation.id}>
                      {animation.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleAnimationPreview('special', selectedAnimationId)}
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-sm transition-all hover:bg-indigo-600 active:scale-95"
                  title="Play Animation"
                >
                  <Play size={18} fill="currentColor" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-slate-200/50 pt-3">
              <button
                onClick={() => handleAnimationPreview('nod')}
                className="flex flex-col items-center gap-1 rounded-lg border border-slate-100 bg-white py-2 text-[10px] font-bold text-slate-600 shadow-sm transition-colors hover:border-indigo-100 hover:bg-indigo-50"
              >
                <ArrowUpDown size={14} className="text-indigo-400" />
                Nod
              </button>
              <button
                onClick={() => handleAnimationPreview('bob')}
                className="flex flex-col items-center gap-1 rounded-lg border border-slate-100 bg-white py-2 text-[10px] font-bold text-slate-600 shadow-sm transition-colors hover:border-indigo-100 hover:bg-indigo-50"
              >
                <Maximize size={14} className="text-indigo-400" />
                Bob
              </button>
              <button
                onClick={() => handleAnimationPreview('blink')}
                className="flex flex-col items-center gap-1 rounded-lg border border-slate-100 bg-white py-2 text-[10px] font-bold text-slate-600 shadow-sm transition-colors hover:border-indigo-100 hover:bg-indigo-50"
              >
                <Eye size={14} className="text-indigo-400" />
                Blink
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <SettingsToggle
            label="Face Tracking"
            description="Robot eyes follow your face (higher CPU)"
            enabled={faceTrackingEnabled}
            onToggle={() => setFaceTrackingEnabled(!faceTrackingEnabled)}
            color="bg-cyan-500"
            icon={<Eye size={14} className="text-cyan-500" />}
          />

          {faceStyleId === 'bender' && (
            <SettingsToggle
              label="Bender Sound Effects"
              description="Play Bender voice clips on connect, disconnect, and mid-conversation"
              enabled={benderSoundsEnabled}
              onToggle={() => setBenderSoundsEnabled(!benderSoundsEnabled)}
              color="bg-orange-500"
              icon={<Volume2 size={14} className="text-orange-500" />}
            />
          )}

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Timer size={14} className="text-cyan-500" />
                Idle Sleep Timer
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="10"
                  max="600"
                  className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-sm font-bold text-slate-700 outline-none focus:border-cyan-400"
                  value={idleSleepTimeout}
                  onChange={(event) => setIdleSleepTimeout(parseInt(event.target.value, 10) || 120)}
                  onKeyDown={(event) => event.stopPropagation()}
                />
                <span className="text-[10px] font-bold text-slate-400">sec</span>
              </div>
            </div>
            <input
              type="range"
              min="10"
              max="600"
              step="10"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-cyan-500"
              value={draftSleepTimeout}
              onChange={(event) => {
                const nextValue = parseInt(event.target.value, 10);
                setDraftSleepTimeout(nextValue);
                commitSleepTimeout(nextValue);
              }}
            />
          </div>
        </div>
      </div>
    </SettingsSection>
  );
};

export default React.memo(RobotSection);
