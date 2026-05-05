import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CardComponentProps, CameraCardData } from '../../services/cardTypes';

interface CamEntity { entity_id: string; name: string }

async function fetchSnapshotBlob(baseUrl: string, token: string, entityId: string): Promise<string> {
  const url = baseUrl.replace(/\/api\/mcp\/?$/, '').replace(/\/$/, '');
  try {
    const r = await fetch(`${url}/api/camera_proxy/${entityId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (r.ok) { const b = await r.blob(); return URL.createObjectURL(b); }
  } catch {}
  return '';
}

const POLL_MS = 1500;

const CameraCard: React.FC<CardComponentProps> = ({ card, onDismiss, onInteractionStart, onInteractionEnd }) => {
  const data = card.data as unknown as CameraCardData;
  const [entityId, setEntityId] = useState(data.entityId);
  const [camName, setCamName] = useState(data.cameraName);
  const [imgSrc, setImgSrc] = useState(data.snapshotUrl || '');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [cameras, setCameras] = useState<CamEntity[]>(data.cameras || []);
  const [showPicker, setShowPicker] = useState(false);
  const alive = useRef(true);
  const pollRef = useRef<number | null>(null);
  const imgSrcRef = useRef(imgSrc); // track for cleanup
  imgSrcRef.current = imgSrc;

  // Cleanup blob URLs and intervals on unmount
  useEffect(() => {
    // Reset alive on each mount (handles React StrictMode double-mount)
    alive.current = true;
    return () => {
      alive.current = false;
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      // Revoke last blob URL
      if (imgSrcRef.current?.startsWith('blob:')) URL.revokeObjectURL(imgSrcRef.current);
    };
  }, []);

  // Loading timeout — show error if no frame arrives within 8 seconds
  useEffect(() => {
    if (!loading) return;
    const timeout = window.setTimeout(() => {
      if (loading && !imgSrc && alive.current) {
        setError(true); setLoading(false);
      }
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [loading, imgSrc]);

  // Update cameras if card data changes (e.g. card re-emitted)
  useEffect(() => {
    if (data.cameras && data.cameras.length > 0) setCameras(data.cameras);
  }, [data.cameras]);

  // Listen for frames shared by liveApiLive's startHaCameraStream
  const entityIdRef = useRef(entityId);
  entityIdRef.current = entityId;
  const receivedFrameRef = useRef(false); // tracks whether we've received at least one live frame
  const lastFrameRef = useRef(0); // start at 0 so fallback polling kicks in immediately if no shared frames arrive

  useEffect(() => {
    const handler = (e: Event) => {
      const { entityId: frameEntityId, blob } = (e as CustomEvent).detail;
      if (!alive.current || !blob) return;
      if (frameEntityId !== entityIdRef.current) return;
      const blobUrl = URL.createObjectURL(blob);
      setImgSrc(prev => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return blobUrl; });
      setError(false); setLoading(false);
      receivedFrameRef.current = true;
      lastFrameRef.current = Date.now();
    };
    window.addEventListener('ha-camera-frame', handler);
    return () => window.removeEventListener('ha-camera-frame', handler);
  }, []);

  // Fallback polling: if no shared frames arrive within 4s, poll independently
  // (handles case where startHaCameraStream isn't running)
  const pollArgsRef = useRef({ entityId, haUrl: data.haUrl, haToken: data.haToken });
  pollArgsRef.current = { entityId, haUrl: data.haUrl, haToken: data.haToken };

  // lastFrameRef is updated directly in the ha-camera-frame handler above,
  // NOT from imgSrc changes, so the fallback poll correctly detects when shared frames stop.

  useEffect(() => {
    if (!entityId || !data.haUrl || !data.haToken) return;

    // Fallback poll: only fetch if no shared frame arrived recently
    const id = window.setInterval(async () => {
      if (!alive.current) return;
      const elapsed = Date.now() - lastFrameRef.current;
      if (elapsed < 3000) return; // shared frames are arriving, skip
      const { entityId: eid, haUrl, haToken } = pollArgsRef.current;
      if (!eid || !haUrl || !haToken) return;
      const blobUrl = await fetchSnapshotBlob(haUrl, haToken, eid);
      if (!blobUrl) return;
      if (!alive.current) { URL.revokeObjectURL(blobUrl); return; }
      setImgSrc(prev => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return blobUrl; });
      setError(false); setLoading(false);
    }, POLL_MS);
    pollRef.current = id;

    return () => { window.clearInterval(id); pollRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, data.haUrl, data.haToken]);

  const switchCam = useCallback((eid: string) => {
    const c = cameras.find(x => x.entity_id === eid);
    // Revoke current blob URL before switching
    if (imgSrcRef.current?.startsWith('blob:')) URL.revokeObjectURL(imgSrcRef.current);
    // Update ref immediately so the frame handler accepts frames for the new entity
    entityIdRef.current = eid;
    setEntityId(eid); setCamName(c?.name || eid); setShowPicker(false); setLoading(true); setError(false); setImgSrc('');
    // Reset frame timestamp so fallback poll kicks in immediately for new camera
    lastFrameRef.current = 0;
    receivedFrameRef.current = false;
    // Update poll args ref immediately too
    if (data.haUrl && data.haToken) {
      pollArgsRef.current = { entityId: eid, haUrl: data.haUrl, haToken: data.haToken };
    }
    // Tell liveApiLive to switch its HA camera stream to the new entity
    if (data.haUrl && data.haToken) {
      window.dispatchEvent(new CustomEvent('ha-camera-switch', {
        detail: { entityId: eid, baseUrl: data.haUrl, token: data.haToken },
      }));
      // Immediate fetch so the user sees the new camera right away
      fetchSnapshotBlob(data.haUrl, data.haToken, eid).then(blobUrl => {
        if (blobUrl && alive.current) {
          setImgSrc(prev => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return blobUrl; });
          setError(false); setLoading(false);
        }
      }).catch(() => {
        // Fallback polling will handle it
      });
    }
  }, [cameras, data.haUrl, data.haToken]);

  const toggleExpand = useCallback(() => {
    onInteractionStart();
    setExpanded(v => !v);
    setTimeout(onInteractionEnd, 300);
  }, [onInteractionStart, onInteractionEnd]);

  // Shared header
  const header = (
    <div className="relative z-10 flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="card-glass-icon bg-red-500/20">
          <span>📹</span>
        </div>
        <div className="min-w-0">
          <p className="card-glass-title truncate drop-shadow-lg">{camName}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[8px] font-black uppercase tracking-[0.15em] text-red-400/90 drop-shadow-sm">Live</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {cameras.length > 1 && (
          <button onClick={() => setShowPicker(v => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-white/70 hover:bg-white/20 transition-all active:scale-90">
            <span className="text-sm">📷</span>
          </button>
        )}
        <button onClick={toggleExpand}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-white/70 hover:bg-white/20 transition-all active:scale-90">
          {expanded ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          )}
        </button>
        <button onClick={(e) => { e.stopPropagation(); if (expanded) setExpanded(false); onDismiss(); }}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-white/70 hover:bg-white/20 transition-all active:scale-90"
          aria-label="Close camera">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  );

  // Shared picker
  const picker = showPicker && cameras.length > 1 ? (
    <div className="relative z-10 mx-3 mb-2 rounded-xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] overflow-hidden max-h-32 overflow-y-auto">
      {cameras.map(c => (
        <button key={c.entity_id} onClick={() => switchCam(c.entity_id)}
          className={`w-full text-left px-4 py-2 text-[11px] font-medium transition-all border-b border-white/5 last:border-0 ${c.entity_id === entityId ? 'bg-[#00B2FF]/20 text-[#00B2FF]' : 'text-white/60 hover:bg-white/10'}`}>
          📷 {c.name}
        </button>
      ))}
    </div>
  ) : null;

  // Shared feed
  const feed = (isFullHeight: boolean) => (
    <div className={`relative z-10 ${isFullHeight ? 'flex-1 min-h-0' : 'aspect-video'}`}>
      {loading && !imgSrc && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-red-400 animate-spin" />
          <p className="text-[10px] font-bold text-white/50">Connecting...</p>
        </div>
      )}
      {imgSrc && !error && (
        <img src={imgSrc} alt={camName} className={`w-full h-full object-cover ${isFullHeight ? '' : 'rounded-b-[1.25rem]'}`} onError={() => setError(true)} />
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <span className="text-3xl opacity-30">📷</span>
          <p className="text-[11px] text-white/50">Feed unavailable</p>
          <button onClick={() => { setError(false); setLoading(true); }}
            className="rounded-full bg-white/10 backdrop-blur-md px-4 py-1.5 text-[10px] font-bold text-white/50 hover:bg-white/20 active:scale-95 border border-white/[0.12]">Retry</button>
        </div>
      )}
    </div>
  );

  // Glassy background — camera feed blurred behind
  const glassyBg = (
    <div className="absolute inset-0 z-0 overflow-hidden rounded-[1.25rem]">
      {imgSrc && <div className="absolute inset-[-50%] bg-cover bg-center scale-150 blur-[80px] opacity-40" style={{ backgroundImage: `url(${imgSrc})` }} />}
      <div className="absolute inset-0 bg-white/[0.06]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50" />
    </div>
  );

  // Expanded: render via portal to escape all parent constraints
  if (expanded) {
    return (
      <>
        {/* Placeholder in the card stack */}
        <div className="w-full aspect-video rounded-[1.25rem] bg-white/[0.06] flex items-center justify-center">
          <p className="text-[10px] text-white/50">Camera expanded ↗</p>
        </div>
        {createPortal(
          <div className="fixed inset-0 z-[300] flex flex-col bg-black/90 backdrop-blur-sm" onClick={toggleExpand}>
            <div className="flex-1 flex flex-col m-4 rounded-[1.25rem] overflow-hidden border border-white/[0.12] shadow-2xl relative" onClick={e => e.stopPropagation()}>
              {glassyBg}
              {header}
              {picker}
              {feed(true)}
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  // Normal inline card
  return (
    <div className="relative overflow-hidden rounded-[1.25rem] backdrop-blur-2xl border border-white/[0.12] text-white shadow-lg w-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
      {glassyBg}
      {header}
      {picker}
      {feed(false)}
    </div>
  );
};

export default CameraCard;
