import React, { useEffect, useMemo, useRef, useState, useId } from 'react';
import { Globe2, Search, X } from 'lucide-react';
import { useCardTheme } from '../../../hooks/useCardTheme';
import { useDragReorder } from '../../../hooks/useDragReorder';
import { useSyncedDashboardTime } from '../../../hooks/useSyncedDashboardTime';
import { useWidgetSize } from '../../../hooks/useWidgetSize';
import type {
  DashboardWidget,
  DashboardWidgetConfig,
  DashboardWorldClockCity,
} from '../../../services/dashboardTypes';
import { useClockShowSeconds, useClockUse24Hour } from '../../../utils/settingsStorage';
import {
  effectiveToggle,
  useDashboardInteractivitySettings,
} from '../../../utils/settings/dashboardSettings';
import WidgetShell from './WidgetShell';
import { DragReorderHandle, WidgetText } from './widgetPrimitives';

const DEFAULT_ZONES = ['America/Los_Angeles', 'Europe/London', 'Asia/Tokyo'];

const CURATED_CITY_ZONES = [
  // North America
  ['Honolulu', 'Pacific/Honolulu'],
  ['Anchorage', 'America/Anchorage'],
  ['Los Angeles', 'America/Los_Angeles'],
  ['San Francisco', 'America/Los_Angeles'],
  ['Phoenix', 'America/Phoenix'],
  ['Denver', 'America/Denver'],
  ['Chicago', 'America/Chicago'],
  ['Houston', 'America/Chicago'],
  ['Dallas', 'America/Chicago'],
  ['New York', 'America/New_York'],
  ['Miami', 'America/New_York'],
  ['Washington DC', 'America/New_York'],
  ['Boston', 'America/New_York'],
  ['Atlanta', 'America/New_York'],
  ['Toronto', 'America/Toronto'],
  ['Montreal', 'America/Toronto'],
  ['Vancouver', 'America/Vancouver'],
  ['Mexico City', 'America/Mexico_City'],
  // Central & South America
  ['Bogota', 'America/Bogota'],
  ['Lima', 'America/Lima'],
  ['Santiago', 'America/Santiago'],
  ['Buenos Aires', 'America/Argentina/Buenos_Aires'],
  ['Sao Paulo', 'America/Sao_Paulo'],
  ['Rio de Janeiro', 'America/Sao_Paulo'],
  // Europe
  ['Reykjavik', 'Atlantic/Reykjavik'],
  ['Dublin', 'Europe/Dublin'],
  ['London', 'Europe/London'],
  ['Lisbon', 'Europe/Lisbon'],
  ['Paris', 'Europe/Paris'],
  ['Brussels', 'Europe/Brussels'],
  ['Amsterdam', 'Europe/Amsterdam'],
  ['Berlin', 'Europe/Berlin'],
  ['Munich', 'Europe/Berlin'],
  ['Zurich', 'Europe/Zurich'],
  ['Vienna', 'Europe/Vienna'],
  ['Prague', 'Europe/Prague'],
  ['Madrid', 'Europe/Madrid'],
  ['Barcelona', 'Europe/Madrid'],
  ['Rome', 'Europe/Rome'],
  ['Milan', 'Europe/Rome'],
  ['Warsaw', 'Europe/Warsaw'],
  ['Stockholm', 'Europe/Stockholm'],
  ['Oslo', 'Europe/Oslo'],
  ['Copenhagen', 'Europe/Copenhagen'],
  ['Helsinki', 'Europe/Helsinki'],
  ['Athens', 'Europe/Athens'],
  ['Bucharest', 'Europe/Bucharest'],
  ['Istanbul', 'Europe/Istanbul'],
  ['Moscow', 'Europe/Moscow'],
  // Middle East
  ['Cairo', 'Africa/Cairo'],
  ['Riyadh', 'Asia/Riyadh'],
  ['Doha', 'Asia/Qatar'],
  ['Dubai', 'Asia/Dubai'],
  ['Abu Dhabi', 'Asia/Dubai'],
  ['Kuwait City', 'Asia/Kuwait'],
  ['Tehran', 'Asia/Tehran'],
  ['Baghdad', 'Asia/Baghdad'],
  ['Jerusalem', 'Asia/Jerusalem'],
  // Africa
  ['Lagos', 'Africa/Lagos'],
  ['Nairobi', 'Africa/Nairobi'],
  ['Johannesburg', 'Africa/Johannesburg'],
  ['Cape Town', 'Africa/Johannesburg'],
  ['Casablanca', 'Africa/Casablanca'],
  ['Accra', 'Africa/Accra'],
  ['Addis Ababa', 'Africa/Addis_Ababa'],
  // South Asia
  ['Karachi', 'Asia/Karachi'],
  ['Mumbai', 'Asia/Kolkata'],
  ['Delhi', 'Asia/Kolkata'],
  ['Bangalore', 'Asia/Kolkata'],
  ['Chennai', 'Asia/Kolkata'],
  ['Kolkata', 'Asia/Kolkata'],
  ['Dhaka', 'Asia/Dhaka'],
  ['Colombo', 'Asia/Colombo'],
  // Southeast Asia
  ['Bangkok', 'Asia/Bangkok'],
  ['Ho Chi Minh City', 'Asia/Ho_Chi_Minh'],
  ['Jakarta', 'Asia/Jakarta'],
  ['Kuala Lumpur', 'Asia/Kuala_Lumpur'],
  ['Singapore', 'Asia/Singapore'],
  ['Manila', 'Asia/Manila'],
  // East Asia
  ['Hong Kong', 'Asia/Hong_Kong'],
  ['Shanghai', 'Asia/Shanghai'],
  ['Beijing', 'Asia/Shanghai'],
  ['Shenzhen', 'Asia/Shanghai'],
  ['Taipei', 'Asia/Taipei'],
  ['Seoul', 'Asia/Seoul'],
  ['Tokyo', 'Asia/Tokyo'],
  ['Osaka', 'Asia/Tokyo'],
  // Oceania
  ['Perth', 'Australia/Perth'],
  ['Brisbane', 'Australia/Brisbane'],
  ['Sydney', 'Australia/Sydney'],
  ['Melbourne', 'Australia/Melbourne'],
  ['Auckland', 'Pacific/Auckland'],
  ['Fiji', 'Pacific/Fiji'],
  ['Samoa', 'Pacific/Apia'],
] as const;

