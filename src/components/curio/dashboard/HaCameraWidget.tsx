import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardRefresh } from '../../../hooks/useDashboardRefresh';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import { useHaMcpUrl, getHaMcpTokenAsync } from '../../../utils/settingsStorage';
import type { DashboardWidget, DashboardWidgetConfig } from '../../../services/dashboardTypes';
import WidgetShell from './WidgetShell';
import { WidgetBody, WidgetText } from './widgetPrimitives';
import { Camera, RefreshCw, AlertCircle, Maximize2, ChevronDown, Grid2X2 } from 'lucide-react';
import {
  getDomain,
  getFriendlyName,
  loadHaStatesCached,
  normalizeHaBaseUrl,
} from './haWidgetApi';

interface HaCameraWidgetProps {
  widget: DashboardWidget;
  focused?: boolean;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
}

interface CamEntity {
  entity_id: string;
  name: string;
}

const POLL_MS = 1500;

const HaCameraWidget: React.FC<HaCameraWidgetProps> = ({ widget, focused, onUpdateWidgetConfig }) => {
  const size = useWidgetSize(widget);
  const haUrl = useHaMcpUrl();
  const configuredEntityIds = useMemo(
    () => (Array.isArray(widget.config?.entityIds) ? widget.config.entityIds : [])
      .map((id) => String(id || '').trim().toLowerCase())
      .filter(Boolean),
    [widget.config?.entityIds],
  );
  const configuredEntityId = configuredEntityIds[0] || '';
  const [entityId, setEntityId] = useState(configuredEntityId);
  const liveMode = widget.config?.refreshMode === 'push';
  const hideChrome = widget.config?.haCameraChromeHidden === true;
  const maxPreviewCameras = size.pixelWidth >= 680 ? 4 : 2;
  const temporaryStreamSourceId = `dashboard-widget:${widget.id}`;

  const [imgUrl, setImgUrl] = useState('');
  const [cameraPreviewUrls, setCameraPreviewUrls] = useState<Record<string, string>>({});
  const [name, setName] = useState('Camera');
  const [cameras, setCameras] = useState<CamEntity[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [focusedGridOpen, setFocusedGridOpen] = useState(false);
  const [expandedCameraOpen, setExpandedCameraOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const tokenRef = useRef('');
  const baseRef = useRef('');
  const prevUrl = useRef('');
  const nameRef = useRef(name);
  const mountedRef = useRef(true);
  const entityIdRef = useRef(entityId);
  const lastFrameRef = useRef(0);
  const pollRef = useRef<number | null>(null);
  const cameraPreviewUrlsRef = useRef<Record<string, string>>({});
  const temporaryStreamEntityRef = useRef<string | null>(null);

  const getBase = useCallback(async (forceRefresh = false) => {
    if (!haUrl) return null;
    if (!baseRef.current) baseRef.current = normalizeHaBaseUrl(haUrl);
    if (forceRefresh || !tokenRef.current) {
      tokenRef.current = await getHaMcpTokenAsync(forceRefresh ? { forceRefresh: true } : undefined);
    }
    if (!tokenRef.current) return null;
    return { base: baseRef.current, token: tokenRef.current };
  }, [haUrl]);

  const applyImageUrl = useCallback((url: string) => {
    if (prevUrl.current?.startsWith('blob:')) URL.revokeObjectURL(prevUrl.current);
    prevUrl.current = url;
    setImgUrl(url);
    setError(false);
    setLoading(false);
  }, []);

  const replaceCameraPreviewUrls = useCallback((nextUrls: Record<string, string>) => {
    Object.entries(cameraPreviewUrlsRef.current).forEach(([previewEntityId, previewUrl]) => {
      if (nextUrls[previewEntityId] !== previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    });
    cameraPreviewUrlsRef.current = nextUrls;
    setCameraPreviewUrls(nextUrls);
  }, []);

  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  const fetchMeta = useCallback(async (targetEntityId = entityIdRef.current) => {
    if (!targetEntityId || !haUrl) return;
    try {
      const auth = await getBase();
      if (!auth) return;
      const { base, token } = auth;
      let res = await fetch(`${base}/api/states/${targetEntityId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        const refreshed = await getBase(true);
        if (!refreshed) return;
        res = await fetch(`${refreshed.base}/api/states/${targetEntityId}`, {
          headers: { Authorization: `Bearer ${refreshed.token}` },
        });
      }
      if (res.ok) {
        const d = await res.json();
        if (!mountedRef.current || targetEntityId !== entityIdRef.current) return;
        setName(d.attributes?.friendly_name || targetEntityId.split('.')[1] || 'Camera');
        setError(false);
      }
    } catch {
      if (mountedRef.current) setError(true);
    }
  }, [haUrl, getBase]);

  const fetchCameraObjectUrl = useCallback(async (targetEntityId = entityIdRef.current) => {
    if (!targetEntityId || !haUrl) return '';
    if (document.visibilityState === 'hidden') return '';
    const auth = await getBase();
    if (!auth) return '';
    const { base, token } = auth;
    let res = await fetch(`${base}/api/camera_proxy/${targetEntityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      const refreshed = await getBase(true);
      if (!refreshed) return '';
      res = await fetch(`${refreshed.base}/api/camera_proxy/${targetEntityId}`, {
        headers: { Authorization: `Bearer ${refreshed.token}` },
      });
    }
    if (!res.ok) {
      throw new Error(`Camera snapshot failed with ${res.status}`);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }, [getBase, haUrl]);

  const fetchImage = useCallback(async (targetEntityId = entityIdRef.current) => {
    if (!targetEntityId || !haUrl) return;
    if (document.visibilityState === 'hidden') return;
    try {
      const url = await fetchCameraObjectUrl(targetEntityId);
      if (!url) return;
      if (!mountedRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (targetEntityId !== entityIdRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      applyImageUrl(url);
    } catch {
      if (mountedRef.current) setError(true);
    }
    finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [haUrl, fetchCameraObjectUrl, applyImageUrl]);

  const dispatchStreamHandoff = useCallback(async (
    targetEntityId = entityIdRef.current,
    startIfIdle = liveMode,
    temporary = false,
  ) => {
    if (!targetEntityId || !haUrl) return;
    try {
      const auth = await getBase();
      if (!auth) return;
      window.dispatchEvent(new CustomEvent('ha-camera-switch', {
        detail: {
          entityId: targetEntityId,
          baseUrl: auth.base,
          token: auth.token,
          startIfIdle,
          ...(temporary
            ? {
              sourceId: temporaryStreamSourceId,
              temporary: true,
            }
            : {}),
        },
      }));
    } catch {
      // Snapshot fallback will surface connection errors.
    }
  }, [getBase, haUrl, liveMode, temporaryStreamSourceId]);

  const stopTemporaryStream = useCallback((targetEntityId = temporaryStreamEntityRef.current) => {
    if (!targetEntityId) return;
    window.dispatchEvent(new CustomEvent('ha-camera-stop', {
      detail: {
        entityId: targetEntityId,
        sourceId: temporaryStreamSourceId,
      },
    }));
    if (temporaryStreamEntityRef.current === targetEntityId) {
      temporaryStreamEntityRef.current = null;
    }
  }, [temporaryStreamSourceId]);

  const startTemporaryStream = useCallback((targetEntityId = entityIdRef.current) => {
    if (!targetEntityId) return;
    if (liveMode) {
      void dispatchStreamHandoff(targetEntityId, true);
      return;
    }
    temporaryStreamEntityRef.current = targetEntityId;
    void dispatchStreamHandoff(targetEntityId, true, true);
  }, [dispatchStreamHandoff, liveMode]);

  const refreshCamera = useCallback(async (background = false) => {
    if (!background) {
      await fetchMeta(entityIdRef.current);
    }
    await fetchImage(entityIdRef.current);
  }, [fetchImage, fetchMeta]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      stopTemporaryStream();
      if (prevUrl.current) {
        URL.revokeObjectURL(prevUrl.current);
        prevUrl.current = '';
      }
      replaceCameraPreviewUrls({});
    };
  }, [replaceCameraPreviewUrls, stopTemporaryStream]);

  useEffect(() => {
    baseRef.current = '';
    tokenRef.current = '';
  }, [haUrl]);

  useEffect(() => {
    if (!focused) {
      setFocusedGridOpen(false);
    }
  }, [focused]);

  useEffect(() => {
    if (configuredEntityIds.length <= 1) {
      setExpandedCameraOpen(false);
    }
  }, [configuredEntityIds.length]);

  useEffect(() => {
    if (!showPicker) return;
    const closePicker = (event: MouseEvent) => {
      if (pickerRef.current?.contains(event.target as Node)) return;
      setShowPicker(false);
    };
    const closePickerOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowPicker(false);
    };
    document.addEventListener('mousedown', closePicker);
    document.addEventListener('keydown', closePickerOnEscape);
    return () => {
      document.removeEventListener('mousedown', closePicker);
      document.removeEventListener('keydown', closePickerOnEscape);
    };
  }, [showPicker]);

  useEffect(() => {
    setEntityId(configuredEntityId);
  }, [configuredEntityId]);

  useEffect(() => {
    entityIdRef.current = entityId;
    lastFrameRef.current = 0;
    setShowPicker(false);
    if (prevUrl.current?.startsWith('blob:')) {
      URL.revokeObjectURL(prevUrl.current);
      prevUrl.current = '';
    }
    setImgUrl('');
    setError(false);
    setLoading(Boolean(entityId));
  }, [entityId]);

  useEffect(() => {
    if (!haUrl) {
      setCameras([]);
      return;
    }
    let cancelled = false;
    const loadCameras = async () => {
      try {
        const states = await loadHaStatesCached(haUrl);
        if (cancelled || !mountedRef.current) return;
        const nextCameras = states
          .filter((state) => getDomain(state.entity_id) === 'camera')
          .map((state) => ({
            entity_id: state.entity_id.toLowerCase(),
            name: getFriendlyName(state),
          }));
        if (entityId && !nextCameras.some((camera) => camera.entity_id === entityId)) {
          nextCameras.unshift({ entity_id: entityId, name: nameRef.current });
        }
        setCameras(nextCameras);
        const selected = nextCameras.find((camera) => camera.entity_id === entityId);
        if (selected) setName(selected.name);
        if (!entityId && nextCameras.length > 0) {
          const autoEntityIds = nextCameras
            .slice(0, maxPreviewCameras)
            .map((camera) => camera.entity_id);
          const primaryCamera = nextCameras[0];
          entityIdRef.current = primaryCamera.entity_id;
          setEntityId(primaryCamera.entity_id);
          setName(primaryCamera.name);
          onUpdateWidgetConfig?.(widget.id, { entityIds: autoEntityIds });
          void fetchImage(primaryCamera.entity_id);
        }
      } catch {
        if (entityId) setCameras([{ entity_id: entityId, name: nameRef.current }]);
      }
    };
    void loadCameras();
    return () => {
      cancelled = true;
    };
  }, [entityId, fetchImage, haUrl, maxPreviewCameras, onUpdateWidgetConfig, widget.id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const { entityId: frameEntityId, blob } = (event as CustomEvent).detail || {};
      if (!mountedRef.current || !blob) return;
      if (frameEntityId !== entityIdRef.current) return;
      const url = URL.createObjectURL(blob);
      applyImageUrl(url);
      lastFrameRef.current = Date.now();
    };
    window.addEventListener('ha-camera-frame', handler);
    return () => window.removeEventListener('ha-camera-frame', handler);
  }, [applyImageUrl]);

  useEffect(() => {
    if (!liveMode || !entityId || !haUrl) return;
    void dispatchStreamHandoff(entityId, true);
  }, [dispatchStreamHandoff, entityId, haUrl, liveMode]);

  useEffect(() => {
    if (liveMode || !focused || focusedGridOpen || !entityId || !haUrl) return;
    startTemporaryStream(entityId);
    return () => {
      stopTemporaryStream(entityId);
    };
  }, [entityId, focused, focusedGridOpen, haUrl, liveMode, startTemporaryStream, stopTemporaryStream]);

  useEffect(() => {
    if (!liveMode || !entityId || !haUrl) return;
    const id = window.setInterval(() => {
      if (!mountedRef.current) return;
      if (Date.now() - lastFrameRef.current < 3000) return;
      void fetchImage(entityIdRef.current);
    }, POLL_MS);
    pollRef.current = id;
    return () => {
      window.clearInterval(id);
      if (pollRef.current === id) pollRef.current = null;
    };
  }, [entityId, fetchImage, haUrl, liveMode]);

  useDashboardRefresh({
    widget,
    enabled: Boolean(entityId && haUrl),
    onRefresh: (background) => refreshCamera(background),
  });

  const switchCamera = useCallback((nextEntityId: string, forceTemporaryLive = false) => {
    if (!nextEntityId) return;
    const nextCamera = cameras.find((camera) => camera.entity_id === nextEntityId);
    const shouldStartTemporaryLive = !liveMode && (
      forceTemporaryLive || expandedCameraOpen || (focused && !focusedGridOpen)
    );
    entityIdRef.current = nextEntityId;
    setEntityId(nextEntityId);
    setName(nextCamera?.name || nextEntityId);
    setShowPicker(false);
    setFocusedGridOpen(false);
    setLoading(true);
    setError(false);
    lastFrameRef.current = 0;
    const nextEntityIds = configuredEntityIds.length > 1
      ? [nextEntityId, ...configuredEntityIds.filter((id) => id !== nextEntityId)]
      : [nextEntityId];
    onUpdateWidgetConfig?.(widget.id, { entityIds: nextEntityIds });
    if (shouldStartTemporaryLive) {
      temporaryStreamEntityRef.current = nextEntityId;
      void dispatchStreamHandoff(nextEntityId, true, true);
    } else {
      void dispatchStreamHandoff(nextEntityId, liveMode);
    }
    void fetchImage(nextEntityId);
  }, [
    cameras,
    configuredEntityIds,
    dispatchStreamHandoff,
    expandedCameraOpen,
    fetchImage,
    focused,
    focusedGridOpen,
    liveMode,
    onUpdateWidgetConfig,
    widget.id,
  ]);

  const expandCamera = useCallback((nextEntityId = entityIdRef.current) => {
    if (!nextEntityId) return;
    switchCamera(nextEntityId, true);
    setFocusedGridOpen(false);
    setExpandedCameraOpen(true);
  }, [switchCamera]);

  const showAllCameras = useCallback(() => {
    setShowPicker(false);
    stopTemporaryStream();
    setExpandedCameraOpen(false);
    if (focused) setFocusedGridOpen(true);
  }, [focused, stopTemporaryStream]);

  const configuredCameraSet = useMemo(() => new Set(configuredEntityIds), [configuredEntityIds]);
  const previewCameras = useMemo(() => {
    const configuredCameras = cameras.filter((camera) => configuredCameraSet.has(camera.entity_id));
    return (configuredCameras.length > 0 ? configuredCameras : cameras).slice(0, maxPreviewCameras);
  }, [cameras, configuredCameraSet, maxPreviewCameras]);
  const hasCameraGridSpace = (size.pixelWidth >= 420 && size.pixelHeight >= 260)
    || (Number(widget.config?.w || 0) >= 4 && Number(widget.config?.h || 0) >= 3);
  const hasMultipleConfiguredCameras = configuredEntityIds.length > 1 && previewCameras.length > 1;
  const showCameraGrid = configuredEntityIds.length > 1
    && previewCameras.length > 1
    && !hideChrome
    && !focused
    && !expandedCameraOpen
    && hasCameraGridSpace;
  const showFocusedCameraGrid = focused
    && focusedGridOpen
    && hasMultipleConfiguredCameras
    && !hideChrome;
  const shouldRenderCameraGrid = showCameraGrid || showFocusedCameraGrid;
  const temporaryLiveViewActive = !liveMode && (
    expandedCameraOpen || (focused && !focusedGridOpen)
  );
  const showLiveStatus = liveMode || temporaryLiveViewActive;
  const cameraOverlayPositionClass = focused
    ? 'top-4 sm:top-6'
    : expandedCameraOpen
      ? 'top-4 sm:top-5'
      : 'top-3';
  const cameraControlsLayoutClass = focused
    ? 'flex-nowrap opacity-100 pr-12 sm:pr-16'
    : expandedCameraOpen
      ? 'flex-nowrap opacity-100 pr-12 sm:pr-14'
      : 'flex-wrap opacity-0 pr-12 group-hover:opacity-100 sm:pr-14';

  useEffect(() => {
    if (!shouldRenderCameraGrid) {
      replaceCameraPreviewUrls({});
      return;
    }
    let cancelled = false;
    const loadPreviews = async () => {
      const results = await Promise.allSettled(
        previewCameras
          .filter((camera) => camera.entity_id !== entityIdRef.current)
          .map(async (camera) => ({
            entityId: camera.entity_id,
            url: await fetchCameraObjectUrl(camera.entity_id),
          })),
      );
      const nextUrls: Record<string, string> = {};
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.url) {
          nextUrls[result.value.entityId] = result.value.url;
        }
      });
      if (cancelled) {
        Object.values(nextUrls).forEach((url) => {
          if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        });
        return;
      }
      replaceCameraPreviewUrls(nextUrls);
    };
    void loadPreviews();
    return () => {
      cancelled = true;
    };
  }, [fetchCameraObjectUrl, previewCameras, replaceCameraPreviewUrls, shouldRenderCameraGrid]);

  const cameraSelector = cameras.length > 1 ? (
    <div ref={pickerRef} className="relative z-[70]">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setShowPicker((open) => !open);
        }}
        className={`dashboard-widget-control-button dashboard-widget-control-button-inverse relative ${
          showPicker ? 'dashboard-widget-control-button-active' : ''
        }`}
        aria-label="Select camera"
        aria-expanded={showPicker}
      >
        <Camera size={14} />
        <ChevronDown size={9} className="absolute bottom-1 right-1" />
      </button>
      {showPicker && (
        <div
          data-testid="ha-camera-picker-menu"
          className="absolute right-0 top-11 z-[80] max-h-56 w-60 overflow-y-auto rounded-2xl border border-white/15 bg-black/85 p-1.5 shadow-[0_22px_70px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
        >
          <div className="px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/40">
            Switch camera
          </div>
          {cameras.map((camera) => (
            <button
              key={camera.entity_id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                switchCamera(camera.entity_id);
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${camera.entity_id === entityId
                  ? 'bg-[var(--ether-primary)]/24 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                  : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`}
              aria-label={`Switch to ${camera.name}`}
            >
              <Camera size={13} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{camera.name}</span>
                <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">
                  {camera.entity_id}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  if (!entityId) {
    return (
      <WidgetShell widget={widget} title="Security Camera" icon={<Camera size={14} />} accent="slate">
        <WidgetBody align="center" gap="lg" className="items-center text-[var(--ether-on-surface-variant)] opacity-70">
          <Camera size={32} className="mb-2" />
          <WidgetText variant="label" tone="muted" align="center" className="px-4">
            Select a Camera in Settings
          </WidgetText>
          {cameraSelector}
        </WidgetBody>
      </WidgetShell>
    );
  }

  if (shouldRenderCameraGrid) {
    return (
      <WidgetShell
        widget={widget}
        title="Cameras"
        icon={<Camera size={14} />}
        accent="teal"
        rightSlot={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live
            </span>
            {cameraSelector}
          </div>
        }
      >
        <WidgetBody gap="lg">
          <div
            data-testid="ha-camera-grid"
            className={`grid min-h-0 flex-1 grid-cols-2 gap-3 ${focused ? 'p-4 sm:p-6' : ''}`}
          >
            {previewCameras.map((camera) => {
              const selected = camera.entity_id === entityId;
              const previewUrl = selected ? imgUrl : cameraPreviewUrls[camera.entity_id];
              return (
                <article
                  key={camera.entity_id}
                  className={`group/camera relative min-h-0 overflow-hidden rounded-2xl border bg-black text-left transition ${selected
                      ? 'border-[var(--ether-primary)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--ether-primary)_42%,transparent)]'
                      : 'border-[var(--ether-glass-border)] hover:border-[var(--ether-primary)]/35'
                    }`}
                >
                  <button
                    type="button"
                    onClick={() => switchCamera(camera.entity_id)}
                    className="absolute inset-0 text-left"
                    aria-label={`Show ${camera.name} camera`}
                    aria-pressed={selected}
                  >
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={`${camera.name} camera preview`}
                        className="absolute inset-0 h-full w-full object-contain transition duration-500"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(20,184,166,0.24),transparent_35%),linear-gradient(135deg,#0f172a,#111827_58%,#0f766e)]">
                        <Camera size={28} className="text-white/45" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/10 to-black/20" />
                    <div className="absolute left-3 right-12 top-3 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-[0.14em] ${selected ? 'bg-emerald-400 text-black' : 'bg-black/45 text-white/75 backdrop-blur'}`}>
                        {selected ? 'Viewing' : showLiveStatus ? 'Live' : 'Snapshot'}
                      </span>
                      {loading && selected && <RefreshCw size={12} className="animate-spin text-white/75" />}
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="truncate text-sm font-bold text-white drop-shadow">{camera.name}</div>
                      <div className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.18em] text-white/55">
                        {selected ? 'Now showing' : 'Tap to preview'}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      expandCamera(camera.entity_id);
                    }}
                    className="dashboard-widget-control-button dashboard-widget-control-button-inverse absolute right-3 top-3 z-20 opacity-100"
                    aria-label={`Expand ${camera.name} camera`}
                  >
                    <Maximize2 size={13} />
                  </button>
                </article>
              );
            })}
          </div>
          {!size.isCompact && !focused && (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="flex shrink-0 items-center justify-between rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
            >
              <span>View all cameras</span>
              <span aria-hidden>&gt;</span>
            </button>
          )}
        </WidgetBody>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      bare
      padded={false}
      widget={widget}
      className={`group overflow-hidden relative ${focused ? '!bg-black !border-transparent !shadow-none backdrop-blur-none rounded-none' : 'bg-black/90'}`}
      quiet={focused}
      ghost={focused}
    >
      <WidgetBody gap="none" className="relative">
        {imgUrl && !error ? (
          <>
            <img
              src={imgUrl}
              alt={name}
              className="absolute inset-0 h-full w-full object-contain transition-opacity duration-500"
            />
            {!hideChrome && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/60 pointer-events-none" />
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
            {error ? (
              <>
                <div className="rounded-full bg-rose-500/20 p-4 border border-rose-500/30">
                  <AlertCircle size={28} className="text-rose-400" />
                </div>
                <WidgetText variant="label" align="center" className="text-rose-400">Feed Offline</WidgetText>
              </>
            ) : (
              <>
                <div className="rounded-full bg-white/5 p-4 border border-white/10">
                  <RefreshCw size={28} className="animate-spin text-white/50" />
                </div>
                <WidgetText variant="label" align="center" className="text-white/50">Connecting...</WidgetText>
              </>
            )}
          </div>
        )}

        {/* ── Top Overlays ── */}
        <div
          data-testid="ha-camera-top-overlay"
          className={`absolute ${cameraOverlayPositionClass} left-3 right-3 flex justify-between items-start pointer-events-none z-10 transition-opacity duration-300 ${hideChrome && !focused
              ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              : 'opacity-100'
            }`}
        >
          <div className="flex items-center gap-2 pointer-events-auto shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-lg">
              <span className={`h-2 w-2 rounded-full ${showLiveStatus ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.9)]' : 'bg-slate-400'}`} />
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-white/90 drop-shadow">
                {showLiveStatus ? 'Live' : 'Snapshot'}
              </span>
            </div>
            {loading && (
              <div className="p-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-lg">
                <RefreshCw size={12} className="text-white/80 animate-spin" />
              </div>
            )}
          </div>

          <div role="group" aria-label="Camera controls" className={`flex items-center justify-end gap-2 pointer-events-auto transition-opacity duration-300 ${cameraControlsLayoutClass}`}>
            {cameraSelector}
            {hasMultipleConfiguredCameras && !hideChrome && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  showAllCameras();
                }}
                className="dashboard-widget-control-button dashboard-widget-control-button-inverse"
                aria-label="Show all cameras"
              >
                <Grid2X2 size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void refreshCamera(false);
              }}
              className="dashboard-widget-control-button dashboard-widget-control-button-inverse"
              aria-label="Refresh camera"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            {!focused && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(new CustomEvent('curio-focus-widget', { detail: { widgetId: widget.id } }));
                }}
                className="dashboard-widget-control-button dashboard-widget-control-button-inverse"
                aria-label="Expand camera"
              >
                <Maximize2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Bottom Overlay ── */}
        {!hideChrome && (
          <div className="absolute bottom-4 left-4 right-4 pointer-events-none z-10 flex flex-col gap-0.5">
            <div className="text-sm font-extrabold text-white truncate drop-shadow-md">{name}</div>
            <div className="text-[10px] font-bold text-white/60 truncate uppercase tracking-[0.2em]">{entityId}</div>
          </div>
        )}
      </WidgetBody>
    </WidgetShell>
  );
};

export default HaCameraWidget;
