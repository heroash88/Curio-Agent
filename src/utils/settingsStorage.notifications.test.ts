import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROACTIVE_CONFIG } from '../services/proactiveTypes';
import {
  getActiveNotificationRuleCount,
  getNotificationRuleEffectiveEnabled,
  getNotificationSystemStatus,
  getProactiveConfig,
  setNotificationRuleEnabled,
  setNotificationSystemEnabled,
  setProactiveConfig,
  toggleNotificationRuleEnabled,
  updateNotificationRule,
} from './settingsStorage';

describe('shared notification settings backend', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('treats every rule as effectively off when the notification system is paused', () => {
    setProactiveConfig({
      enabled: false,
      rules: DEFAULT_PROACTIVE_CONFIG.rules.map((rule) => ({
        ...rule,
        enabled: true,
      })),
    });

    expect(getActiveNotificationRuleCount()).toBe(0);
    expect(getNotificationRuleEffectiveEnabled('calendar_default')).toBe(false);
    expect(getNotificationSystemStatus()).toMatchObject({
      enabled: false,
      activeRuleCount: 0,
      availableRuleCount: DEFAULT_PROACTIVE_CONFIG.rules.length,
    });
  });

  it('updates rule state through the same saved notification config used by settings and dashboard', () => {
    setProactiveConfig({
      enabled: true,
      rules: DEFAULT_PROACTIVE_CONFIG.rules,
    });

    toggleNotificationRuleEnabled('calendar_default');
    expect(
      getProactiveConfig().rules.find((rule) => rule.id === 'calendar_default')?.enabled,
    ).toBe(false);

    setNotificationRuleEnabled('calendar_default', true);
    expect(getNotificationRuleEffectiveEnabled('calendar_default')).toBe(true);

    updateNotificationRule('weather_default', (rule) => ({
      ...rule,
      priority: 'high',
    }));
    expect(
      getProactiveConfig().rules.find((rule) => rule.id === 'weather_default')?.priority,
    ).toBe('high');

    setNotificationSystemEnabled(false);
    expect(getNotificationRuleEffectiveEnabled('calendar_default')).toBe(false);
    expect(getActiveNotificationRuleCount()).toBe(0);
  });
});
