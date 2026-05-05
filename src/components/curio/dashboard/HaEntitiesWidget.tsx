import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDashboardRefresh } from '../../../hooks/useDashboardRefresh';
import { useOptimisticAction } from '../../../hooks/useOptimisticAction';
import { useWidgetPersistentState } from '../../../hooks/useWidgetPersistentState';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardWidget } from '../../../services/dashboardTypes';
import {
  sortPinnedFirst,
  togglePin,
} from '../../../services/pinnedItemIdsHelper';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import {
  useHaMcpEnabled,
  useHaMcpUrl,
} from '../../../utils/settingsStorage';
import WidgetShell from './WidgetShell';
import { WidgetSkeleton, WidgetText } from './widgetPrimitives';
import { Home, Lightbulb, Lock, Unlock, Thermometer, Radio, Power, Eye, ChevronUp, Music, Navigation, Palette, Pin, PinOff, SunMedium } from 'lucide-react';
import { callHaService, loadHaStatesCached, type HaState } from './haWidgetApi';

const getEntityIcon = (entityId: string, state: string) => {
    const domain = entityId.split('.')[0];
    const isOn = ['on', 'home', 'open', 'heat', 'cool', 'locked'].includes(state);
    
    switch (domain) {
        case 'light': return <Lightbulb size={16} className={isOn ? 'text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.5)]' : 'opacity-40'} />;
        case 'lock': return isOn ? <Lock size={16} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" /> : <Unlock size={16} className="text-rose-400" />;
        case 'climate': return <Thermometer size={16} className={isOn ? 'text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]' : 'opacity-40'} />;
        case 'cover': return <ChevronUp size={16} className={isOn ? 'text-teal-400 drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]' : 'opacity-40'} />;
        case 'media_player': return <Music size={16} className={isOn ? 'text-pink-400 drop-shadow-[0_0_8px_rgba(244,114,182,0.5)]' : 'opacity-40'} />;
        case 'vacuum': return <Navigation size={16} className={isOn ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'opacity-40'} />;
        case 'switch': return <Power size={16} className={isOn ? 'text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]' : 'opacity-40'} />;
        case 'binary_sensor': return <Radio size={16} className={isOn ? 'text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]' : 'opacity-40'} />;
        case 'camera': return <Eye size={16} className="opacity-40" />;
        default: return <Home size={16} className="opacity-40" />;
    }
};

const prettify = (entityId: string, friendly?: string) => {
  if (friendly) return friendly;
  return entityId.split('.').pop()?.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) || entityId;
};

const getHaDomain = (entityId: string) => entityId.split('.')[0] || 'unknown';

const normalizeRoomName = (value: unknown) =>
  String(value || '').trim().toLowerCase();

const formatRoomName = (value: unknown) => {
  const room = String(value || '').trim();
  if (!room) return 'Unassigned';
  return room
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const getEntityRoom = (entity: HaState) =>
  formatRoomName(
    entity.area ||
      entity.attributes?.area ||
      entity.attributes?.area_name ||
      entity.attributes?.room ||
      entity.attributes?.room_name ||
      entity.attributes?.area_id,
  );

const parseSelectedRooms = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => formatRoomName(item))
        .filter((item) => item && item !== 'Unassigned')
    : [];

const parseHaDomainFilter = (value: unknown) =>
  String(value || '')
    .split(/[, ]+/)
    .map((item) => item.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);

const haIsActiveState = (state: string) =>
  ['on', 'home', 'open', 'playing', 'heat', 'cool', 'auto', 'dry', 'fan_only', 'unlocked', 'cleaning'].includes(state.toLowerCase());

const LIGHT_COLOR_PRESETS = [
  { name: 'warm amber', rgb: [255, 184, 108], className: 'bg-[#ffb86c]' },
  { name: 'soft white', rgb: [255, 244, 214], className: 'bg-[#fff4d6]' },
  { name: 'sky blue', rgb: [96, 190, 255], className: 'bg-[#60beff]' },
  { name: 'rose glow', rgb: [255, 112, 166], className: 'bg-[#ff70a6]' },
] as const;

const getBrightnessPercent = (entity: HaState) => {
  const raw = Number(entity.attributes?.brightness);
  if (!Number.isFinite(raw)) return entity.state === 'on' ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((raw / 255) * 100)));
};