type CityOption = {
  city: string;
  zone: string;
  label: string;
  searchText: string;
  curated: boolean;
  order: number;
};

type ClockCity = DashboardWorldClockCity;

const toLabel = (zone: string) => {
  const city = zone.split('/').pop() || zone;
  return city.replace(/_/g, ' ');
};

const normalizeSearch = (value: string) =>
  value.trim().toLowerCase().replace(/[_/-]+/g, ' ').replace(/\s+/g, ' ');



const isValidTimeZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const getSupportedTimeZones = () => {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[];
  };
  return intlWithSupportedValues.supportedValuesOf?.('timeZone') || [];
};

const buildCityOptions = (): CityOption[] => {
  const optionMap = new Map<string, CityOption>();
  let nextOrder = 0;
  const addOption = (city: string, zone: string, curated = false, order = nextOrder++) => {
    if (!city || !zone || !isValidTimeZone(zone)) return;
    const label = `${city} (${zone})`;
    const key = `${normalizeSearch(city)}|${zone}`;
    const existing = optionMap.get(key);
    optionMap.set(`${normalizeSearch(city)}|${zone}`, {
      city,
      zone,
      label,
      searchText: normalizeSearch(`${city} ${zone}`),
      curated: curated || existing?.curated === true,
      order: existing?.order ?? order,
    });
  };

  CURATED_CITY_ZONES.forEach(([city, zone], index) => addOption(city, zone, true, index));
  getSupportedTimeZones().forEach((zone) => addOption(toLabel(zone), zone));
  return Array.from(optionMap.values()).sort((left, right) => {
    if (left.curated !== right.curated) return left.curated ? -1 : 1;
    if (left.curated && right.curated) return left.order - right.order;
    return left.city.localeCompare(right.city);
  });
};

