import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPersistedAlarms } from '../utils/settingsStorage';
import { getBuiltInToolDeclarations } from './toolDeclarations';
import { getNotes, saveNote } from './notesPersistence';
import {
  resetSpeakerSessionState,
  setSpeakerSessionState,
} from './speakerSessionStore';
import type { DashboardPage } from './dashboardTypes';
import { getToolHandler, type ToolCallContext } from './toolCallRouter';

const createToolContext = (): ToolCallContext => ({
  disconnect: vi.fn(),
  startHaCameraStream: vi.fn(),
  stopHaCameraStream: vi.fn(),
  isHaCameraStreaming: false,
});

describe('alarm tool handlers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates multiple AI-visible alarms with distinct ids', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);

    const setAlarm = getToolHandler('set_alarm');
    const getAlarms = getToolHandler('get_alarms');
    if (!setAlarm || !getAlarms) {
      throw new Error('Alarm handlers should be registered');
    }

    const ctx = createToolContext();
    await setAlarm({ time: '07:30', label: 'School run' }, ctx);
    await setAlarm({ time: '21:15', label: 'Medicine' }, ctx);

    const persistedAlarms = getPersistedAlarms();
    expect(persistedAlarms).toHaveLength(2);
    expect(new Set(persistedAlarms.map((alarm) => alarm.id)).size).toBe(2);

    const response = await getAlarms({}, ctx);
    expect(response.result).toMatchObject({
      success: true,
      alarms: [
        expect.objectContaining({ label: 'School run', time: '07:30', enabled: true }),
        expect.objectContaining({ label: 'Medicine', time: '21:15', enabled: true }),
      ],
    });
  });

  it('does not report an alarm delete when no alarm matches', async () => {
    const setAlarm = getToolHandler('set_alarm');
    const deleteAlarm = getToolHandler('delete_alarm');
    if (!setAlarm || !deleteAlarm) {
      throw new Error('Alarm handlers should be registered');
    }

    const ctx = createToolContext();
    await setAlarm({ time: '07:30', label: 'School run' }, ctx);

    const response = await deleteAlarm({ label: 'Medicine' }, ctx);

    expect(response.result).toMatchObject({
      success: false,
      deleted: 0,
      remaining: 1,
    });
    expect(getPersistedAlarms()).toEqual([
      expect.objectContaining({ label: 'School run', time: '07:30' }),
    ]);
  });
});

describe('camera tool handlers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes flipCamera calls to the live camera handler', async () => {
    const flipCamera = vi.fn().mockResolvedValue({
      success: true,
      enabled: true,
      frameReady: true,
      framesCaptured: 2,
      facingMode: 'user',
      canFlipCamera: true,
    });
    const handler = getToolHandler('flipCamera');
    if (!handler) {
      throw new Error('flipCamera handler should be registered');
    }

    const response = await handler({}, {
      ...createToolContext(),
      handler: { flipCamera } as any,
    });

    expect(flipCamera).toHaveBeenCalledOnce();
    expect(response).toMatchObject({
      emittedCard: false,
      result: {
        success: true,
        cameraEnabled: true,
        facingMode: 'user',
        canFlipCamera: true,
      },
    });
  });

  it('does not report a Home Assistant camera stream when no camera can be resolved', async () => {
    const showCamera = getToolHandler('show_camera');
    if (!showCamera) {
      throw new Error('show_camera handler should be registered');
    }

    const response = await showCamera({ cameraName: 'Front Door' }, createToolContext());

    expect(response).toMatchObject({
      emittedCard: false,
      result: {
        success: false,
      },
    });
    expect(response.result.error).toContain('camera');
  });

  it('resolves a Home Assistant camera by friendly name before opening the card', async () => {
    vi.stubGlobal('crypto', { ...globalThis.crypto, subtle: undefined });
    window.localStorage.setItem('curio_ha_mcp_url', 'http://ha.local/api/mcp');
    window.localStorage.setItem('curio_ha_mcp_token', 'ha-token');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ path: '/api/camera_proxy_stream/camera.front_door?token=signed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const showCamera = getToolHandler('show_camera');
    if (!showCamera) {
      throw new Error('show_camera handler should be registered');
    }
    const onCardEvent = vi.fn();
    const startHaCameraStream = vi.fn().mockResolvedValue(undefined);

    const response = await showCamera({ cameraName: 'Front Door' }, {
      ...createToolContext(),
      entityCache: [
        { entity_id: 'camera.front_door', name: 'Front Door' },
        { entity_id: 'camera.garage', name: 'Garage' },
      ],
      onCardEvent,
      startHaCameraStream,
    });

    expect(response.result).toMatchObject({
      success: true,
      entityId: 'camera.front_door',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://ha.local/api/auth/sign_path',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer ha-token' }),
      }),
    );
    expect(startHaCameraStream).toHaveBeenCalledWith('camera.front_door', 'http://ha.local', 'ha-token');
    expect(onCardEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'camera',
      data: expect.objectContaining({
        entityId: 'camera.front_door',
        cameraName: 'Front Door',
        haUrl: 'http://ha.local',
      }),
    }));
  });
});

