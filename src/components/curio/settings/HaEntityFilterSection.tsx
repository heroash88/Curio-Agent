import React, { useState, useMemo, useCallback, useEffect } from 'react';
import SettingsSection from '../SettingsSection';
import {
    getHaExcludedEntities,
    toggleHaEntityExclusion,
    setHaExcludedEntities,
} from '../../../utils/settingsStorage';
import {
    Search,
    ChevronDown,
    Eye,
    EyeOff,
    Home,
    Lightbulb,
    Plug,
    Thermometer,
    Wind,
    DoorOpen,
    Lock,
    Camera,
    Tv,
    Sticker,
    AlertCircle,
    Activity,
    User,
    MapPin,
    Theater,
    FileText,
    Zap,
    Circle,
    Hash,
    ClipboardList,
    Flame,
    Droplets,
    LayoutGrid,
} from 'lucide-react';

interface HAEntityInfo {
    entity_id: string;
    name: string;
    domain: string;
    area?: string;
    state?: string;
}

interface HaEntityFilterSectionProps {
    entities: HAEntityInfo[];
}

const DOMAIN_META: Record<string, { label: string; icon: React.ReactNode; order: number }> = {
    light:               { label: 'Lights',         icon: <Lightbulb size={14} />, order: 1 },
    switch:              { label: 'Switches',       icon: <Plug size={14} />, order: 2 },
    climate:             { label: 'Climate',        icon: <Thermometer size={14} />, order: 3 },
    fan:                 { label: 'Fans',           icon: <Wind size={14} />, order: 4 },
    cover:               { label: 'Covers',         icon: <DoorOpen size={14} />, order: 5 },
    lock:                { label: 'Locks',          icon: <Lock size={14} />, order: 6 },
    camera:              { label: 'Cameras',        icon: <Camera size={14} />, order: 7 },
    media_player:        { label: 'Media Players',  icon: <Tv size={14} />, order: 8 },
    vacuum:              { label: 'Vacuums',        icon: <Sticker size={14} />, order: 9 },
    alarm_control_panel: { label: 'Alarm Panels',   icon: <AlertCircle size={14} />, order: 10 },
    sensor:              { label: 'Sensors',        icon: <Activity size={14} />, order: 11 },
    binary_sensor:       { label: 'Binary Sensors', icon: <Circle size={14} />, order: 12 },
    person:              { label: 'People',         icon: <User size={14} />, order: 13 },
    device_tracker:      { label: 'Trackers',       icon: <MapPin size={14} />, order: 14 },
    scene:               { label: 'Scenes',         icon: <Theater size={14} />, order: 15 },
    script:              { label: 'Scripts',        icon: <FileText size={14} />, order: 16 },
    automation:          { label: 'Automations',    icon: <Zap size={14} />, order: 17 },
    input_boolean:       { label: 'Input Booleans', icon: <Circle size={14} />, order: 18 },
    input_number:        { label: 'Input Numbers',  icon: <Hash size={14} />, order: 19 },
    number:              { label: 'Numbers',        icon: <Hash size={14} />, order: 20 },
    select:              { label: 'Selects',        icon: <ClipboardList size={14} />, order: 21 },
    button:              { label: 'Buttons',        icon: <Circle size={14} />, order: 22 },
    humidifier:          { label: 'Humidifiers',    icon: <Droplets size={14} />, order: 23 },
    water_heater:        { label: 'Water Heaters',  icon: <Flame size={14} />, order: 24 },
};

const getDomainMeta = (domain: string) =>
    DOMAIN_META[domain] || { label: domain, icon: <LayoutGrid size={14} />, order: 99 };

const NO_AREA_KEY = '__no_area__';
const NO_AREA_LABEL = 'Unassigned';

type ViewMode = 'room' | 'type';

interface Group {
    key: string;
    label: string;
    icon: React.ReactNode;
    entities: HAEntityInfo[];
    isUnassigned?: boolean;
}

