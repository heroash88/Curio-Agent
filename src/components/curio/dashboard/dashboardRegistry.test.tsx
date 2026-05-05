import { describe, expect, it } from 'vitest';
import { WIDGET_CATALOG } from '../../../services/dashboardTypes';
import {
  DASHBOARD_WIDGET_GROUPS,
  WIDGET_COMPONENTS,
} from './dashboardRegistry';

describe('dashboard widget catalog', () => {
  it('replaces the redundant countdown widget with a stopwatch widget', () => {
    const catalogTypes = WIDGET_CATALOG.map((item) => item.type);
    const groupedTypes = DASHBOARD_WIDGET_GROUPS.flatMap((group) => group.types);

    expect(catalogTypes).not.toContain('countdowns');
    expect(groupedTypes).not.toContain('countdowns');
    expect(catalogTypes).toContain('stopwatch');
    expect(groupedTypes).toContain('stopwatch');
    expect((WIDGET_COMPONENTS as Record<string, unknown>).stopwatch).toBeDefined();
  });

  it('exposes AI chat in the communication picker and component registry', () => {
    const catalogTypes = WIDGET_CATALOG.map((item) => item.type);
    const communicationTypes = DASHBOARD_WIDGET_GROUPS.find((group) => group.key === 'communication')?.types || [];

    expect(catalogTypes).toContain('ai_chat');
    expect(communicationTypes).toContain('ai_chat');
    expect((WIDGET_COMPONENTS as Record<string, unknown>).ai_chat).toBeDefined();
  });
});