describe('tool registry coverage', () => {
  it('has a registered handler for every built-in function declaration', () => {
    const missing = getBuiltInToolDeclarations()
      .map((declaration) => declaration.name)
      .filter((name): name is string => Boolean(name))
      .filter((name) => !getToolHandler(name));

    expect(missing).toEqual([]);
  });

  it('has a handler for the Gemini Live search proxy declaration', () => {
    expect(getToolHandler('google_search')).toBeDefined();
  });
});

describe('personal note tool handlers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns note ids so follow-up tool calls can target personal notes', async () => {
    const note = saveNote('Pick up blue notebook', 'general');
    const getMyNotes = getToolHandler('getMyNotes');
    if (!getMyNotes) {
      throw new Error('getMyNotes handler should be registered');
    }

    const response = await getMyNotes({}, createToolContext());

    expect(response.result.notes).toEqual([
      expect.objectContaining({
        id: note.id,
        index: 1,
        text: 'Pick up blue notebook',
      }),
    ]);
  });

  it('deletes a personal note by id', async () => {
    const keep = saveNote('Keep this note');
    const remove = saveNote('Delete this note');
    const deletePersonalNote = getToolHandler('deleteNote');
    if (!deletePersonalNote) {
      throw new Error('deleteNote handler should be registered');
    }

    const response = await deletePersonalNote({ id: remove.id }, createToolContext());

    expect(response.result).toMatchObject({
      success: true,
      noteDeleted: true,
      noteId: remove.id,
    });
    expect(getNotes()).toEqual([
      expect.objectContaining({ id: keep.id, text: 'Keep this note' }),
    ]);
  });

  it('updates a personal note by list index when the model has no id', async () => {
    saveNote('Original note');
    const updatePersonalNote = getToolHandler('updateNote');
    if (!updatePersonalNote) {
      throw new Error('updateNote handler should be registered');
    }

    const response = await updatePersonalNote({
      index: 1,
      newText: 'Updated note',
    }, createToolContext());

    expect(response.result).toMatchObject({
      success: true,
      noteUpdated: true,
      text: 'Updated note',
    });
    expect(getNotes()).toEqual([
      expect.objectContaining({ text: 'Updated note' }),
    ]);
  });
});

describe('sports score tool handler', () => {
  it('returns the displayed score details to the model after emitting the card', async () => {
    const showSportsScore = getToolHandler('show_sports_score');
    if (!showSportsScore) {
      throw new Error('show_sports_score handler should be registered');
    }

    const onCardEvent = vi.fn();
    const response = await showSportsScore({
      homeTeam: 'Manchester United',
      awayTeam: 'Brentford',
      homeScore: 4,
      awayScore: 3,
      status: 'Final',
      homeLogoUrl: 'https://example.test/mu.png',
      awayLogoUrl: 'https://example.test/brentford.png',
    }, {
      ...createToolContext(),
      onCardEvent,
    });

    expect(onCardEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'sportsScore',
      data: expect.objectContaining({
        homeTeam: 'Manchester United',
        awayTeam: 'Brentford',
        homeScore: 4,
        awayScore: 3,
        status: 'Final',
      }),
    }));
    expect(response.result).toMatchObject({
      success: true,
      homeTeam: 'Manchester United',
      awayTeam: 'Brentford',
      homeScore: 4,
      awayScore: 3,
      status: 'Final',
    });
  });
});

