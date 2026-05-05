import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCardManager } from '../../contexts/CardManagerContext';
import { interceptToolCall } from '../../services/cardInterceptor';
import type {
  CardComponentProps,
  DeviceCardData,
  DeviceSupportedAction,
} from '../../services/cardTypes';
import { resolveSupportedToolName } from '../../services/haWidgetSupport';
import { getHaPreparedSession } from '../../services/haMcpService';
import { getHaMcpUrl, getHaMcpTokenAsync } from '../../utils/settingsStorage';
import { useCardTheme } from '../../hooks/useCardTheme';

function getToggleAction(state: string, actions: DeviceSupportedAction[]): DeviceSupportedAction | null {
  const n = state.toLowerCase();
  if (n === 'on') return actions.includes('turn_off') ? 'turn_off' : actions.includes('toggle') ? 'toggle' : null;
  return actions.includes('turn_on') ? 'turn_on' : actions.includes('toggle') ? 'toggle' : null;
}
function getLockAction(state: string, actions: DeviceSupportedAction[]): DeviceSupportedAction | null {
  const n = state.toLowerCase();
  return n === 'locked'
    ? (actions.includes('unlock') ? 'unlock' : null)
    : (actions.includes('lock') ? 'lock' : null);
}
function actionLabel(a: DeviceSupportedAction): string {
  return ({ turn_on:'Turn On', turn_off:'Turn Off', toggle:'Toggle', lock:'Lock', unlock:'Unlock', open_cover:'Open', close_cover:'Close', stop_cover:'Stop' } as Record<string,string>)[a] || a;
}
const DOMAIN_ICON: Record<string, string> = { light:'💡', switch:'⚡', fan:'🌀', lock:'🔒', cover:'🪟', climate:'🌡️', vacuum:'🧹' };
const DOMAIN_ACCENT: Record<string, { on: string; bg: string }> = {
  light:  { on: 'text-amber-400',   bg: 'bg-amber-500/20' },
  switch: { on: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  fan:    { on: 'text-[#00B2FF]',    bg: 'bg-sky-500/20' },
  lock:   { on: 'text-sky-400',     bg: 'bg-sky-500/20' },
  cover:  { on: 'text-indigo-400',  bg: 'bg-indigo-500/20' },
};

/* ── Color Wheel ── */
const WHEEL_SIZE = 160;
const WHEEL_HALF = WHEEL_SIZE / 2;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100, ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const ColorWheel: React.FC<{
  onColorPick: (rgb: [number, number, number]) => void;
  sending: boolean;
}> = ({ onColorPick, sending }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pickedColor, setPickedColor] = useState<[number, number, number] | null>(null);
  const commitTimer = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cx = WHEEL_HALF, cy = WHEEL_HALF, radius = WHEEL_HALF - 4;
    ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);
    for (let angle = 0; angle < 360; angle++) {
      const startAngle = (angle - 1) * Math.PI / 180;
      const endAngle = (angle + 1) * Math.PI / 180;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(1, `hsl(${angle}, 100%, 50%)`);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }, []);

  useEffect(() => () => { if (commitTimer.current) window.clearTimeout(commitTimer.current); }, []);

  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const dx = x - WHEEL_HALF, dy = y - WHEEL_HALF;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = WHEEL_HALF - 4;
    if (dist > radius) return;
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    const sat = Math.round((dist / radius) * 100);
    const rgb = hslToRgb(angle, sat, 50);
    setPickedColor(rgb);
    if (commitTimer.current) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => onColorPick(rgb), 400);
  }, [onColorPick]);

  const dragging = useRef(false);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleInteraction(e.clientX, e.clientY);
  }, [handleInteraction]);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragging.current) handleInteraction(e.clientX, e.clientY);
  }, [handleInteraction]);
  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <canvas ref={canvasRef} width={WHEEL_SIZE} height={WHEEL_SIZE}
          className="rounded-full cursor-crosshair shadow-lg touch-none"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
        {sending && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="h-3 w-3 rounded-full bg-white/80 animate-pulse" />
          </div>
        )}
      </div>
      {pickedColor && (
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-full border border-white/20 shadow-md"
            style={{ backgroundColor: `rgb(${pickedColor[0]},${pickedColor[1]},${pickedColor[2]})` }} />
          <span className="text-[10px] font-mono text-slate-500">
            {pickedColor[0]}, {pickedColor[1]}, {pickedColor[2]}
          </span>
        </div>
      )}
    </div>
  );
};

