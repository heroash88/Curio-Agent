import { describe, expect, it } from 'vitest';

import { buildDashboardSearchResults } from './dashboardSearch';
import type { DashboardWidget } from './dashboardTypes';
import type { WeatherData } from './weatherService';

describe('dashboardSearch', () => {
  it('does not return default results before the user enters a query', () => {
    const widgets = [
      { id: 'weather_1', type: 'weather', enabled: true, config: { w: 2, h: 2 } },
      { id: 'notes_1', type: 'rich_note', enabled: true, config: { richNoteHtml: '<p>Project notes</p>' } },
    ] as DashboardWidget[];

    expect(buildDashboardSearchResults(widgets, '', { tempUnit: 'F' })).toEqual([]);
    expect(buildDashboardSearchResults(widgets, '   ', { tempUnit: 'F' })).toEqual([]);
  });

  it('returns contextual weather data for on-screen weather widgets', () => {
    const widgets = [
      { id: 'weather_1', type: 'weather', enabled: true, config: { w: 2, h: 2 } },
      { id: 'notes_1', type: 'rich_note', enabled: true, config: { richNoteHtml: '<p>Project notes</p>' } },
    ] as DashboardWidget[];
    const weather = {
      city: 'Sample City',
      desc: 'Clear',
      tempF: 57,
      tempC: 14,
      icon: 'sun',
      humidity: 56,
      windSpeedMph: 4,
      daily: [{ date: 'Fri', highF: 59, lowF: 41, highC: 15, lowC: 5, icon: 'sun', condition: 'Clear' }],
    } as WeatherData;

    const results = buildDashboardSearchResults(widgets, 'weather', {
      weather,
      aqi: { value: 22, category: 'Good', color: '#22c55e' },
      tempUnit: 'F',
    });

    expect(results[0]).toMatchObject({
      widgetId: 'weather_1',
      label: 'Weather',
      title: '57°F and Clear',
    });
    expect(results[0].summary).toContain('Sample City');
    expect(results[0].summary).toContain('H 59° / L 41°');
    expect(results[0].detail).toContain('Humidity 56%');
    expect(results[0].detail).toContain('Air Good');
  });

  it('searches content that already lives inside visible widgets', () => {
    const widgets = [
      { id: 'note_1', type: 'rich_note', enabled: true, config: { richNoteHtml: '<h2>Trip Plan</h2><p>Pack umbrella and camera.</p>' } },
      { id: 'table_1', type: 'table', enabled: true, config: { tableCells: [['Room', 'Status'], ['Kitchen', 'Clean']] } },
    ] as DashboardWidget[];

    expect(buildDashboardSearchResults(widgets, 'umbrella', { tempUnit: 'F' })[0]).toMatchObject({
      widgetId: 'note_1',
      label: 'Sticky Note',
    });
    expect(buildDashboardSearchResults(widgets, 'kitchen', { tempUnit: 'F' })[0]).toMatchObject({
      widgetId: 'table_1',
      label: 'Table',
    });
  });
});