const CITY_OPTIONS = buildCityOptions();

const normalizeClockCities = (config: DashboardWidgetConfig): ClockCity[] => {
  if (Array.isArray(config.worldClockCities)) {
    return config.worldClockCities
      .map((city) => ({
        label: city.label?.trim() || toLabel(city.timeZone || ''),
        timeZone: city.timeZone?.trim() || '',
      }))
      .filter((city) => city.label && city.timeZone && isValidTimeZone(city.timeZone));
  }

  return (Array.isArray(config.timezones) ? config.timezones : DEFAULT_ZONES)
    .map((zone) => zone.trim())
    .filter((zone) => zone && isValidTimeZone(zone))
    .map((zone) => ({ label: toLabel(zone), timeZone: zone }));
};

const findCityOption = (query: string) => {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return null;
  return (
    CITY_OPTIONS.find((option) => normalizeSearch(option.city) === normalizedQuery) ||
    CITY_OPTIONS.find((option) => normalizeSearch(option.zone) === normalizedQuery) ||
    CITY_OPTIONS.find((option) => normalizeSearch(option.label) === normalizedQuery) ||
    CITY_OPTIONS.find((option) => option.searchText.includes(normalizedQuery)) ||
    null
  );
};

const getClockHandAngles = (date: Date, zone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const hour = getPart('hour') % 12;
  const minute = getPart('minute');
  const second = getPart('second');
  return {
    hour: hour * 30 + minute * 0.5,
    minute: minute * 6 + second * 0.1,
  };
};

type WorldClockWidgetProps = {
  widget: DashboardWidget;
  onUpdateWidgetConfig?: (widgetId: string, patch: Partial<DashboardWidgetConfig>) => void;
};

