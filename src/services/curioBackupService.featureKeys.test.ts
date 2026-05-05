/**
 * Unit tests for backup/restore coverage of dashboard-interactivity-upgrades feature keys.
 *
 * Verifies that each new key pattern introduced by this feature is included
 * in backups and correctly restored.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCurioBackupFile,
  previewCurioBackupFile,
  restoreCurioBackupPayload,
  type CurioBackupAssetAdapter,
  type CurioBackupAssetsV1,
} from './curioBackupService';

const emptyAssets = (): CurioBackupAssetsV1 => ({
  dashboardGalleryImages: [],
  offlineImages: [],
  customWakeWords: [],
  voiceProfiles: [],
});

const createAssetAdapter = () => {
  const adapter: CurioBackupAssetAdapter = {
    exportAssets: vi.fn(async () => emptyAssets()),
    restoreAssets: vi.fn(async () => {}),
  };
  return adapter;
};

const TEST_PASSWORD = 'test-backup-123456';

describe('curioBackupService — feature-owned key coverage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('includes curio_dashboard_presets in backup and restores it', async () => {
    const presets = JSON.stringify([
      { schemaVersion: 1, id: 'preset_1', name: 'Morning', category: 'morning', widgets: [], createdAt: 1700000000000 },
    ]);
    localStorage.setItem('curio_dashboard_presets', presets);

    const adapter = createAssetAdapter();
    const file = await createCurioBackupFile({
      password: TEST_PASSWORD,
      assetAdapter: adapter,
    });

    localStorage.clear();
    const preview = await previewCurioBackupFile(file, TEST_PASSWORD);
    await restoreCurioBackupPayload(preview.payload, {
      assetAdapter: adapter,
      writeSecret: vi.fn(async () => {}),
      runMigrations: () => {},
    });

    expect(localStorage.getItem('curio_dashboard_presets')).toBe(presets);
  });

  it('includes profile-scoped curio_dashboard_presets_<profileId> in backup', async () => {
    const presets = JSON.stringify([{ schemaVersion: 1, id: 'p1', name: 'Focus', category: 'focus', widgets: [], createdAt: 1700000000000 }]);
    localStorage.setItem('curio_dashboard_presets_profile_abc', presets);

    const adapter = createAssetAdapter();
    const file = await createCurioBackupFile({
      password: TEST_PASSWORD,
      assetAdapter: adapter,
    });

    localStorage.clear();
    const preview = await previewCurioBackupFile(file, TEST_PASSWORD);
    await restoreCurioBackupPayload(preview.payload, {
      assetAdapter: adapter,
      writeSecret: vi.fn(async () => {}),
      runMigrations: () => {},
    });

    expect(localStorage.getItem('curio_dashboard_presets_profile_abc')).toBe(presets);
  });

  it('includes curio_widget_sparkline_* keys in backup and restores them', async () => {
    const sparkline = JSON.stringify([{ t: 1700000000000, v: 42.5 }, { t: 1700000060000, v: 43.1 }]);
    localStorage.setItem('curio_widget_sparkline_stock1_price', sparkline);
    localStorage.setItem('curio_widget_sparkline_aqi1_value', JSON.stringify([{ t: 1700000000000, v: 85 }]));

    const adapter = createAssetAdapter();
    const file = await createCurioBackupFile({
      password: TEST_PASSWORD,
      assetAdapter: adapter,
    });

    localStorage.clear();
    const preview = await previewCurioBackupFile(file, TEST_PASSWORD);
    await restoreCurioBackupPayload(preview.payload, {
      assetAdapter: adapter,
      writeSecret: vi.fn(async () => {}),
      runMigrations: () => {},
    });

    expect(localStorage.getItem('curio_widget_sparkline_stock1_price')).toBe(sparkline);
    expect(localStorage.getItem('curio_widget_sparkline_aqi1_value')).toBe(
      JSON.stringify([{ t: 1700000000000, v: 85 }]),
    );
  });

  it('includes curio_widget_state_* keys in backup and restores them', async () => {
    localStorage.setItem('curio_widget_state_w1_rowDisplayMode', JSON.stringify('percent'));
    localStorage.setItem('curio_widget_state_w2_collapsed', JSON.stringify(true));
    localStorage.setItem('curio_widget_state_w3_pinnedItemIds', JSON.stringify(['item1', 'item2']));

    const adapter = createAssetAdapter();
    const file = await createCurioBackupFile({
      password: TEST_PASSWORD,
      assetAdapter: adapter,
    });

    localStorage.clear();
    const preview = await previewCurioBackupFile(file, TEST_PASSWORD);
    await restoreCurioBackupPayload(preview.payload, {
      assetAdapter: adapter,
      writeSecret: vi.fn(async () => {}),
      runMigrations: () => {},
    });

    expect(localStorage.getItem('curio_widget_state_w1_rowDisplayMode')).toBe(JSON.stringify('percent'));
    expect(localStorage.getItem('curio_widget_state_w2_collapsed')).toBe(JSON.stringify(true));
    expect(localStorage.getItem('curio_widget_state_w3_pinnedItemIds')).toBe(JSON.stringify(['item1', 'item2']));
  });

  it('includes InteractivitySettings within curio_dashboard_prefs', async () => {
    const prefs = JSON.stringify({
      layoutMode: 'grid',
      interactivity: {
        animationIntensity: 'subtle',
        ambientPulseEnabled: false,
        rollingNumbersEnabled: true,
        swipeGesturesEnabled: true,
      },
    });
    localStorage.setItem('curio_dashboard_prefs', prefs);

    const adapter = createAssetAdapter();
    const file = await createCurioBackupFile({
      password: TEST_PASSWORD,
      assetAdapter: adapter,
    });

    localStorage.clear();
    const preview = await previewCurioBackupFile(file, TEST_PASSWORD);
    await restoreCurioBackupPayload(preview.payload, {
      assetAdapter: adapter,
      writeSecret: vi.fn(async () => {}),
      runMigrations: () => {},
    });

    const restored = JSON.parse(localStorage.getItem('curio_dashboard_prefs') || '{}');
    expect(restored.interactivity.animationIntensity).toBe('subtle');
    expect(restored.interactivity.ambientPulseEnabled).toBe(false);
  });

  it('includes LinkedWidgetId and pinnedItemIds within curio_dashboard_pages widget configs', async () => {
    const pages = JSON.stringify([
      {
        id: 'page1',
        widgets: [
          { id: 'w1', type: 'pomodoro', config: { linkedTaskId: 'task-abc' } },
          { id: 'w2', type: 'mail', config: { pinnedItemIds: ['mail1', 'mail2'] } },
        ],
      },
    ]);
    localStorage.setItem('curio_dashboard_pages', pages);

    const adapter = createAssetAdapter();
    const file = await createCurioBackupFile({
      password: TEST_PASSWORD,
      assetAdapter: adapter,
    });

    localStorage.clear();
    const preview = await previewCurioBackupFile(file, TEST_PASSWORD);
    await restoreCurioBackupPayload(preview.payload, {
      assetAdapter: adapter,
      writeSecret: vi.fn(async () => {}),
      runMigrations: () => {},
    });

    const restored = JSON.parse(localStorage.getItem('curio_dashboard_pages') || '[]');
    expect(restored[0].widgets[0].config.linkedTaskId).toBe('task-abc');
    expect(restored[0].widgets[1].config.pinnedItemIds).toEqual(['mail1', 'mail2']);
  });

  it('gracefully handles missing feature keys in older backups', async () => {
    // Simulate an older backup that only has basic settings
    localStorage.setItem('curio_user_name', 'TestUser');

    const adapter = createAssetAdapter();
    const file = await createCurioBackupFile({
      password: TEST_PASSWORD,
      assetAdapter: adapter,
    });

    localStorage.clear();
    // Add some feature keys that won't be in the backup
    localStorage.setItem('curio_widget_sparkline_old_price', JSON.stringify([{ t: 1, v: 1 }]));

    const preview = await previewCurioBackupFile(file, TEST_PASSWORD);

    // Restore should not throw even though the backup has no sparkline/state/preset keys
    await expect(
      restoreCurioBackupPayload(preview.payload, {
        assetAdapter: adapter,
        writeSecret: vi.fn(async () => {}),
        runMigrations: () => {},
      }),
    ).resolves.not.toThrow();

    // The user name from backup should be restored
    expect(localStorage.getItem('curio_user_name')).toBe('TestUser');
    // The old sparkline key should be cleared (restore wipes all curio_ keys first)
    expect(localStorage.getItem('curio_widget_sparkline_old_price')).toBeNull();
  });

  it('dispatches curio:settings-changed after restore', async () => {
    localStorage.setItem('curio_dashboard_presets', JSON.stringify([]));

    const adapter = createAssetAdapter();
    const file = await createCurioBackupFile({
      password: TEST_PASSWORD,
      assetAdapter: adapter,
    });

    localStorage.clear();
    const preview = await previewCurioBackupFile(file, TEST_PASSWORD);

    const settingsChangedSpy = vi.fn();
    window.addEventListener('curio:settings-changed', settingsChangedSpy);

    await restoreCurioBackupPayload(preview.payload, {
      assetAdapter: adapter,
      writeSecret: vi.fn(async () => {}),
      runMigrations: () => {},
    });

    expect(settingsChangedSpy).toHaveBeenCalled();
    window.removeEventListener('curio:settings-changed', settingsChangedSpy);
  });
});