/* ── Light Controls Panel ── */
type ColorMode = 'temp' | 'wheel';

const LightPanel: React.FC<{
  brightness: number; onBrightness: (v: number) => void;
  onRgbColor: (rgb: [number, number, number]) => void;
  sending: boolean; expanded: boolean; onToggleExpand: () => void;
}> = ({ brightness, onBrightness, onRgbColor, sending, expanded, onToggleExpand }) => {
  const t = useCardTheme();
  const [localBri, setLocalBri] = useState(brightness);
  const [colorMode, setColorMode] = useState<ColorMode>('temp');
  const briTimer = useRef<number | null>(null);

  const commitBri = useCallback((v: number) => {
    setLocalBri(v);
    if (briTimer.current) window.clearTimeout(briTimer.current);
    briTimer.current = window.setTimeout(() => onBrightness(v), 350);
  }, [onBrightness]);

  useEffect(() => () => { if (briTimer.current) window.clearTimeout(briTimer.current); }, []);

  const TEMPS = [
    { label: 'Cool',  color: '#87CEEB', rgb: '135,206,235' },
    { label: 'White', color: '#FFFFFF', rgb: '255,255,255' },
    { label: 'Warm',  color: '#FFD580', rgb: '255,213,128' },
    { label: 'Cozy',  color: '#FF8C42', rgb: '255,140,66' },
  ];

  return (
    <div className="mt-3 space-y-3">
      {/* Brightness slider */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-amber-400/60">☀</span>
        <div className="flex-1 relative">
          <input type="range" min={1} max={100} value={localBri}
            onChange={(e) => commitBri(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none bg-gradient-to-r from-amber-900/40 to-amber-400/40 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-amber-300/50" />
        </div>
        <span className={`text-[11px] font-bold ${t.muted} tabular-nums w-8 text-right`}>{localBri}%</span>
        {sending && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />}
      </div>

      {/* Color toggle */}
      <button onClick={onToggleExpand}
        className={`w-full flex items-center justify-center gap-1.5 rounded-xl ${t.panel} py-1.5 text-[10px] font-semibold ${t.faint} hover:${t.panel} transition-all active:scale-[0.98]`}>
        <span>🎨</span> {expanded ? 'Hide Colors' : 'Colors'}
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Mode tabs */}
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            <button onClick={() => setColorMode('temp')}
              className={`flex-1 py-1.5 text-[10px] font-bold transition-all ${colorMode === 'temp' ? `${t.btn} ${t.text}` : `${t.panel} ${t.faint}`}`}>
              🌡️ Temperature
            </button>
            <button onClick={() => setColorMode('wheel')}
              className={`flex-1 py-1.5 text-[10px] font-bold transition-all ${colorMode === 'wheel' ? `${t.btn} ${t.text}` : `${t.panel} ${t.faint}`}`}>
              🌈 Color Wheel
            </button>
          </div>

          {colorMode === 'temp' && (
            <div className="flex gap-2">
              {TEMPS.map(({ label, color, rgb }) => (
                <button key={label} onClick={() => onRgbColor(rgb.split(',').map(Number) as [number, number, number])}
                  className={`flex-1 flex flex-col items-center gap-1.5 rounded-xl py-2.5 transition-all active:scale-95 ${t.panel} hover:${t.panel}`}>
                  <div className="h-6 w-6 rounded-full shadow-lg" style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}40` }} />
                  <span className={`text-[9px] font-bold ${t.muted}`}>{label}</span>
                </button>
              ))}
            </div>
          )}

          {colorMode === 'wheel' && (
            <ColorWheel onColorPick={onRgbColor} sending={sending} />
          )}
        </div>
      )}
    </div>
  );
};

/* ── DeviceCard ── */
const DeviceCard: React.FC<CardComponentProps> = ({ card }) => {
  const t = useCardTheme();
  const { dispatch } = useCardManager();
  const d = card.data as unknown as DeviceCardData;
  const [data, setData] = useState(d);
  const [actions, setActions] = useState<DeviceSupportedAction[]>(d.supportedActions);
  const [inFlight, setInFlight] = useState<DeviceSupportedAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [lightSending, setLightSending] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const errorTimerRef = useRef<number | null>(null);

  useEffect(() => () => { if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current); }, []);

  useEffect(() => { setData(d); setActions(d.supportedActions); }, [d]);

  useEffect(() => {
    let c = false;
    (async () => {
      if (!data.entityId || data.controlKind === 'readonly' || !data.supportedActions.length) { if (!c) setActions([]); return; }
      try {
        const s = await getHaPreparedSession();
        if (!s) { if (!c) setActions([]); return; }
        if (!c) setActions(data.supportedActions.filter(a => Boolean(resolveSupportedToolName(s.toolNames, a, data.domain))));

        // Delay state refresh to allow pending REST actions (e.g. from offline
        // speech) to propagate through HA before we fetch the real state.
        await new Promise(r => setTimeout(r, 1000));

        // Refresh entity state to get the latest
        if (!c && data.entityId) {
          const refreshed = await s.client.refreshEntityState(data.entityId, { silent: true });
          if (!c && refreshed?.state) {
            const newState = refreshed.state;
            if (newState !== data.resolvedState && newState !== data.state) {
              update({ ...data, resolvedState: newState } as unknown as DeviceCardData);
            }
          }
        }
      } catch { if (!c) setActions([]); }
    })();
    return () => { c = true; };
  }, [data.controlKind, data.domain, data.entityId, data.supportedActions]);

  const state = data.resolvedState || data.state || 'ok';
  const isOn = state.toLowerCase() === 'on';
  const isLocked = state.toLowerCase() === 'locked';
  const isLight = data.domain === 'light';
  const accent = DOMAIN_ACCENT[data.domain] || { on: 'text-emerald-400', bg: 'bg-emerald-500/20' };
  const icon = DOMAIN_ICON[data.domain] || '⚡';

  const primary = useMemo(() => {
    if (data.controlKind === 'toggle') return getToggleAction(state, actions);
    if (data.controlKind === 'lock') return getLockAction(state, actions);
    return null;
  }, [actions, data.controlKind, state]);

  const covers = useMemo(() =>
    data.controlKind === 'cover' ? (['open_cover','close_cover','stop_cover'] as DeviceSupportedAction[]).filter(a => actions.includes(a)) : [],
  [actions, data.controlKind]);

  const update = useCallback((nd: DeviceCardData) => {
    setData(nd); setError(null);
    dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, data: nd as unknown as Partial<typeof card.data> } });
  }, [card.id, dispatch]);

  const doAction = useCallback(async (a: DeviceSupportedAction) => {
    if (inFlight || !data.entityId) return;
    setInFlight(a); setError(null);
    try {
      const s = await getHaPreparedSession();
      if (!s) return;
      const tn = resolveSupportedToolName(s.toolNames, a, data.domain);
      if (!tn) return;
      const gtn = `homeassistant__${tn.replace(/\./g, '__')}`;
      const toolArgs: Record<string, string> = { entity_id: data.entityId };
      // Hass-style tools (HassTurnOn etc.) need 'name' — look up the friendly name
      if (tn.startsWith('Hass')) {
        const entity = s.client.entityCache.find(e => e.entity_id === data.entityId);
        if (entity) toolArgs.name = entity.name;
      }
      const r = await s.client.callTool(gtn, toolArgs);
      // Optimistically update the card state immediately
      const expectedState = a === 'turn_on' ? 'on'
        : a === 'turn_off' ? 'off'
        : (a === 'toggle') ? (isOn ? 'off' : 'on')
        : a === 'lock' ? 'locked'
        : a === 'unlock' ? 'unlocked'
        : state;
      update({ ...data, state: expectedState, resolvedState: expectedState } as unknown as DeviceCardData);
      // Only apply server response if it confirms the expected state
      // (HA state propagation can lag, causing a stale state to overwrite the optimistic update)
      const uc = interceptToolCall(gtn, toolArgs, r, s.client.entityCache);
      if (uc?.type === 'device') {
        const serverState = (uc.data as unknown as DeviceCardData).resolvedState || (uc.data as unknown as DeviceCardData).state;
        if (serverState === expectedState) {
          update(uc.data as unknown as DeviceCardData);
        }
      }
    } catch { setError('Action failed'); errorTimerRef.current = window.setTimeout(() => setError(null), 3000); }
    finally { setInFlight(null); }
  }, [inFlight, data.entityId, data.domain, update]);

  const sendLightParam = useCallback(async (params: Record<string, unknown>) => {
    if (!data.entityId || data.domain !== 'light') return;
    setLightSending(true);
    try {
      const s = await getHaPreparedSession();
      if (!s) return;

      // Prefer domain-specific light.turn_on tool for brightness/color params.
      // Generic Hass intent tools (HassTurnOn) don't pass service data like rgb_color.
      const domainTool = resolveSupportedToolName(s.toolNames, 'turn_on', 'light');
      const isDomainTool = domainTool && !domainTool.startsWith('Hass');

      if (isDomainTool) {
        // Use the domain-specific tool (light.turn_on) — it supports all params
        const lightArgs: Record<string, unknown> = { entity_id: data.entityId, ...params };
        await s.client.callTool(`homeassistant__${domainTool.replace(/\./g, '__')}`, lightArgs);
      } else {
        // MCP mode with only HassTurnOn — fall back to direct REST call for light params
        const url = getHaMcpUrl().replace(/\/+$/, '');
        const token = await getHaMcpTokenAsync();
        const body: Record<string, unknown> = { entity_id: data.entityId, ...params };
        // Parse comma-separated color values into arrays for HA REST API
        if (typeof body.rgb_color === 'string') {
          body.rgb_color = (body.rgb_color as string).split(',').map(v => parseInt(v.trim(), 10));
        }
        if (typeof body.hs_color === 'string') {
          body.hs_color = (body.hs_color as string).split(',').map(v => parseFloat(v.trim()));
        }
        await fetch(`${url}/api/services/light/turn_on`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
    } catch (e) { console.warn('[DeviceCard] Light param failed:', e); }
    finally { setLightSending(false); }
  }, [data.entityId, data.domain]);

  const handleBrightness = useCallback((pct: number) => { setBrightness(pct); sendLightParam({ brightness: Math.round(pct * 2.55) }); }, [sendLightParam]);
  const handleRgbColor = useCallback((rgb: [number, number, number]) => { sendLightParam({ rgb_color: `${rgb[0]},${rgb[1]},${rgb[2]}` }); }, [sendLightParam]);

  return (
    <div className="card-glass overflow-hidden">
      {/* Accent bar */}
      {isOn && <div className={`h-1 w-full ${isLight ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-orange-400' : 'bg-emerald-500'}`} />}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl shrink-0 transition-all duration-300 ${isOn ? accent.bg : t.panel}`}>
              <span className="text-xl">{icon}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold font-headline truncate">{data.friendlyName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`h-1.5 w-1.5 rounded-full ${isOn ? 'bg-emerald-400' : `${t.faint}`}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isOn ? accent.on : t.faint}`}>{state}</span>
              </div>
            </div>
          </div>

          {/* Toggle */}
          {data.controlKind === 'toggle' && primary && (
            <button onClick={() => void doAction(primary)} disabled={Boolean(inFlight)}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-all duration-300 active:scale-95 disabled:opacity-50 ${isOn ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]' : t.btn}`}>
              <div className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-lg transition-all duration-300 ${isOn ? 'left-7' : 'left-1'} ${inFlight ? 'animate-pulse' : ''}`} />
            </button>
          )}

          {/* Lock */}
          {data.controlKind === 'lock' && primary && (
            <button onClick={() => void doAction(primary)} disabled={Boolean(inFlight)}
              className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 ${isLocked ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'}`}>
              <span>{isLocked ? '🔒' : '🔓'}</span>
              {inFlight ? '...' : isLocked ? 'Locked' : 'Unlocked'}
            </button>
          )}
        </div>

        {/* Cover controls */}
        {covers.length > 0 && (
          <div className="flex gap-2 mt-4">
            {covers.map(a => (
              <button key={a} onClick={() => void doAction(a)} disabled={Boolean(inFlight)}
                className={`flex-1 rounded-xl ${t.btn} border ${t.panelBorder} py-2.5 text-xs font-bold ${t.text2} transition-all active:scale-95 disabled:opacity-50`}>
                {inFlight === a ? '...' : actionLabel(a)}
              </button>
            ))}
          </div>
        )}

        {/* Light controls */}
        {isLight && isOn && (
          <LightPanel brightness={brightness} onBrightness={handleBrightness}
            onRgbColor={handleRgbColor}
            sending={lightSending} expanded={showColors} onToggleExpand={() => setShowColors(v => !v)} />
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-500/15 border border-rose-500/20 px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            <p className="text-[11px] font-semibold text-rose-300">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(DeviceCard);