describe('dashboard theme tool handler', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(Date, 'now').mockReturnValue(9876543210);
    setSpeakerSessionState({
      activeProfileId: 'profile-a',
      activeProfileName: 'Alex',
      source: 'recognized',
      recognizedBy: 'voice',
      confidence: 0.92,
      lastRecognizedProfileId: 'profile-a',
      lastRecognizedProfileName: 'Alex',
      updatedAt: 1,
    });
  });

  afterEach(() => {
    resetSpeakerSessionState();
    vi.restoreAllMocks();
  });

  it('applies an animated AI theme to the active profile dashboard page', async () => {
    const pages: DashboardPage[] = [
      {
        id: 'home',
        name: 'Home',
        appearance: { accentPreset: 'cobalt', backgroundStyle: 'default' },
        widgets: [],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'lab',
        name: 'Lab',
        appearance: { accentPreset: 'graphite', backgroundStyle: 'solid' },
        widgets: [],
        createdAt: 2,
        updatedAt: 2,
      },
    ];
    localStorage.setItem('curio_dashboard_pages_profile-a', JSON.stringify(pages));
    localStorage.setItem('curio_dashboard_active_page_profile-a', 'lab');

    const handler = getToolHandler('generate_dashboard_theme');
    if (!handler) {
      throw new Error('generate_dashboard_theme handler should be registered');
    }

    const response = await handler({
      themeMode: 'dark',
      accentPreset: 'neon',
      backgroundStyle: 'animated',
      backgroundColor: '#02130d',
      glassEffectEnabled: true,
      animationPreset: 'matrix',
    }, createToolContext());

    expect(response.result).toMatchObject({
      success: true,
      pageId: 'lab',
      profileId: 'profile-a',
      appearance: {
        themeMode: 'dark',
        accentPreset: 'neon',
        backgroundStyle: 'animated',
        backgroundColor: '#02130d',
        glassEffectEnabled: true,
        animationPreset: 'matrix',
      },
    });
    expect(JSON.parse(localStorage.getItem('curio_dashboard_pages_profile-a') || '[]'))
      .toEqual([
        expect.objectContaining({
          id: 'home',
          appearance: expect.objectContaining({ accentPreset: 'cobalt' }),
        }),
        expect.objectContaining({
          id: 'lab',
          updatedAt: 9876543210,
          appearance: expect.objectContaining({
            themeMode: 'dark',
            accentPreset: 'neon',
            backgroundStyle: 'animated',
            backgroundColor: '#02130d',
            glassEffectEnabled: true,
            animationPreset: 'matrix',
          }),
        }),
      ]);
  });

  it('can infer a matrix theme from a natural-language prompt', async () => {
    localStorage.setItem(
      'curio_dashboard_pages_profile-a',
      JSON.stringify([
        {
          id: 'home',
          name: 'Home',
          widgets: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ] satisfies DashboardPage[]),
    );
    localStorage.setItem('curio_dashboard_active_page_profile-a', 'home');

    const handler = getToolHandler('generate_dashboard_theme');
    if (!handler) {
      throw new Error('generate_dashboard_theme handler should be registered');
    }

    const response = await handler({
      prompt: 'Make my dashboard look like the Matrix terminal',
    }, createToolContext());

    expect(response.result).toMatchObject({
      success: true,
      appearance: {
        themeMode: 'dark',
        accentPreset: 'neon',
        backgroundStyle: 'animated',
        animationPreset: 'matrix',
      },
    });
  });

  it('persists AI-generated animated background specs from tool calls', async () => {
    localStorage.setItem(
      'curio_dashboard_pages_profile-a',
      JSON.stringify([
        {
          id: 'home',
          name: 'Home',
          widgets: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ] satisfies DashboardPage[]),
    );
    localStorage.setItem('curio_dashboard_active_page_profile-a', 'home');

    const handler = getToolHandler('generate_dashboard_theme');
    if (!handler) {
      throw new Error('generate_dashboard_theme handler should be registered');
    }

    const response = await handler({
      themeMode: 'light',
      accentColor: '#7dd3fc',
      backgroundStyle: 'animated',
      animationPreset: 'generated',
      generatedAnimation: {
        kind: 'waves',
        colors: ['#7dd3fc', '#f0abfc'],
        density: 46,
        speed: 28,
        complexity: 72,
        shape: 'lines',
        direction: 'right',
        glow: true,
      },
    }, createToolContext());

    expect(response.result).toMatchObject({
      success: true,
      appearance: {
        themeMode: 'light',
        accentColor: '#7dd3fc',
        backgroundStyle: 'animated',
        animationPreset: 'generated',
        generatedAnimation: {
          kind: 'waves',
          colors: ['#7dd3fc', '#f0abfc'],
          density: 46,
          speed: 28,
          complexity: 72,
          shape: 'lines',
          direction: 'right',
          glow: true,
        },
      },
    });
  });

  it('can reset the active dashboard page theme', async () => {
    localStorage.setItem(
      'curio_dashboard_pages_profile-a',
      JSON.stringify([
        {
          id: 'home',
          name: 'Home',
          widgets: [],
          appearance: {
            themeMode: 'dark',
            accentPreset: 'neon',
            accentColor: '#22f7a5',
            backgroundStyle: 'animated',
            backgroundColor: '#02130d',
            glassEffectEnabled: true,
            animationPreset: 'matrix',
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ] satisfies DashboardPage[]),
    );
    localStorage.setItem('curio_dashboard_active_page_profile-a', 'home');

    const handler = getToolHandler('reset_dashboard_theme');
    if (!handler) {
      throw new Error('reset_dashboard_theme handler should be registered');
    }

    const response = await handler({}, createToolContext());

    expect(response.result).toMatchObject({
      success: true,
      pageId: 'home',
      appearance: {},
    });
    expect(JSON.parse(localStorage.getItem('curio_dashboard_pages_profile-a') || '[]'))
      .toEqual([
        expect.objectContaining({
          id: 'home',
        }),
      ]);
    expect(JSON.parse(localStorage.getItem('curio_dashboard_pages_profile-a') || '[]')[0])
      .not.toHaveProperty('appearance');
  });
});