const HaEntityFilterSection: React.FC<HaEntityFilterSectionProps> = ({ entities }) => {
    const [excluded, setExcludedLocal] = useState<Set<string>>(() => getHaExcludedEntities());
    const [search, setSearch] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<ViewMode>('room');
    const [domainFilter, setDomainFilter] = useState<string | null>(null);
    const [showDomainFilter, setShowDomainFilter] = useState(false);
    const [groupSearch, setGroupSearch] = useState<Record<string, string>>({});

    const setGroupSearchFor = useCallback((key: string, value: string) => {
        setGroupSearch(prev => (value ? { ...prev, [key]: value } : (() => {
            const next = { ...prev };
            delete next[key];
            return next;
        })()));
    }, []);

    useEffect(() => {
        const handler = () => setExcludedLocal(getHaExcludedEntities());
        window.addEventListener('storage', handler);
        window.addEventListener('curio:settings-changed', handler);
        return () => {
            window.removeEventListener('storage', handler);
            window.removeEventListener('curio:settings-changed', handler);
        };
    }, []);

    const availableDomains = useMemo(() => {
        const counts = new Map<string, number>();
        for (const e of entities) {
            counts.set(e.domain, (counts.get(e.domain) || 0) + 1);
        }
        return [...counts.entries()]
            .sort((a, b) => getDomainMeta(a[0]).order - getDomainMeta(b[0]).order)
            .map(([domain, count]) => ({ domain, count, ...getDomainMeta(domain) }));
    }, [entities]);

    // Count unique rooms (excludes Unassigned)
    const roomCount = useMemo(() => {
        const areas = new Set<string>();
        for (const e of entities) {
            if (e.area) areas.add(e.area);
        }
        return areas.size;
    }, [entities]);

    const grouped = useMemo<Group[]>(() => {
        const searchLower = search.toLowerCase().trim();
        let filtered = entities;
        if (searchLower) {
            filtered = filtered.filter(e =>
                e.name.toLowerCase().includes(searchLower) ||
                e.entity_id.toLowerCase().includes(searchLower) ||
                (e.area || '').toLowerCase().includes(searchLower));
        }
        if (domainFilter) {
            filtered = filtered.filter(e => e.domain === domainFilter);
        }

        if (viewMode === 'type') {
            const byDomain = new Map<string, HAEntityInfo[]>();
            for (const e of filtered) {
                if (!byDomain.has(e.domain)) byDomain.set(e.domain, []);
                byDomain.get(e.domain)!.push(e);
            }
            return [...byDomain.entries()]
                .sort((a, b) => getDomainMeta(a[0]).order - getDomainMeta(b[0]).order)
                .map(([domain, ents]) => ({
                    key: domain,
                    icon: getDomainMeta(domain).icon,
                    label: getDomainMeta(domain).label,
                    entities: ents.sort((a, b) =>
                        (a.area || 'zzz').localeCompare(b.area || 'zzz') ||
                        a.name.localeCompare(b.name)),
                }));
        }

        // Room view: sort assigned rooms alphabetically, Unassigned last
        const byArea = new Map<string, HAEntityInfo[]>();
        for (const e of filtered) {
            const key = e.area || NO_AREA_KEY;
            if (!byArea.has(key)) byArea.set(key, []);
            byArea.get(key)!.push(e);
        }
        return [...byArea.entries()]
            .sort((a, b) => {
                if (a[0] === NO_AREA_KEY) return 1;
                if (b[0] === NO_AREA_KEY) return -1;
                return a[0].localeCompare(b[0]);
            })
            .map(([area, ents]) => ({
                key: area,
                icon: area === NO_AREA_KEY
                    ? <MapPin size={14} className="text-slate-400" />
                    : <Home size={14} className="text-violet-500" />,
                label: area === NO_AREA_KEY ? NO_AREA_LABEL : area,
                entities: ents.sort((a, b) =>
                    getDomainMeta(a.domain).order - getDomainMeta(b.domain).order ||
                    a.name.localeCompare(b.name)),
                isUnassigned: area === NO_AREA_KEY,
            }));
    }, [entities, search, domainFilter, viewMode]);

    const toggleEntity = useCallback((entityId: string) => {
        toggleHaEntityExclusion(entityId);
        setExcludedLocal(getHaExcludedEntities());
    }, []);

    const toggleGroup = useCallback((groupKey: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupKey)) next.delete(groupKey);
            else next.add(groupKey);
            return next;
        });
    }, []);

    const toggleAllInGroup = useCallback((groupEntities: HAEntityInfo[]) => {
        const current = getHaExcludedEntities();
        const allExcluded = groupEntities.every(e => current.has(e.entity_id));
        for (const e of groupEntities) {
            if (allExcluded) current.delete(e.entity_id);
            else current.add(e.entity_id);
        }
        setHaExcludedEntities(current);
        setExcludedLocal(new Set(current));
    }, []);

    const exposeAll = useCallback(() => {
        setHaExcludedEntities(new Set());
        setExcludedLocal(new Set());
    }, []);

    const hideAll = useCallback(() => {
        const all = new Set(entities.map(e => e.entity_id));
        setHaExcludedEntities(all);
        setExcludedLocal(all);
    }, [entities]);

    const totalCount = entities.length;
    const excludedCount = excluded.size;
    const exposedCount = totalCount - excludedCount;

    if (entities.length === 0) {
        return (
            <SettingsSection title="Device Access" icon={<Home size={18} className="text-violet-500" />}>
                <p className="text-xs text-slate-500">
                    Connect to Home Assistant to manage which devices Curio can see and control.
                </p>
            </SettingsSection>
        );
    }

    return (
        <SettingsSection title="Device Access" icon={<Home size={18} className="text-violet-500" />}>
            {/* Summary card */}
            <div className="rounded-xl bg-gradient-to-br from-violet-50 to-sky-50 border border-violet-100 p-3">
                <div className="flex items-baseline justify-between gap-2">
                    <div>
                        <div className="text-xs text-slate-500">Curio can see</div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-bold text-violet-600">{exposedCount.toLocaleString()}</span>
                            <span className="text-xs text-slate-500">of {totalCount.toLocaleString()} devices</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-slate-500">Rooms</div>
                        <div className="text-xl font-bold text-slate-700">{roomCount}</div>
                    </div>
                </div>
                {excludedCount > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <EyeOff size={12} />
                        <span>{excludedCount.toLocaleString()} hidden from Curio</span>
                    </div>
                )}
                <div className="mt-2 flex gap-1.5">
                    <button
                        onClick={exposeAll}
                        className="flex-1 rounded-lg bg-white border border-green-200 px-2 py-1.5 text-[11px] font-semibold text-green-600 hover:bg-green-50 transition-colors active:scale-95"
                    >
                        Expose all
                    </button>
                    <button
                        onClick={hideAll}
                        className="flex-1 rounded-lg bg-white border border-red-200 px-2 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 transition-colors active:scale-95"
                    >
                        Hide all
                    </button>
                </div>
            </div>

            {/* Search + view toggle */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder={viewMode === 'room' ? 'Search rooms or devices...' : 'Search devices...'}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs text-slate-700 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200 transition-colors"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-1"
                            aria-label="Clear search"
                        >
                            x
                        </button>
                    )}
                </div>
                <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
                    <button
                        onClick={() => setViewMode('room')}
                        className={`flex items-center gap-1 rounded px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                            viewMode === 'room'
                                ? 'bg-violet-500 text-white'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                        title="Group by room"
                    >
                        <Home size={12} />
                        <span>Rooms</span>
                    </button>
                    <button
                        onClick={() => setViewMode('type')}
                        className={`flex items-center gap-1 rounded px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                            viewMode === 'type'
                                ? 'bg-violet-500 text-white'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                        title="Group by device type"
                    >
                        <LayoutGrid size={12} />
                        <span>Types</span>
                    </button>
                </div>
            </div>

            {/* Domain filter (collapsible) */}
            <div>
                <button
                    onClick={() => setShowDomainFilter(v => !v)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50 transition-colors"
                >
                    <span className="flex items-center gap-1.5">
                        <LayoutGrid size={12} />
                        <span>Filter by type</span>
                        {domainFilter && (
                            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">
                                {getDomainMeta(domainFilter).label}
                            </span>
                        )}
                    </span>
                    <ChevronDown
                        size={12}
                        className={`text-slate-400 transition-transform ${showDomainFilter ? 'rotate-180' : ''}`}
                    />
                </button>
                {showDomainFilter && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                            onClick={() => setDomainFilter(null)}
                            className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors ${
                                !domainFilter
                                    ? 'border-violet-500 bg-violet-500 text-white'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                        >
                            All types
                        </button>
                        {availableDomains.map(d => {
                            const active = domainFilter === d.domain;
                            return (
                                <button
                                    key={d.domain}
                                    onClick={() => setDomainFilter(active ? null : d.domain)}
                                    className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors ${
                                        active
                                            ? 'border-violet-500 bg-violet-500 text-white'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                    }`}
                                >
                                    {d.icon}
                                    <span>{d.label}</span>
                                    <span className={`rounded-full px-1 text-[9px] ${active ? 'bg-violet-600' : 'bg-slate-100 text-slate-500'}`}>
                                        {d.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Groups list */}
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {grouped.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center">
                        <Search size={20} className="mx-auto mb-2 text-slate-300" />
                        <p className="text-xs text-slate-500">No devices match your search.</p>
                    </div>
                )}
                {grouped.map(group => {
                    const isExpanded = expandedGroups.has(group.key);
                    const groupExcluded = group.entities.filter(e => excluded.has(e.entity_id)).length;
                    const exposedInGroup = group.entities.length - groupExcluded;
                    const allHidden = groupExcluded === group.entities.length;
                    const allExposed = groupExcluded === 0;

                    return (
                        <div
                            key={group.key}
                            className={`overflow-hidden rounded-xl border transition-colors ${
                                group.isUnassigned
                                    ? 'border-slate-200 bg-slate-50/50'
                                    : 'border-slate-200 bg-white'
                            }`}
                        >
                            {/* Group header */}
                            <div className="flex items-center gap-2 px-3 py-2.5">
                                <button
                                    onClick={() => toggleGroup(group.key)}
                                    className="flex flex-1 items-center gap-2 text-left"
                                >
                                    <ChevronDown
                                        size={14}
                                        className={`text-slate-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                                    />
                                    <span className="flex-shrink-0">{group.icon}</span>
                                    <span className={`text-sm font-semibold truncate ${
                                        group.isUnassigned ? 'text-slate-500' : 'text-slate-700'
                                    }`}>
                                        {group.label}
                                    </span>
                                    <span className="text-[11px] text-slate-400">
                                        {exposedInGroup}/{group.entities.length}
                                    </span>
                                </button>
                                <button
                                    onClick={() => toggleAllInGroup(group.entities)}
                                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors active:scale-95 ${
                                        allHidden
                                            ? 'border-slate-200 bg-white text-slate-500 hover:border-green-300 hover:text-green-600'
                                            : allExposed
                                                ? 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100'
                                                : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    }`}
                                    title={allHidden ? 'Expose all in this group' : 'Hide all in this group'}
                                >
                                    {allHidden ? (
                                        <>
                                            <EyeOff size={11} />
                                            <span>Hidden</span>
                                        </>
                                    ) : allExposed ? (
                                        <>
                                            <Eye size={11} />
                                            <span>All on</span>
                                        </>
                                    ) : (
                                        <>
                                            <Eye size={11} />
                                            <span>Partial</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Entity list */}
                            {isExpanded && (() => {
                                const innerQuery = (groupSearch[group.key] || '').toLowerCase().trim();
                                const showInnerSearch = group.entities.length > 8;
                                const innerFiltered = innerQuery
                                    ? group.entities.filter(e =>
                                        e.name.toLowerCase().includes(innerQuery) ||
                                        e.entity_id.toLowerCase().includes(innerQuery) ||
                                        (e.area || '').toLowerCase().includes(innerQuery))
                                    : group.entities;

                                return (
                                    <div className="border-t border-slate-100 bg-white/60">
                                        {showInnerSearch && (
                                            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur px-3 py-2">
                                                <div className="relative">
                                                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input
                                                        type="text"
                                                        placeholder={`Search in ${group.label.toLowerCase()}...`}
                                                        value={groupSearch[group.key] || ''}
                                                        onChange={e => setGroupSearchFor(group.key, e.target.value)}
                                                        onClick={e => e.stopPropagation()}
                                                        className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-[11px] text-slate-700 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200 transition-colors"
                                                    />
                                                    {innerQuery && (
                                                        <button
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                setGroupSearchFor(group.key, '');
                                                            }}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-[10px] text-slate-400 hover:text-slate-600"
                                                            aria-label="Clear search"
                                                        >
                                                            x
                                                        </button>
                                                    )}
                                                </div>
                                                {innerQuery && (
                                                    <div className="mt-1 text-[10px] text-slate-400">
                                                        {innerFiltered.length} of {group.entities.length} match
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {innerFiltered.length === 0 ? (
                                            <div className="px-3 py-4 text-center text-[11px] text-slate-400">
                                                No devices match "{innerQuery}"
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-slate-100">
                                                {innerFiltered.map(e => {
                                                    const isExcluded = excluded.has(e.entity_id);
                                                    const meta = getDomainMeta(e.domain);
                                                    return (
                                                        <label
                                                            key={e.entity_id}
                                                            className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors hover:bg-slate-50 ${
                                                                isExcluded ? 'opacity-60' : ''
                                                            }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={!isExcluded}
                                                                onChange={() => toggleEntity(e.entity_id)}
                                                                className="h-4 w-4 flex-shrink-0 rounded accent-violet-500"
                                                            />
                                                            <span className="flex-shrink-0 text-slate-400">{meta.icon}</span>
                                                            <div className="min-w-0 flex-1">
                                                                <div className={`truncate text-xs font-medium ${
                                                                    isExcluded ? 'text-slate-400 line-through' : 'text-slate-700'
                                                                }`}>
                                                                    {e.name}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                                                    <span className="truncate">{e.entity_id}</span>
                                                                    {e.area && viewMode === 'type' && (
                                                                        <>
                                                                            <span>*</span>
                                                                            <span className="flex items-center gap-0.5 flex-shrink-0">
                                                                                <Home size={9} />
                                                                                {e.area}
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {isExcluded && (
                                                                <EyeOff size={12} className="flex-shrink-0 text-slate-400" />
                                                            )}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    );
                })}
            </div>
        </SettingsSection>
    );
};

export default HaEntityFilterSection;