const WorldClockWidget: React.FC<WorldClockWidgetProps> = ({ widget, onUpdateWidgetConfig }) => {
  const theme = useCardTheme();
  const size = useWidgetSize(widget);
  const showSeconds = useClockShowSeconds();
  const use24Hour = useClockUse24Hour();
  const now = useSyncedDashboardTime(showSeconds ? 'second' : 'minute');

  // TODO: [clockOffsetPreviewEnabled] When effectiveToggle('clockOffsetPreviewEnabled', boardInteractivity, widget.config)
  // is true, implement drag-to-preview offset: dragging the clock face previews a time offset,
  // release restores real time within 1s and does not mutate the persisted time zone.
  // Gate behind: effectiveToggle('clockOffsetPreviewEnabled', boardInteractivity, widget.config)

  const searchInputId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cityError, setCityError] = useState<string | null>(null);
  const [cities, setCities] = useState<ClockCity[]>(() => normalizeClockCities(widget.config));

  const boardInteractivity = useDashboardInteractivitySettings();
  const dragReorderEnabled = effectiveToggle(
    'dragReorderEnabled',
    boardInteractivity,
    widget.config,
  );

  const compactClock = size.pixelHeight < 320 || size.pixelWidth < 340;
  const railClock = size.pixelWidth >= 720 && !searchOpen;
  const pairedClock = size.pixelWidth >= 500 && !searchOpen;
  const showcaseRail = railClock && size.pixelHeight >= 300;
  const cityGridColumnsClass = railClock
    ? 'sm:grid-cols-3'
    : pairedClock || size.pixelWidth >= 360
      ? 'sm:grid-cols-2'
      : '';
  const cityGridGapClass = compactClock ? 'gap-2' : showcaseRail ? 'gap-5 sm:gap-7' : railClock ? 'gap-3' : 'gap-2';
  const cityGridAlignmentClass = pairedClock ? 'content-center' : 'content-start';
  const railDialClass = showcaseRail
    ? size.pixelWidth >= 720
      ? 'h-24 w-24'
      : 'h-20 w-20'
    : 'h-[3.25rem] w-[3.25rem]';
  const railDialInnerInset = showcaseRail ? 'inset-[7px]' : 'inset-[5px]';
  const railMarkRadius = showcaseRail ? (size.pixelWidth >= 720 ? '2.35rem' : '1.95rem') : '1.25rem';
  const railHourHand = showcaseRail ? (size.pixelWidth >= 720 ? '1.65rem' : '1.45rem') : '1.05rem';
  const railMinuteHand = showcaseRail ? (size.pixelWidth >= 720 ? '2.25rem' : '1.9rem') : '1.35rem';
  const railCityTextClass = showcaseRail
    ? size.pixelWidth >= 720 ? 'text-2xl' : 'text-xl'
    : 'text-[13px]';
  const railDateTextClass = showcaseRail ? 'text-sm' : 'text-[10px]';
  const railTimeTextClass = showcaseRail
    ? size.pixelWidth >= 720 ? 'text-[2.35rem]' : 'text-2xl'
    : compactClock || railClock ? 'text-xl' : 'text-3xl';

  useEffect(() => {
    setCities(normalizeClockCities(widget.config));
  }, [widget.config]);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  const formatTime = (zone: string) => new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: !use24Hour,
    timeZone: zone,
  }).format(now);

  const formatDate = (zone: string) => new Intl.DateTimeFormat([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: zone,
  }).format(now);

  const formatZoneName = (zone: string) => {
    const parts = new Intl.DateTimeFormat([], {
      timeZone: zone,
      timeZoneName: 'short',
    }).formatToParts(now);
    return parts.find((part) => part.type === 'timeZoneName')?.value || zone;
  };

  const visibleCityOptions = useMemo(() => {
    const query = normalizeSearch(cityQuery);
    const options = query
      ? CITY_OPTIONS.filter((option) => option.searchText.includes(query))
      : CITY_OPTIONS;
    return options.slice(0, query ? 12 : 10);
  }, [cityQuery]);

  const persistCities = (nextCities: ClockCity[]) => {
    setCities(nextCities);
    onUpdateWidgetConfig?.(widget.id, {
      timezones: nextCities.map((city) => city.timeZone),
      worldClockCities: nextCities,
    });
  };

  const handleAddCity = (option: CityOption | null) => {
    if (!option) {
      setCityError('Choose a city from the search results.');
      return;
    }
    if (
      cities.some(
        (city) =>
          normalizeSearch(city.label) === normalizeSearch(option.city) &&
          city.timeZone === option.zone,
      )
    ) {
      setCityError(`${option.city} is already on the clock.`);
      return;
    }

    persistCities([...cities, { label: option.city, timeZone: option.zone }]);
    setCityQuery('');
    setCityError(null);
    setSearchOpen(false);
  };

  const handleSearchSubmit = () => {
    handleAddCity(visibleCityOptions[0] || findCityOption(cityQuery));
  };

  const handleRemoveCity = (indexToRemove: number) => {
    persistCities(cities.filter((_, index) => index !== indexToRemove));
    setCityError(null);
  };

  const {
    getRowBindings,
    announcement: dragAnnouncement,
  } = useDragReorder<ClockCity>(
    cities,
    (next) => persistCities(next),
    {
      keyExtractor: (city) => `${city.label}-${city.timeZone}`,
      enabled: dragReorderEnabled && Boolean(onUpdateWidgetConfig),
    },
  );

  if (size.sizeClass === 'tiny') {
    const tinyCity = cities[0] || {
      label: toLabel(Intl.DateTimeFormat().resolvedOptions().timeZone),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    return (
      <WidgetShell bare>
        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          <div className={`text-xl font-semibold ${theme.onSurface}`}>{formatTime(tinyCity.timeZone)}</div>
          <WidgetText variant="label" tone="muted" align="center">{tinyCity.label}</WidgetText>
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      widget={widget}
      title="World Clock"
      icon={<Globe2 size={15} strokeWidth={2.25} />}
      accent="sky"
      rightSlot={
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setSearchOpen((open) => !open);
            setCityError(null);
          }}
          className={`dashboard-widget-control-button ${
            searchOpen ? 'dashboard-widget-control-button-active' : ''
          }`}
          aria-label={searchOpen ? 'Close city search' : 'Open city search'}
          aria-expanded={searchOpen}
        >
          {searchOpen ? <X size={15} /> : <Search size={15} />}
        </button>
      }
    >
      <div className={`flex h-full min-h-0 flex-col ${compactClock ? 'gap-2' : 'gap-3'}`}>
        <div role="status" aria-live="polite" className="sr-only">
          {dragAnnouncement}
        </div>
        {searchOpen && (
          <form
            className="relative z-20 shrink-0"
            onSubmit={(event) => {
              event.preventDefault();
              handleSearchSubmit();
            }}
          >
            <label htmlFor={searchInputId} className="sr-only">
              Search city to add
            </label>
            <div className="relative min-w-0">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ether-on-surface-variant)] opacity-65"
              />
              <input
                id={searchInputId}
                ref={searchInputRef}
                value={cityQuery}
                onChange={(event) => {
                  setCityQuery(event.target.value);
                  setCityError(null);
                }}
                placeholder="Search city..."
                className="h-10 w-full rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] pl-9 pr-3 text-sm font-semibold text-[var(--ether-on-surface)] shadow-sm outline-none transition placeholder:text-[var(--ether-on-surface-variant)]/55 focus:border-[var(--ether-primary)]/50 focus:bg-[var(--ether-overlay-panel)]"
                aria-label="Search city to add"
                autoComplete="off"
              />
            </div>
            <div
              role="listbox"
              aria-label="City search results"
              className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-[var(--ether-glass-border)] bg-[var(--ether-overlay-panel)] p-1.5 text-[var(--ether-on-surface)] shadow-[0_18px_46px_rgba(0,0,0,0.22)] backdrop-blur-xl"
            >
              {visibleCityOptions.length === 0 ? (
                <div className="px-3 py-3 text-xs font-semibold text-[var(--ether-on-surface-variant)]">
                  No matching cities
                </div>
              ) : (
                visibleCityOptions.map((option) => (
                  <button
                    key={`${option.city}-${option.zone}`}
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => handleAddCity(option)}
                    className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-[var(--ether-control-hover)] focus:bg-[var(--ether-control-hover)] focus:outline-none"
                    aria-label={`Add ${option.city}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-tight text-[var(--ether-on-surface)]">
                        {option.city}
                      </span>
                      <span className="mt-0.5 block break-words text-[10px] font-semibold text-[var(--ether-on-surface-variant)]">
                        {option.zone}
                      </span>
                    </span>
                    <WidgetText variant="label" tone="muted" className="shrink-0 rounded-full bg-[var(--ether-control-bg)] px-2.5 py-1">
                      Add
                    </WidgetText>
                  </button>
                ))
              )}
            </div>
          </form>
        )}

        {cityError && (
          <div className="shrink-0 text-[10px] font-semibold text-[var(--ether-error)]">
            {cityError}
          </div>
        )}

        <div
          data-testid="world-clock-city-grid"
          className={`dashboard-widget-touch-scroll grid min-h-0 flex-1 auto-rows-min ${cityGridAlignmentClass} grid-cols-1 ${cityGridColumnsClass} ${cityGridGapClass} pr-1`}
        >
          {cities.length === 0 ? (
            <div className={`col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--ether-glass-border)] p-4 text-center text-xs font-semibold ${theme.onSurfaceVariant}`}>
              Search for a city to add a clock.
            </div>
          ) : (
            cities.map((city, index) => {
              const handAngles = getClockHandAngles(now, city.timeZone);
              const rowBindings = getRowBindings(index);
              return (
                <article
                  key={`${city.label}-${city.timeZone}-${index}`}
                  aria-label={`${city.label} world clock`}
                  data-dragging={rowBindings.isDragging ? 'true' : undefined}
                  className={`group/drag-row ${compactClock ? 'rounded-[1.15rem] p-2' : showcaseRail ? 'rounded-[1.75rem] px-3 py-4 sm:px-4' : railClock ? 'rounded-[1.35rem] p-2' : 'rounded-2xl p-3'} ${
                    railClock
                      ? 'border border-transparent bg-transparent hover:border-[var(--ether-glass-border)] hover:bg-[var(--ether-control-bg)]'
                      : `bg-black/5 dark:bg-white/[0.03] border border-[var(--ether-glass-border)] shadow-sm backdrop-blur-md`
                  } group/clock-city relative grid min-w-0 ${showcaseRail ? 'grid-cols-[5.4rem_minmax(0,1fr)] gap-4 sm:gap-5' : 'grid-cols-[3.4rem_minmax(0,1fr)] gap-2.5'} items-center transition-colors data-[dragging=true]:ring-2 data-[dragging=true]:ring-[var(--ether-primary)]/40`}
                >
                  <div
                    data-testid="world-clock-dial"
                    className={`relative ${railDialClass} shrink-0 rounded-full border border-black/75 bg-white shadow-[0_3px_10px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(255,255,255,0.75)]`}
                    aria-hidden
                  >
                    <span
                      className={`absolute ${railDialInnerInset} rounded-full border border-black/20 bg-white shadow-[inset_0_1px_4px_rgba(0,0,0,0.08)]`}
                    />
                    {Array.from({ length: 12 }, (_, markIndex) => (
                      <span
                        key={markIndex}
                        data-testid="world-clock-hour-mark"
                        className="absolute left-1/2 top-1/2 h-2 w-[2px] rounded-full bg-black/65"
                        style={{
                          transform: `translate(-50%, -50%) rotate(${markIndex * 30}deg) translateY(-${railMarkRadius})`,
                        }}
                      />
                    ))}
                    <span className={`${showcaseRail ? 'h-2.5 w-2.5' : 'h-1.5 w-1.5'} absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black ring-2 ring-white`} />
                    <span
                      className="pointer-events-none absolute inset-0"
                      style={{ transform: `rotate(${handAngles.hour}deg)` }}
                    >
                      <span
                        data-testid="world-clock-hour-hand"
                        className="absolute left-1/2 top-1/2 z-10 w-[4px] origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-black"
                        style={{ height: railHourHand }}
                      />
                    </span>
                    <span
                      className="pointer-events-none absolute inset-0"
                      style={{ transform: `rotate(${handAngles.minute}deg)` }}
                    >
                      <span
                        data-testid="world-clock-minute-hand"
                        className="absolute left-1/2 top-1/2 z-10 w-[2.5px] origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-[#2563eb]"
                        style={{ height: railMinuteHand }}
                      />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className={`break-words ${railCityTextClass} font-extrabold leading-tight [overflow-wrap:anywhere] ${theme.onSurface}`}>
                        {city.label}
                      </div>
                      <div className={`mt-1 ${railDateTextClass} font-semibold leading-tight ${theme.onSurfaceVariant}`}>
                        {formatDate(city.timeZone)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCity(index)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[var(--ether-on-surface-variant)] opacity-0 transition hover:bg-[var(--ether-error)]/10 hover:text-[var(--ether-error)] focus-visible:opacity-100 group-hover/clock-city:opacity-100"
                      aria-label={`Remove ${city.label}`}
                    >
                      <X size={13} />
                    </button>
                    </div>
                  <div className={`mt-1 font-extrabold leading-none tracking-normal tabular-nums ${theme.headline} ${theme.onSurface} ${railTimeTextClass}`}>
                    {formatTime(city.timeZone)}
                  </div>
                  <div className={`mt-1`}>
                    <WidgetText variant="label" tone="muted">
                      {formatZoneName(city.timeZone)}
                    </WidgetText>
                  </div>
                  </div>
                  {dragReorderEnabled && onUpdateWidgetConfig && (
                    <DragReorderHandle
                      bindings={rowBindings}
                      ariaLabel={`Reorder ${city.label}`}
                      compact
                    />
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </WidgetShell>
  );
};

export default WorldClockWidget;
