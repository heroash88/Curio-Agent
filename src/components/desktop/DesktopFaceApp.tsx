import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Captions, MessageSquare, Send } from 'lucide-react';
import { getCurioDesktopBridge } from '../../desktop/desktopBridge';
import { useTransparentDesktopSurface } from '../../desktop/useTransparentDesktopSurface';
import type { DesktopFaceSnapshot } from '../../desktop/desktopTypes';
import {
  DEFAULT_DESKTOP_FACE_SCALE,
  getDesktopFaceScale,
  getFaceStyleId,
  useDesktopFaceScale,
  useFaceTrackingEnabled,
  useIdleSleepTimeout,
  useLowPowerMode,
  useThemeMode,
  useDesktopSubtitlesEnabled,
  useDesktopTextInputEnabled,
} from '../../utils/settingsStorage';

const LazyCurioFace = lazy(() => import('../curio/CurioFace').then((m) => ({ default: m.CurioFace })));
const LazyAstroFace = lazy(() => import('../curio/AstroFace').then((m) => ({ default: m.AstroFace })));
const LazyKiroFace = lazy(() => import('../curio/KiroFace').then((m) => ({ default: m.KiroFace })));
const LazyBenderFace = lazy(() => import('../curio/BenderFace'));

const DesktopFaceApp: React.FC = () => {
  useTransparentDesktopSurface();
  const bridge = useMemo(() => getCurioDesktopBridge(), []);

  const themeMode = useThemeMode();
  const lowPowerMode = useLowPowerMode();
  const faceTrackingEnabled = useFaceTrackingEnabled();
  const idleSleepTimeout = useIdleSleepTimeout();
  const desktopFaceScale = useDesktopFaceScale();
  const desktopTextInputEnabled = useDesktopTextInputEnabled();
  const desktopSubtitlesEnabled = useDesktopSubtitlesEnabled();
  const [snapshot, setSnapshot] = useState<DesktopFaceSnapshot | null>(null);
  const [textInputOpen, setTextInputOpen] = useState(false);
  const [subtitlesOpen, setSubtitlesOpen] = useState(false);
  const [text, setText] = useState('');
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    dragging: boolean;
  } | null>(null);

  useEffect(() => bridge.onFaceSnapshot(setSnapshot), [bridge]);

  const face = snapshot ?? {
    faceStyleId: getFaceStyleId(),
    state: 'idle' as const,
    activeCard: null,
    emotionHint: null,
    lowPowerMode,
    faceTrackingEnabled,
    idleSleepTimeout,
    themeMode,
    robotFaceScale: getDesktopFaceScale() || DEFAULT_DESKTOP_FACE_SCALE,
    faceTrackingSample: null,
    speakerName: null,
    subtitleText: null,
    subtitleSpeaker: null,
    isConnected: false,
    isConnecting: false,
    isSpeaking: false,
  };

  const scale = snapshot?.robotFaceScale ?? desktopFaceScale;
  const faceSize = useMemo(() => {
    const normalized = Math.max(60, Math.min(600, scale));
    // The Electron window reserves subtitle/input space outside the
    // face slot, so faceSize only has to fit the face area itself.
    return `min(calc(100dvw - 16px), ${Math.round(normalized * 2.4)}px)`;
  }, [scale]);

  useEffect(() => {
    bridge.sendFaceCommand({ type: 'layout-changed', textInputOpen, subtitleOpen: subtitlesOpen });
  }, [bridge, subtitlesOpen, textInputOpen]);

  const handleFacePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      lastX: event.screenX,
      lastY: event.screenY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleFacePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const totalDx = event.screenX - drag.startX;
    const totalDy = event.screenY - drag.startY;
    if (!drag.dragging && Math.hypot(totalDx, totalDy) < 4) return;

    drag.dragging = true;
    const dx = event.screenX - drag.lastX;
    const dy = event.screenY - drag.lastY;
    drag.lastX = event.screenX;
    drag.lastY = event.screenY;
    if (dx || dy) {
      bridge.sendFaceCommand({ type: 'drag-by', dx, dy });
    }
  };

  const handleFacePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      window.setTimeout(() => {
        dragRef.current = null;
      }, 0);
    }
  };

  const handleFaceClick = () => {
    if (dragRef.current?.dragging) return;
    bridge.sendFaceCommand({ type: 'activate' });
  };

  const handleFaceContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!desktopTextInputEnabled) return;
    setTextInputOpen((open) => !open);
  };

  const submitText = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    bridge.sendFaceCommand({ type: 'submit-text', text: trimmed });
    setText('');
    setTextInputOpen(false);
  };

  const renderFace = () => (
    <Suspense fallback={null}>
      {face.faceStyleId === 'astro' ? (
        <LazyAstroFace
          state={face.state}
          activeCard={face.activeCard}
          className="h-full w-full"
          lowPowerMode={face.lowPowerMode}
          faceTrackingEnabled={false}
          idleSleepTimeout={face.idleSleepTimeout}
          emotionHint={face.emotionHint}
        />
      ) : face.faceStyleId === 'kiro' ? (
        <LazyKiroFace
          state={face.state}
          activeCard={face.activeCard}
          className="h-full w-full"
          lowPowerMode={face.lowPowerMode}
          faceTrackingEnabled={false}
          idleSleepTimeout={face.idleSleepTimeout}
          emotionHint={face.emotionHint}
        />
      ) : face.faceStyleId === 'bender' ? (
        <LazyBenderFace
          state={face.state}
          className="h-full w-full"
          lowPowerMode={face.lowPowerMode}
          faceTrackingEnabled={false}
          idleSleepTimeout={face.idleSleepTimeout}
          emotionHint={face.emotionHint}
        />
      ) : (
        <LazyCurioFace
          state={face.state}
          className="h-full w-full"
          lowPowerMode={face.lowPowerMode}
          faceTrackingEnabled={false}
          idleSleepTimeout={face.idleSleepTimeout}
          emotionHint={face.emotionHint}
        />
      )}
    </Suspense>
  );

  return (
    <div
      className="relative flex h-dvh w-dvw flex-col items-center overflow-hidden bg-transparent p-1 text-slate-100"
      data-theme={face.themeMode}
    >
      {desktopSubtitlesEnabled && subtitlesOpen && face.subtitleText && (
        <div className="z-10 mb-1 w-[min(96vw,640px)] flex-none rounded-2xl border border-white/12 bg-black/62 px-4 py-2.5 text-center shadow-2xl backdrop-blur-2xl [-webkit-app-region:no-drag]">
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-200/90">
            {face.subtitleSpeaker === 'user' ? 'You' : 'Curio'}
          </div>
          <div className="max-h-16 overflow-y-auto text-sm font-semibold leading-snug text-white">
            {face.subtitleText}
          </div>
        </div>
      )}

      <div className="relative flex flex-1 items-center justify-center">
        <button
          className="relative z-10 flex cursor-grab items-center justify-center rounded-full transition-transform duration-300 active:cursor-grabbing active:scale-95"
          style={{ width: faceSize, height: faceSize }}
          onPointerDown={handleFacePointerDown}
          onPointerMove={handleFacePointerMove}
          onPointerUp={handleFacePointerUp}
          onPointerCancel={handleFacePointerUp}
          onClick={handleFaceClick}
          onContextMenu={handleFaceContextMenu}
          aria-label="Activate Curio"
          title="Click to activate, right-click to type, hold and drag to move"
        >
          {renderFace()}
        </button>
      </div>

      {desktopTextInputEnabled && textInputOpen && (
        <form
          className="relative z-20 mt-1 w-[min(96vw,640px)] flex-none rounded-3xl border border-white/12 bg-black/62 p-3 shadow-2xl backdrop-blur-2xl [-webkit-app-region:no-drag]"
          onSubmit={submitText}
        >
          <textarea
            className="h-20 w-full resize-none rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-medium leading-snug text-white outline-none placeholder:text-white/45 focus:border-sky-300/45"
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setTextInputOpen(false);
              }
            }}
            placeholder="Write to Curio..."
            aria-label="Message Curio"
            autoFocus
          />
          <div className="mt-1.5 flex items-center justify-end gap-2">
            <button
              className="rounded-full px-3 py-1.5 text-xs font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
              type="button"
              onClick={() => setTextInputOpen(false)}
            >
              Cancel
            </button>
            <button
              className="flex h-8 items-center gap-1.5 rounded-full bg-sky-400 px-3.5 text-xs font-bold text-slate-950 shadow-lg transition active:scale-95 disabled:opacity-50"
              type="submit"
              disabled={!text.trim()}
              aria-label="Send message"
              title="Send"
            >
              <Send size={13} />
              Send
            </button>
          </div>
        </form>
      )}

      {(desktopTextInputEnabled || desktopSubtitlesEnabled) && (
        <div className="absolute bottom-2 right-2 z-40 flex items-center gap-2 [-webkit-app-region:no-drag]">
          {desktopSubtitlesEnabled && (
            <button
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/12 shadow-lg backdrop-blur-xl transition active:scale-95 ${
                subtitlesOpen ? 'bg-sky-400 text-slate-950' : 'bg-black/34 text-white hover:bg-black/46'
              }`}
              onClick={() => setSubtitlesOpen((open) => !open)}
              aria-label="Toggle floating subtitles"
              title="Subtitles"
            >
              <Captions size={16} />
            </button>
          )}
          {desktopTextInputEnabled && (
            <button
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/12 shadow-lg backdrop-blur-xl transition active:scale-95 ${
                textInputOpen ? 'bg-sky-400 text-slate-950' : 'bg-black/34 text-white hover:bg-black/46'
              }`}
              onClick={() => setTextInputOpen((open) => !open)}
              aria-label="Open text input"
              title="Message Curio"
            >
              <MessageSquare size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DesktopFaceApp;
