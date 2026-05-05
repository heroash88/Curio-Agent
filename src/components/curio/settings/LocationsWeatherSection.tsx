import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Thermometer, RotateCcw, Home, Briefcase, Navigation2, Tag, MapPin, Globe, Trash2 } from 'lucide-react';
import { setCustomLocations } from '../../../utils/settingsStorage';
import type { CustomLocationEntry } from '../../../utils/settingsStorage';
import SettingsSection from '../SettingsSection';
import type { CitySuggestion } from './settingsTypes';

interface LocationsWeatherSectionProps {
    open: boolean;
    tempUnit: string;
    setTempUnit: (v: 'F' | 'C') => void;
    weatherCity: string;
    setWeatherCity: (v: string) => void;
    localHomeLocation: string;
    setLocalHomeLocation: (v: string) => void;
    homeLocation: string;
    setHomeLocation: (v: string) => void;
    localWorkLocation: string;
    setLocalWorkLocation: (v: string) => void;
    workLocation: string;
    setWorkLocation: (v: string) => void;
    localCustomLocations: CustomLocationEntry[];
    setLocalCustomLocations: (v: CustomLocationEntry[]) => void;
    onRefreshWeather: () => void;
}

const LocationsWeatherSection: React.FC<LocationsWeatherSectionProps> = ({
    open,
    tempUnit, setTempUnit,
    weatherCity, setWeatherCity,
    localHomeLocation, setLocalHomeLocation,
    homeLocation, setHomeLocation,
    localWorkLocation, setLocalWorkLocation,
    workLocation, setWorkLocation,
    localCustomLocations, setLocalCustomLocations,
    onRefreshWeather,
}) => {
    const [cityQuery, setCityQuery] = useState(() => localStorage.getItem('curio-city-query') || weatherCity);
    const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [cityInputFocused, setCityInputFocused] = useState(false);
    const [homeSuggestions, setHomeSuggestions] = useState<string[]>([]);
    const [showHomeSuggestions, setShowHomeSuggestions] = useState(false);
    const [homeInputFocused, setHomeInputFocused] = useState(false);
    const [workSuggestions, setWorkSuggestions] = useState<string[]>([]);
    const [showWorkSuggestions, setShowWorkSuggestions] = useState(false);
    const [workInputFocused, setWorkInputFocused] = useState(false);
    const [activeCustomIdx, setActiveCustomIdx] = useState<number | null>(null);
    const [customSuggestions, setCustomSuggestions] = useState<string[]>([]);
    const [showCustomSuggestions, setShowCustomSuggestions] = useState(false);
    const [customInputFocused, setCustomInputFocused] = useState(false);
    const blurTimerRef = useRef<number | null>(null);
    const skipNextSuggestionsRef = useRef(false);

    // Sync city query when modal opens
    useEffect(() => {
        if (open) {
            setCityQuery(localStorage.getItem('curio-city-query') || weatherCity);
            setCityInputFocused(false);
            setShowSuggestions(false);
            setCitySuggestions([]);
        } else {
            if (blurTimerRef.current !== null) {
                window.clearTimeout(blurTimerRef.current);
                blurTimerRef.current = null;
            }
        }
    }, [open, weatherCity]);

    // Persist city query
    useEffect(() => {
        if (open) localStorage.setItem('curio-city-query', cityQuery);
    }, [cityQuery, open]);

    // City geocoding
    useEffect(() => {
        if (!open || !cityInputFocused || !cityQuery || cityQuery.length < 2) {
            setCitySuggestions([]);
            return;
        }
        if (skipNextSuggestionsRef.current) {
            skipNextSuggestionsRef.current = false;
            setCitySuggestions([]);
            setShowSuggestions(false);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery.split(',')[0].trim())}&count=5&language=en&format=json`, { signal: controller.signal })
                .then((r) => { if (!r.ok) throw new Error('City lookup failed'); return r.json(); })
                .then((data) => {
                    if (!Array.isArray(data.results)) { setCitySuggestions([]); return; }
                    setCitySuggestions(data.results.map((item: any) => ({ name: item.name, country: item.country_code || item.country || '', state: item.admin1, lat: item.latitude, lon: item.longitude })));
                    setShowSuggestions(true);
                })
                .catch((e) => { if (e.name !== 'AbortError') setCitySuggestions([]); });
        }, 400);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [cityInputFocused, cityQuery, open]);

    // Home address search
    useEffect(() => {
        if (!open || !homeInputFocused || !localHomeLocation || localHomeLocation.length < 3) { setHomeSuggestions([]); setShowHomeSuggestions(false); return; }
        const controller = new AbortController();
        const timer = setTimeout(() => {
            fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(localHomeLocation)}&limit=5`, { signal: controller.signal })
                .then(r => r.json())
                .then(data => { if (data.features) { const results = data.features.map((f: any) => formatPhotonResult(f)); setHomeSuggestions(results); setShowHomeSuggestions(results.length > 0); } })
                .catch(() => setHomeSuggestions([]));
        }, 400);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [localHomeLocation, homeInputFocused, open]);

    // Work address search
    useEffect(() => {
        if (!open || !workInputFocused || !localWorkLocation || localWorkLocation.length < 3) { setWorkSuggestions([]); setShowWorkSuggestions(false); return; }
        const controller = new AbortController();
        const timer = setTimeout(() => {
            fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(localWorkLocation)}&limit=5`, { signal: controller.signal })
                .then(r => r.json())
                .then(data => { if (data.features) { const results = data.features.map((f: any) => formatPhotonResult(f)); setWorkSuggestions(results); setShowWorkSuggestions(results.length > 0); } })
                .catch(() => setWorkSuggestions([]));
        }, 400);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [localWorkLocation, workInputFocused, open]);

    // Custom location address search
    useEffect(() => {
        const activeAddr = activeCustomIdx !== null ? localCustomLocations[activeCustomIdx]?.address || '' : '';
        if (!open || !customInputFocused || !activeAddr || activeAddr.length < 3) { setCustomSuggestions([]); setShowCustomSuggestions(false); return; }
        const controller = new AbortController();
        const timer = setTimeout(() => {
            fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(activeAddr)}&limit=5`, { signal: controller.signal })
                .then(r => r.json())
                .then(data => { if (data.features) { const results = data.features.map((f: any) => formatPhotonResult(f)); setCustomSuggestions(results); setShowCustomSuggestions(results.length > 0); } })
                .catch(() => setCustomSuggestions([]));
        }, 400);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [activeCustomIdx, localCustomLocations, customInputFocused, open]);

    const handleCityInputBlur = useCallback(() => {
        setCityInputFocused(false);
        blurTimerRef.current = window.setTimeout(() => setShowSuggestions(false), 250);
    }, []);

    const handleCitySuggestionSelect = useCallback((suggestion: CitySuggestion) => {
        const label = suggestion.state ? `${suggestion.name}, ${suggestion.state}, ${suggestion.country}` : `${suggestion.name}, ${suggestion.country}`;
        skipNextSuggestionsRef.current = true;
        setCitySuggestions([]);
        setShowSuggestions(false);
        setCityInputFocused(false);
        setCityQuery(label);
        setWeatherCity(label);
        localStorage.setItem('curio-city-query', label);
    }, [setWeatherCity]);

    return (
        <SettingsSection title="Locations & Weather" icon={<MapPin size={18} className="text-rose-500" />}>
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 py-1.5">
                    <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-semibold text-slate-700"><Thermometer size={14} className="inline text-orange-500 mr-1" />Temperature Unit</span>
                        <span className="text-[10px] text-slate-400 italic">{tempUnit === 'F' ? 'Fahrenheit' : 'Celsius'}</span>
                    </div>
                    <button onClick={() => setTempUnit(tempUnit === 'F' ? 'C' : 'F')} className="rounded-xl bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-300 transition-all active:scale-95">
                        {tempUnit === 'F' ? 'F -> C' : 'C -> F'}
                    </button>
                </div>

                {/* Weather City */}
                <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Globe size={14} className="text-sky-500" /> Weather City</label>
                    <div className="relative">
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition-all focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
                            <input
                                type="text"
                                placeholder="City (empty = auto-detect)"
                                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                                value={cityQuery}
                                onChange={(event) => {
                                    setCityQuery(event.target.value);
                                    if (!event.target.value) { setWeatherCity(''); setCitySuggestions([]); }
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                                onFocus={() => { setCityInputFocused(true); if (citySuggestions.length > 0) setShowSuggestions(true); }}
                                onBlur={handleCityInputBlur}
                            />
                            {cityQuery && (
                                <button
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={(event) => { event.stopPropagation(); setCityQuery(''); setWeatherCity(''); setCitySuggestions([]); setShowSuggestions(false); }}
                                    className="text-xs font-bold text-slate-400 hover:text-slate-600"
                                >Clear</button>
                            )}
                        </div>
                        {showSuggestions && citySuggestions.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-[110] mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                                {citySuggestions.map((suggestion, index) => (
                                    <button
                                        key={`${suggestion.name}-${suggestion.country}-${index}`}
                                        onPointerDown={(event) => { event.preventDefault(); handleCitySuggestionSelect(suggestion); }}
                                        onClick={(e) => e.preventDefault()}
                                        className="flex w-full items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors last:border-0 hover:bg-sky-50"
                                    >
                                        <span>{suggestion.name}{suggestion.state ? `, ${suggestion.state}` : ''}, <span className="text-slate-400">{suggestion.country}</span></span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Home Address */}
                <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Home size={14} className="text-emerald-500" /> Home Address</label>
                    <div className="relative">
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition-all focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
                            <input type="text" placeholder="Full address (e.g. 123 Main St, Apt 4B, City, State)" className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" value={localHomeLocation} onChange={(e) => setLocalHomeLocation(e.target.value)}
                                onFocus={() => { setHomeInputFocused(true); if (homeSuggestions.length > 0) setShowHomeSuggestions(true); }}
                                onBlur={() => { setTimeout(() => { setHomeInputFocused(false); setShowHomeSuggestions(false); if (localHomeLocation !== homeLocation) setHomeLocation(localHomeLocation); }, 200); }}
                                onKeyDown={(e) => e.stopPropagation()} />
                        </div>
                        {showHomeSuggestions && homeSuggestions.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-[110] mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                                {homeSuggestions.map((suggestion, index) => (
                                    <button key={`home-${index}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { setLocalHomeLocation(suggestion); setHomeLocation(suggestion); setShowHomeSuggestions(false); }}
                                        className="flex w-full items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors last:border-0 hover:bg-sky-50">
                                        <span>{suggestion}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="px-1 text-[10px] italic text-slate-400">Include house/apt number. Used for commute and directions.</p>
                </div>

                {/* Work Address */}
                <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Briefcase size={14} className="text-blue-500" /> Work Address</label>
                    <div className="relative">
                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition-all focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
                            <input type="text" placeholder="Full address (e.g. 456 Corporate Dr, Suite 200, City)" className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" value={localWorkLocation} onChange={(e) => setLocalWorkLocation(e.target.value)}
                                onFocus={() => { setWorkInputFocused(true); if (workSuggestions.length > 0) setShowWorkSuggestions(true); }}
                                onBlur={() => { setTimeout(() => { setWorkInputFocused(false); setShowWorkSuggestions(false); if (localWorkLocation !== workLocation) setWorkLocation(localWorkLocation); }, 200); }}
                                onKeyDown={(e) => e.stopPropagation()} />
                        </div>
                        {showWorkSuggestions && workSuggestions.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-[110] mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                                {workSuggestions.map((suggestion, index) => (
                                    <button key={`work-${index}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { setLocalWorkLocation(suggestion); setWorkLocation(suggestion); setShowWorkSuggestions(false); }}
                                        className="flex w-full items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors last:border-0 hover:bg-sky-50">
                                        <span>{suggestion}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Custom Locations */}
                <div className="space-y-2 rounded-xl bg-slate-50/60 p-3 border border-slate-100">
                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Navigation2 size={14} className="text-violet-500" /> Custom Locations</label>
                        <button onClick={() => { const updated = [...localCustomLocations, { label: '', address: '' }]; setLocalCustomLocations(updated); setActiveCustomIdx(updated.length - 1); }}
                            className="flex items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1 text-[10px] font-bold text-violet-600 transition-all hover:bg-violet-200 active:scale-95">+ Add</button>
                    </div>
                    <p className="text-[10px] text-slate-400 italic">Frequently visited places -- Curio will know about them.</p>
                    {localCustomLocations.length === 0 && (
                        <p className="text-[11px] text-slate-400 text-center py-3">No custom locations yet. Tap "Add" to create one.</p>
                    )}
                    <div className="space-y-2">
                        {localCustomLocations.map((loc, idx) => (
                            <div key={idx} className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2.5">
                                <div className="flex items-center gap-2">
                                    <Tag size={13} className="shrink-0 text-violet-400" />
                                    <input type="text" placeholder="Label (e.g. Gym, School)" className="flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400" value={loc.label}
                                        onChange={(e) => { const updated = [...localCustomLocations]; updated[idx] = { ...updated[idx], label: e.target.value }; setLocalCustomLocations(updated); }}
                                        onBlur={() => setCustomLocations(localCustomLocations.filter(l => l.label || l.address))}
                                        onKeyDown={(e) => e.stopPropagation()} />
                                    <button onClick={() => { const updated = localCustomLocations.filter((_, i) => i !== idx); setLocalCustomLocations(updated); setCustomLocations(updated); if (activeCustomIdx === idx) { setActiveCustomIdx(null); setShowCustomSuggestions(false); } else if (activeCustomIdx !== null && activeCustomIdx > idx) setActiveCustomIdx(activeCustomIdx - 1); }}
                                        className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500" title="Remove"><Trash2 size={14} /></button>
                                </div>
                                <div className="relative">
                                    <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 transition-all focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
                                        <MapPin size={13} className="shrink-0 text-slate-400" />
                                        <input type="text" placeholder="Full address" className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" value={loc.address}
                                            onChange={(e) => { const updated = [...localCustomLocations]; updated[idx] = { ...updated[idx], address: e.target.value }; setLocalCustomLocations(updated); }}
                                            onFocus={() => { setActiveCustomIdx(idx); setCustomInputFocused(true); if (customSuggestions.length > 0) setShowCustomSuggestions(true); }}
                                            onBlur={() => { setTimeout(() => { setCustomInputFocused(false); setShowCustomSuggestions(false); setCustomLocations(localCustomLocations.filter(l => l.label || l.address)); }, 200); }}
                                            onKeyDown={(e) => e.stopPropagation()} />
                                    </div>
                                    {activeCustomIdx === idx && showCustomSuggestions && customSuggestions.length > 0 && (
                                        <div className="absolute left-0 right-0 top-full z-[110] mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                                            {customSuggestions.map((suggestion, sIdx) => (
                                                <button key={`custom-${idx}-${sIdx}`} onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => { const updated = [...localCustomLocations]; updated[idx] = { ...updated[idx], address: suggestion }; setLocalCustomLocations(updated); setCustomLocations(updated.filter(l => l.label || l.address)); setShowCustomSuggestions(false); }}
                                                    className="flex w-full items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors last:border-0 hover:bg-violet-50">
                                                    <span>{suggestion}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end pt-1">
                    <button onClick={onRefreshWeather} className="flex items-center gap-1.5 rounded-xl bg-slate-200 px-4 py-1.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-300 active:scale-95">
                        <RotateCcw size={13} /> Refresh Weather
                    </button>
                </div>
            </div>
        </SettingsSection>
    );
};

/** Format a Photon geocoding result into a readable address string. */
function formatPhotonResult(f: any): string {
    const p = f.properties;
    const parts: string[] = [];
    if (p.name && p.name !== p.street) parts.push(p.name);
    if (p.street) parts.push(p.housenumber ? `${p.street} ${p.housenumber}` : p.street);
    if (p.city) parts.push(p.city);
    if (p.state) parts.push(p.state);
    if (p.country) parts.push(p.country);
    return parts.join(', ');
}

export default React.memo(LocationsWeatherSection);