const HaEntitiesWidget: React.FC<{ widget: DashboardWidget }> = ({ widget }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const haEnabled = useHaMcpEnabled();
  const haUrl = useHaMcpUrl();
  const [entities, setEntities] = useState<HaState[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedLightId, setExpandedLightId] = useState<string | null>(null);
  const [entityView, setEntityView] = useState<'rooms' | 'devices' | 'scenes'>('rooms');
  const mountedRef = useRef(true);
  const entitiesLengthRef = useRef(0);
  const brightnessTimersRef = useRef<Record<string, number>>({});

  // Per-widget pinning (Requirement 15). Entity ids are pinned through
  // `useWidgetPersistentState` so pinning survives reloads. When the
  // `widgetPinningEnabled` toggle is false, the pin button is hidden
  // but stored ids are preserved (Requirement 15.5).
  const boardInteractivity = useDashboardInteractivitySettings();
  const pinningEnabled = effectiveToggle(
    'widgetPinningEnabled',
    boardInteractivity,
    widget.config,
  );
  const [pinnedItemIds, setPinnedItemIds] = useWidgetPersistentState<string[]>(
    widget.id,
    'pinnedItemIds',
    [],
  );
  const handleTogglePin = useCallback(
    (entityId: string) => {
      setPinnedItemIds((current) => togglePin(current, entityId));
    },
    [setPinnedItemIds],
  );

  const entityIds = useMemo(
    () => (Array.isArray(widget.config.entityIds) ? widget.config.entityIds.filter(Boolean) : [])
      .map((id: string) => id.toLowerCase()) as string[],
    [widget.config.entityIds],
  );
  
  const domain = String(widget.config.domain || '').trim();
  const domainFilters = useMemo(() => parseHaDomainFilter(domain), [domain]);
  const selectedRooms = useMemo(
    () => parseSelectedRooms(widget.config.haRoomNames),
    [widget.config.haRoomNames],
  );
  const selectedRoomSet = useMemo(
    () => new Set(selectedRooms.map((room) => normalizeRoomName(room))),
    [selectedRooms],
  );
  const layoutMaxItems = size.pixelHeight < 320 ? 2 : size.pixelHeight < 480 ? 4 : size.isTall ? 8 : 5;
  const maxItems = Math.max(1, Math.min(Number(widget.config.maxItems || layoutMaxItems), layoutMaxItems));
  const effectiveMaxItems = entityIds.length > 0
    ? Math.min(50, Math.max(maxItems, entityIds.length))
    : maxItems;
  const wideDeviceGrid = size.pixelWidth >= 380 && size.pixelHeight >= 285;
  const roomFilteredEntities = useMemo(() => {
    const filtered = selectedRoomSet.size === 0
      ? entities
      : entities.filter((entity) => selectedRoomSet.has(normalizeRoomName(getEntityRoom(entity))));
    return pinningEnabled
      ? sortPinnedFirst(filtered, pinnedItemIds, (entity) => entity.entity_id)
      : filtered;
  }, [entities, pinnedItemIds, pinningEnabled, selectedRoomSet]);
  const visibleEntities = useMemo(() => {
    const scenes = roomFilteredEntities.filter((entity) => ['scene', 'script'].includes(getHaDomain(entity.entity_id)));
    if (entityView === 'scenes') return scenes;
    return roomFilteredEntities.filter((entity) => !['scene', 'script'].includes(getHaDomain(entity.entity_id)));
  }, [entityView, roomFilteredEntities]);
  const roomGroups = useMemo(() => {
    const groups = new Map<string, HaState[]>();
    roomFilteredEntities
      .filter((entity) => !['scene', 'script'].includes(getHaDomain(entity.entity_id)))
      .forEach((entity) => {
        const room = getEntityRoom(entity);
        groups.set(room, [...(groups.get(room) || []), entity]);
      });
    return Array.from(groups.entries())
      .map(([room, items]) => ({
        room,
        activeCount: items.filter((entity) => haIsActiveState(entity.state)).length,
        items,
      }))
      .sort((left, right) => {
        if (left.room === 'Unassigned') return 1;
        if (right.room === 'Unassigned') return -1;
        return left.room.localeCompare(right.room);
      });
  }, [roomFilteredEntities]);
  const limitedRoomGroups = useMemo(() => {
    let remaining = effectiveMaxItems;
    const limited: typeof roomGroups = [];
    roomGroups.forEach((group) => {
      if (remaining <= 0) return;
      const items = group.items.slice(0, remaining);
      if (items.length > 0) {
        limited.push({ ...group, items });
        remaining -= items.length;
      }
    });
    return limited;
  }, [effectiveMaxItems, roomGroups]);

  const loadStates = useCallback(async (background = false) => {
    if (!haEnabled || !haUrl || document.visibilityState === 'hidden') return;
    if (!mountedRef.current) return;
    if (!background || entitiesLengthRef.current === 0) {
      setLoading(true);
    }
    try {
      const all = (await loadHaStatesCached(haUrl, { force: !background })) as HaState[];
      const filtered = all.filter((s) => {
        const entityId = String(s.entity_id || '').toLowerCase();
        const entityDomain = getHaDomain(entityId);
        if (entityIds.length > 0 && !entityIds.includes(entityId)) return false;
        if (domainFilters.length > 0 && !domainFilters.includes(entityDomain)) return false;
        if (entityIds.length > 0 || domainFilters.length > 0) return true;
        return ['light.', 'lock.', 'climate.', 'cover.', 'media_player.', 'vacuum.', 'sensor.', 'binary_sensor.', 'switch.'].some((p) => entityId.startsWith(p));
      });
      if (mountedRef.current) {
        const nextEntities = filtered.slice(0, 50);
        entitiesLengthRef.current = nextEntities.length;
        setEntities(nextEntities);
      }
    } catch (err) {
      console.warn('[HaEntitiesWidget] Load failed', err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [domainFilters, entityIds, haEnabled, haUrl]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Object.values(brightnessTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      brightnessTimersRef.current = {};
    };
  }, []);

  useDashboardRefresh({
    widget,
    enabled: haEnabled && Boolean(haUrl),
    onRefresh: (background) => loadStates(background),
  });

  const isActive = (state: string) => haIsActiveState(state);
  const activeCount = roomFilteredEntities.filter((e) => isActive(e.state)).length;

  // Ref to hold the entity being toggled so the optimistic action hook
  // can reference it without re-creating on every render.
  const toggleTargetRef = useRef<HaState | null>(null);

  const optimisticToggle = useOptimisticAction<HaState[]>(
    entities,
    setEntities,
    {
      apply: (prev) => {
        const target = toggleTargetRef.current;
        if (!target) return prev;
        const nextState = target.state === 'on' ? 'off' : 'on';
        return prev.map((item) =>
          item.entity_id === target.entity_id ? { ...item, state: nextState } : item,
        );
      },
      commit: async () => {
        const target = toggleTargetRef.current;
        if (!target || !haUrl) throw new Error('HA unavailable');
        const entityDomain = getHaDomain(target.entity_id);
        const nextState = target.state === 'on' ? 'off' : 'on';
        const serviceDomain = entityDomain === 'input_boolean' ? 'input_boolean' : entityDomain;
        const service = nextState === 'on' ? 'turn_on' : 'turn_off';
        await callHaService(haUrl, serviceDomain, service, { entity_id: target.entity_id });
        window.setTimeout(loadStates, 700);
      },
      retryLabel: 'Toggle failed. Tap to retry.',
      errorToastId: `ha-entities-toggle-${widget.id}`,
    },
  );

  const toggleEntity = useCallback(async (entity: HaState) => {
    if (!haUrl) return;
    const entityDomain = getHaDomain(entity.entity_id);
    if (!['light', 'switch', 'input_boolean'].includes(entityDomain)) return;
    toggleTargetRef.current = entity;
    await optimisticToggle.run();
  }, [haUrl, optimisticToggle]);

  const queueLightBrightness = useCallback((entityId: string, brightnessPct: number) => {
    if (!haUrl) return;
    const currentTimer = brightnessTimersRef.current[entityId];
    if (currentTimer) {
      window.clearTimeout(currentTimer);
    }
    brightnessTimersRef.current[entityId] = window.setTimeout(async () => {
      delete brightnessTimersRef.current[entityId];
      try {
        await callHaService(haUrl, 'light', 'turn_on', {
          entity_id: entityId,
          brightness_pct: brightnessPct,
        });
        window.setTimeout(loadStates, 700);
      } catch (err) {
        console.warn('[HaEntitiesWidget] Brightness update failed', err);
        void loadStates();
      }
    }, 120);
  }, [haUrl, loadStates]);

  const setLightBrightness = useCallback((entity: HaState, brightnessPct: number) => {
    const clamped = Math.max(1, Math.min(100, Math.round(brightnessPct)));
    setEntities((current) =>
      current.map((item) =>
        item.entity_id === entity.entity_id
          ? {
              ...item,
              state: 'on',
              attributes: {
                ...item.attributes,
                brightness: Math.round((clamped / 100) * 255),
              },
            }
          : item,
      ),
    );
    queueLightBrightness(entity.entity_id, clamped);
  }, [queueLightBrightness]);

  const setLightColor = useCallback(async (entity: HaState, rgb: readonly [number, number, number]) => {
    if (!haUrl) return;
    setEntities((current) =>
      current.map((item) =>
        item.entity_id === entity.entity_id ? { ...item, state: 'on' } : item,
      ),
    );
    try {
      await callHaService(haUrl, 'light', 'turn_on', {
        entity_id: entity.entity_id,
        rgb_color: [...rgb],
      });
      window.setTimeout(loadStates, 700);
    } catch (err) {
      console.warn('[HaEntitiesWidget] Color update failed', err);
      void loadStates();
    }
  }, [haUrl, loadStates]);

  const renderEntityCard = (entity: HaState) => {
    const active = isActive(entity.state);
    const entityDomain = getHaDomain(entity.entity_id);
    const canToggle = ['light', 'switch', 'input_boolean'].includes(entityDomain);
    const isLight = entityDomain === 'light';
    const expanded = expandedLightId === entity.entity_id;
    const label = prettify(entity.entity_id, entity.attributes?.friendly_name);
    const brightnessPercent = getBrightnessPercent(entity);
    const entityPinned = pinnedItemIds.includes(entity.entity_id);
    const isPendingEntity = optimisticToggle.isPending && toggleTargetRef.current?.entity_id === entity.entity_id;
    return (
      <div
        key={entity.entity_id}
        data-pending={isPendingEntity ? 'true' : undefined}
        className={`min-w-0 rounded-2xl border transition-all duration-300 ${
          active
            ? 'bg-[var(--ether-indigo)]/10 border-[var(--ether-indigo)]/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]'
            : 'bg-[var(--ether-surface-container)] border-[var(--ether-glass-border)]'
        } ${expanded ? 'shadow-[0_16px_40px_rgba(0,0,0,0.16)]' : ''} ${isPendingEntity ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => {
              if (isLight) {
                setExpandedLightId((current) =>
                  current === entity.entity_id ? null : entity.entity_id,
                );
                return;
              }
              if (canToggle) void toggleEntity(entity);
            }}
            disabled={!canToggle && !isLight}
            aria-expanded={isLight ? expanded : undefined}
            className={`flex flex-1 min-w-0 items-center gap-3 p-3 text-left transition-all duration-300 ${
              canToggle || isLight ? 'hover:scale-[1.01] active:scale-95 cursor-pointer' : 'cursor-default'
            }`}
          >
          <div className="h-8 w-8 shrink-0 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 shadow-inner">
            {getEntityIcon(entity.entity_id, entity.state)}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className={`text-[12px] font-bold truncate ${active ? theme.onSurface : theme.onSurfaceVariant}`}>
              {label}
            </div>
            <div className={`text-[9px] font-bold uppercase tracking-widest ${active ? 'text-[var(--ether-indigo)]' : 'opacity-40'}`}>
              {isLight ? `${entity.state} - ${brightnessPercent}%` : entity.state}
            </div>
          </div>
          {canToggle && !isLight && (
            <div className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ${active ? 'bg-[var(--ether-indigo)]' : theme.surfaceContainerLow}`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
            </div>
          )}
          {isLight && (
            <Palette
              size={15}
              className={`shrink-0 transition ${expanded ? 'text-[var(--ether-indigo)]' : 'opacity-45'}`}
              aria-hidden
            />
          )}
          </button>
          {pinningEnabled && (
            <button
              type="button"
              aria-label={entityPinned ? 'Unpin' : 'Pin'}
              aria-pressed={entityPinned}
              title={entityPinned ? `Unpin ${label}` : `Pin ${label}`}
              onClick={(event) => {
                event.stopPropagation();
                handleTogglePin(entity.entity_id);
              }}
              className={`mr-2 shrink-0 rounded-full p-1.5 transition-opacity ${
                entityPinned
                  ? 'text-[var(--ether-indigo)] opacity-100'
                  : 'opacity-40 hover:opacity-100 hover:text-[var(--ether-indigo)]'
              }`}
            >
              {entityPinned ? <Pin size={12} fill="currentColor" /> : <PinOff size={12} />}
            </button>
          )}
        </div>
        {isLight && expanded && (
          <div className="border-t border-[var(--ether-glass-border)]/70 px-3 pb-3 pt-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <SunMedium size={13} className="shrink-0 text-[var(--ether-amber)]" aria-hidden />
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={brightnessPercent}
                  aria-label={`${label} brightness`}
                  onChange={(event) => setLightBrightness(entity, Number(event.target.value))}
                  className="min-w-0 flex-1 accent-[var(--ether-amber)]"
                />
              </label>
              <button
                type="button"
                onClick={() => void toggleEntity(entity)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition ${
                  active
                    ? 'bg-[var(--ether-indigo)] text-black'
                    : 'bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)]'
                }`}
                aria-label={`${active ? 'Turn off' : 'Turn on'} ${label}`}
              >
                {active ? 'On' : 'Off'}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {LIGHT_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => void setLightColor(entity, preset.rgb)}
                  aria-label={`Set ${label} to ${preset.name}`}
                  className="flex h-8 items-center justify-center rounded-xl border border-white/10 bg-[var(--ether-control-bg)] transition hover:scale-105 active:scale-95"
                >
                  <span className={`h-4 w-4 rounded-full shadow-[0_0_12px_currentColor] ${preset.className}`} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare accent="indigo" widget={widget}>
        <div className="flex flex-1 flex-col items-center justify-center">
          <span className={`text-3xl font-bold tabular-nums ${theme.onSurface}`}>{activeCount}</span>
          <WidgetText variant="label" tone="muted" align="center">Active</WidgetText>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title={domain ? `${domain} devices` : 'Home'}
      icon={<Home size={14} />}
      accent="indigo"
      rightSlot={
        <div className="flex items-center gap-1.5 opacity-60">
            <WidgetText variant="label">
                {activeCount} Active
            </WidgetText>
        </div>
      }
    >
      <div className="flex h-full flex-col min-h-0">
        {!haEnabled || !haUrl ? (
            <div className="flex flex-1 flex-col items-center justify-center opacity-60">
                <Home size={32} className="mb-2" />
                <WidgetText variant="label" tone="muted" align="center" className="px-4">HA Not Connected</WidgetText>
            </div>
        ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div
                className="grid shrink-0 grid-cols-3 rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] p-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]"
                aria-label="Smart home view"
              >
                {([
                  ['rooms', 'Rooms'],
                  ['devices', 'Devices'],
                  ['scenes', 'Scenes'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEntityView(value)}
                    aria-pressed={entityView === value}
                    className={`min-h-7 rounded-full px-2 transition ${
                      entityView === value
                        ? 'bg-[var(--ether-primary)] text-[var(--ether-control-active-text)] shadow-[0_8px_20px_color-mix(in_srgb,var(--ether-primary)_20%,transparent)]'
                        : 'hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                data-testid="ha-entities-device-grid"
                className={`dashboard-widget-touch-scroll min-h-0 flex-1 pr-1 pb-1 ${
                  entityView === 'rooms'
                    ? 'space-y-3'
                    : wideDeviceGrid
                      ? 'grid auto-rows-min grid-cols-2 gap-2'
                      : 'space-y-2'
                }`}
              >
                {loading && entities.length === 0 ? (
                    <WidgetSkeleton variant="grid" />
                ) : visibleEntities.length === 0 && roomGroups.length === 0 && !loading ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-60">
                        <WidgetText variant="label" tone="muted" align="center">No Entities</WidgetText>
                    </div>
                ) : entityView === 'rooms' ? (
                  limitedRoomGroups.map((group) => (
                    <section
                      key={group.room}
                      className="min-w-0 rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-surface-container)]/45 p-2"
                      aria-label={`${group.room} room`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2 px-1">
                        <div className="min-w-0">
                          <div className={`truncate text-[12px] font-extrabold ${theme.onSurface}`}>
                            {group.room}
                          </div>
                          <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--ether-on-surface-variant)]">
                            {group.items.length} shown
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-[var(--ether-control-bg)] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)]">
                          {group.activeCount} active
                        </span>
                      </div>
                      <div className={wideDeviceGrid ? 'grid grid-cols-2 gap-2' : 'space-y-2'}>
                        {group.items.map(renderEntityCard)}
                      </div>
                    </section>
                  ))
                ) : (
                    visibleEntities.slice(0, effectiveMaxItems).map(renderEntityCard)
                )}
              </div>
              {visibleEntities.length > 0 && !size.isCompact && entityView !== 'devices' && (
                <button
                  type="button"
                  onClick={() => setEntityView('devices')}
                  className="flex shrink-0 items-center justify-between rounded-full border border-[var(--ether-glass-border)] bg-[var(--ether-control-bg)] px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ether-on-surface-variant)] transition hover:bg-[var(--ether-control-hover)] hover:text-[var(--ether-on-surface)]"
                >
                  <span>View all devices</span>
                  <span aria-hidden>&gt;</span>
                </button>
              )}
            </div>
        )}
      </div>
    </WidgetShell>
  );
};

export default HaEntitiesWidget;
