import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as settingsStorage from './settingsStorage';
import * as automationSettings from './settings/automationSettings';
import * as basicSettings from './settings/basicSettings';
import * as coreSettings from './settings/core';
import * as dashboardSettings from './settings/dashboardSettings';
import * as displaySettings from './settings/displaySettings';
import * as integrationSettings from './settings/integrationSettings';
import * as personalitySettings from './settings/personalitySettings';
import * as settingsStore from './settings/settingsStore';
import * as voiceSettings from './settings/voiceSettings';

describe('settings storage module structure', () => {
  it('keeps settingsStorage as a slim compatibility barrel', () => {
    const source = readFileSync(join(process.cwd(), 'src/utils/settingsStorage.ts'), 'utf8');
    const implementationSignals = [
      'localStorage.setItem',
      'localStorage.getItem',
      'useSyncExternalStore',
      'DEFAULT_PROACTIVE_CONFIG',
      'DEFAULT_DASHBOARD_WIDGETS',
    ];

    expect(source.split(/\r?\n/).length).toBeLessThan(40);
    expect(implementationSignals.some((signal) => source.includes(signal))).toBe(false);
    expect(source).toContain("export * from './settings/core'");
  });

  it('re-exports focused settings modules through the legacy entrypoint', () => {
    expect(settingsStorage.useSettingsStorageValue).toBe(coreSettings.useSettingsStorageValue);
    expect(settingsStorage.useUserName).toBe(basicSettings.useUserName);
    expect(settingsStorage.useThemeMode).toBe(displaySettings.useThemeMode);
    expect(settingsStorage.useHaMcpUrl).toBe(integrationSettings.useHaMcpUrl);
    expect(settingsStorage.useVoiceBackend).toBe(voiceSettings.useVoiceBackend);
    expect(settingsStorage.usePersonalityId).toBe(personalitySettings.usePersonalityId);
    expect(settingsStorage.useDashboardPages).toBe(dashboardSettings.useDashboardPages);
    expect(settingsStorage.useProactiveConfig).toBe(automationSettings.useProactiveConfig);
    expect(settingsStorage.useSettingsStore).toBe(settingsStore.useSettingsStore);
  });
});
