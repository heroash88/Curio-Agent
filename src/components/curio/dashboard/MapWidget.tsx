import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, MapPinned } from 'lucide-react';
import { LocationPreview } from '../../cards/MapPreview';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDashboardRefresh } from '../../../hooks/useDashboardRefresh';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type { DashboardMapTarget, DashboardWidget } from '../../../services/dashboardTypes';
import { setDashboardDragPayload } from '../../../services/dashboardIntents';
import type { WeatherData } from '../../../services/weatherService';
import { useHomeLocation, useWorkLocation } from '../../../utils/settingsStorage';
import WidgetShell from './WidgetShell';
import { WidgetBody, WidgetEmptyState } from './widgetPrimitives';

type MapWidgetProps = {
  widget: DashboardWidget;
  weather: WeatherData | null;
};

type ResolvedMapState = {
  label: string;
  location?: { latitude: number; longitude: number };
  mapsUrl?: string;
  message?: string;
};

type LocationTabsDragState = {
  pointerId: number;
  startX: number;
  scrollLeft: number;
  dragged: boolean;
};

const MapWidget: React.FC<MapWidgetProps> = ({ widget, weather }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const locationTabsRef = useRef<HTMLDivElement | null>(null);
  const locationTabsDragRef = useRef<LocationTabsDragState | null>(null);
  const suppressLocationTabClickRef = useRef(false);
  const homeLocation = useHomeLocation();
  const workLocation = useWorkLocation();
  const configuredTarget = (widget.config.mapTarget || 'current') as DashboardMapTarget;
  const [activeTarget, setActiveTarget] = useState<DashboardMapTarget>(configuredTarget);
  const [resolved, setResolved] = useState<ResolvedMapState>({
    label: 'Current',
    message: 'Resolving map preview...',
  });
  const compactTabs = (size.pixelWidth ?? 999) < 340;

  const targetAddress = useMemo(() => {
    if (activeTarget === 'home') return homeLocation;
    if (activeTarget === 'work') return workLocation;
    if (activeTarget === 'custom') return widget.config.customLocation || '';
    return '';
  }, [activeTarget, homeLocation, widget.config.customLocation, workLocation]);

  const loadMapPreview = useCallback(async () => {
    if (activeTarget === 'current') {
      if (weather?.latitude && weather?.longitude) {
        setResolved({
          label: weather.city || 'Current Location',
          location: { latitude: weather.latitude, longitude: weather.longitude },
          mapsUrl: `https://www.openstreetmap.org/?mlat=${weather.latitude}&mlon=${weather.longitude}#map=13/${weather.latitude}/${weather.longitude}`,
        });
        return;
      }
      setResolved({
        label: 'Current Location',
        message: 'Waiting for a fresh location fix.',
      });
      return;
    }

    if (!targetAddress) {
      setResolved({
        label: activeTarget === 'home' ? 'Home' : activeTarget === 'work' ? 'Work' : 'Custom',
        message: 'Set this location in Settings to preview it here.',
      });
      return;
    }

    try {
      const { searchPlaces } = await import('../../../services/placesApi');
      const result = await searchPlaces(targetAddress);
      const place = result.places?.[0];
      setResolved({
        label: activeTarget === 'home' ? 'Home' : activeTarget === 'work' ? 'Work' : place?.displayName || 'Custom',
        location: place?.location,
        mapsUrl: place?.mapsUrl,
        message: place?.location ? undefined : 'Could not map this location yet.',
      });
    } catch {
      setResolved({
        label: activeTarget === 'home' ? 'Home' : activeTarget === 'work' ? 'Work' : 'Custom',
        message: 'Map data is unavailable right now.',
      });
    }
  }, [activeTarget, targetAddress, weather?.city, weather?.latitude, weather?.longitude]);

  useDashboardRefresh({
    widget,
    onRefresh: () => loadMapPreview(),
  });

  useEffect(() => {
    void loadMapPreview();
  }, [loadMapPreview]);

  const handleLocationTabsWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const tabs = locationTabsRef.current || event.currentTarget;
    if (tabs.scrollWidth <= tabs.clientWidth + 1) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;

    const before = tabs.scrollLeft;
    const maxScroll = tabs.scrollWidth - tabs.clientWidth;
    tabs.scrollLeft = Math.max(0, Math.min(maxScroll, before + delta));

    if (tabs.scrollLeft !== before) {
      event.preventDefault();
      event.nativeEvent.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const handleLocationTabsPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const tabs = locationTabsRef.current || event.currentTarget;
    if (tabs.scrollWidth <= tabs.clientWidth + 1) return;

    locationTabsDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: tabs.scrollLeft,
      dragged: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  }, []);

  const handleLocationTabsPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = locationTabsDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const tabs = locationTabsRef.current || event.currentTarget;
    const deltaX = event.clientX - drag.startX;
    if (!drag.dragged && Math.abs(deltaX) < 4) return;

    drag.dragged = true;
    tabs.scrollLeft = drag.scrollLeft - deltaX;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const finishLocationTabsDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = locationTabsDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    locationTabsDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (drag.dragged) {
      suppressLocationTabClickRef.current = true;
      window.setTimeout(() => {
        suppressLocationTabClickRef.current = false;
      }, 0);
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const handleLocationTabsClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressLocationTabClickRef.current) return;

    suppressLocationTabClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  if (size.sizeClass === 'tiny') {
    return (
      <WidgetShell bare>
        <WidgetBody align="center" gap="none" className="items-center">
          <MapPinned size={22} className="text-teal-400" />
        </WidgetBody>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title="Location"
      icon={<LocateFixed size={15} strokeWidth={2.25} />}
      accent="teal"
      padded={false}
      bodyClassName="h-full"
    >
      <WidgetBody gap="none" className="h-full">
        <div
          ref={locationTabsRef}
          data-testid="map-location-tabs"
          aria-label="Location choices"
          className={`no-scrollbar flex cursor-grab overflow-x-auto overscroll-x-contain pb-1 pt-3 active:cursor-grabbing [touch-action:pan-x] ${compactTabs ? 'gap-1.5 px-3' : 'gap-2 pl-3 pr-14'}`}
          onWheel={handleLocationTabsWheel}
          onPointerDown={handleLocationTabsPointerDown}
          onPointerMove={handleLocationTabsPointerMove}
          onPointerUp={finishLocationTabsDrag}
          onPointerCancel={finishLocationTabsDrag}
          onClickCapture={handleLocationTabsClickCapture}
        >
          {(['current', 'home', 'work', 'custom'] as DashboardMapTarget[]).map((target) => (
            <button
              key={target}
              onClick={() => setActiveTarget(target)}
              className={`shrink-0 rounded-full py-1.5 font-bold uppercase transition ${compactTabs ? 'px-2.5 text-[9px] tracking-[0.12em]' : 'px-3 text-[10px] tracking-[0.16em]'} ${
                activeTarget === target
                  ? 'bg-[var(--ether-control-active-bg)] text-[var(--ether-control-active-text)]'
                  : 'bg-[var(--ether-control-bg)] text-[var(--ether-on-surface-variant)] hover:bg-[var(--ether-control-hover)]'
              }`}
            >
              {target}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 px-3 pb-3 pt-3">
          {widget.config.linkedCommuteId ? (
            <div
              data-testid="map-linked-commute-label"
              className="mb-2 truncate rounded-full bg-[var(--ether-control-bg)] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--ether-on-surface-variant)]"
            >
              Linked to commute: {widget.config.linkedCommuteId}
            </div>
          ) : null}
          {resolved.location ? (
            <div
              className="relative h-full overflow-hidden rounded-[1.5rem] ring-1 ring-[var(--ether-glass-border)]"
              draggable
              onDragStart={(event) => {
                // Drop onto the Commute widget sets it as the
                // destination (design Req 10.5).
                const lat = resolved.location?.latitude;
                const lng = resolved.location?.longitude;
                setDashboardDragPayload(event.dataTransfer, {
                  kind: 'map-pin',
                  sourceWidgetId: widget.id,
                  sourceWidgetType: 'map',
                  data: {
                    label: resolved.label,
                    lat,
                    lng,
                  },
                });
              }}
            >
              <LocationPreview
                location={resolved.location}
                label={resolved.label}
                className="h-full w-full"
              />
              {resolved.mapsUrl && !size.isCompact && (
                <a
                  href={resolved.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-3 right-3 rounded-full bg-black/65 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur"
                >
                  Open Map
                </a>
              )}
            </div>
          ) : (
            <WidgetEmptyState
              icon={<MapPinned size={18} />}
              title={resolved.message || 'Map preview unavailable.'}
              className={theme.surfaceContainerLow}
            />
          )}
        </div>
      </WidgetBody>
    </WidgetShell>
  );
};

export default MapWidget;
