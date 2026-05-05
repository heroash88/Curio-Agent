import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopCardOverlayApp from './DesktopCardOverlayApp';
import type { Card } from '../../services/cardTypes';
import type { DesktopCardsSnapshot, CurioDesktopBridge } from '../../desktop/desktopTypes';

let snapshot: DesktopCardsSnapshot;
const sendCardAction = vi.fn();
const setCardsWindowMousePassthrough = vi.fn();
const setCardsWindowLayout = vi.fn();

vi.mock('../../desktop/desktopBridge', () => ({
  getCurioDesktopBridge: () => ({
    role: 'cards',
    startFloatingFace: vi.fn(),
    stopFloatingFace: vi.fn(),
    openMainWindow: vi.fn(),
    openSettings: vi.fn(),
    publishFaceSnapshot: vi.fn(),
    publishCardsSnapshot: vi.fn(),
    setCardsWindowMousePassthrough,
    setCardsWindowLayout,
    sendFaceCommand: vi.fn(),
    sendCardAction,
    onFaceSnapshot: vi.fn(() => vi.fn()),
    onCardsSnapshot: vi.fn((listener: (nextSnapshot: DesktopCardsSnapshot) => void) => {
      listener(snapshot);
      return vi.fn();
    }),
    onFaceCommand: vi.fn(() => vi.fn()),
    onCardAction: vi.fn(() => vi.fn()),
    onFloatingModeChange: vi.fn(() => vi.fn()),
  } satisfies CurioDesktopBridge),
  getCurioDesktopRole: () => 'cards',
}));

vi.mock('../../hooks/useCardTheme', () => ({
  useCardTheme: () => ({
    dark: true,
    text: 'text-white',
    text2: 'text-slate-300',
    muted: 'text-slate-400',
    faint: 'text-slate-500',
    panel: 'bg-black/10',
    panelBorder: 'border-white/10',
    btn: 'bg-white/10',
    btnText: 'text-white',
  }),
}));

const createCard = (id: string, type: string, data: Record<string, unknown>): Card => ({
  id,
  type,
  data,
  createdAt: Date.now(),
  autoDismissMs: 0,
  persistent: true,
  animationState: 'visible',
});

describe('DesktopCardOverlayApp', () => {
  beforeEach(() => {
    sendCardAction.mockReset();
    setCardsWindowMousePassthrough.mockReset();
    setCardsWindowLayout.mockReset();
    snapshot = {
      externalized: true,
      cards: [
        createCard('timer-card', 'timer', {
          label: 'Cooking Timer',
          isAlarm: false,
          targetTime: Date.now() + 300_000,
          duration: 300_000,
          completionState: 'running',
        }),
        createCard('device-card', 'device', {
          entityId: 'light.living_room',
          friendlyName: 'Living Room Light',
          domain: 'light',
          action: 'turn_on',
          state: 'on',
          resolvedState: 'on',
          controlKind: 'toggle',
          supportedActions: ['turn_on', 'turn_off'],
        }),
        createCard('media-card', 'media', {
          entityId: 'media_player.living_room',
          playerName: 'Living Room Speaker',
          playbackState: 'paused',
          trackTitle: 'Lo-fi Focus',
          artistName: 'Curio Radio',
          supportedActions: ['media_play', 'media_pause'],
        }),
      ],
    };
  });

  it('renders provider-backed cards in the floating desktop overlay', async () => {
    render(<DesktopCardOverlayApp />);

    expect(await screen.findByText('Cooking Timer')).toBeInTheDocument();
    expect(await screen.findByText('Living Room Light')).toBeInTheDocument();
    expect(await screen.findByText('Living Room Speaker')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Card failed to render')).not.toBeInTheDocument();
    });
  });

  it('clears the shared root background for transparent desktop windows', () => {
    snapshot = { externalized: false, cards: [] };
    document.documentElement.style.background = 'rgb(2, 6, 23)';
    document.body.style.background = 'rgb(2, 6, 23)';

    const root = document.createElement('div');
    root.id = 'root';
    root.style.background = 'rgb(2, 6, 23)';
    document.body.appendChild(root);

    render(<DesktopCardOverlayApp />, { container: root });

    expect(document.documentElement.style.background).toBe('transparent');
    expect(document.body.style.background).toBe('transparent');
    expect(root.style.background).toBe('transparent');
  });

  it('enables click-through until the pointer is over an actual desktop card', async () => {
    render(<DesktopCardOverlayApp />);
    const timerCard = await screen.findByLabelText('timer card');
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPoint = vi.fn();
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });

    elementFromPoint.mockReturnValue(document.body);
    fireEvent.pointerMove(window, { clientX: 1, clientY: 1 });

    elementFromPoint.mockReturnValue(timerCard);
    fireEvent.pointerMove(window, { clientX: 100, clientY: 60 });

    fireEvent.pointerLeave(window);

    expect(setCardsWindowMousePassthrough).toHaveBeenNthCalledWith(1, true);
    expect(setCardsWindowMousePassthrough).toHaveBeenNthCalledWith(2, false);
    expect(setCardsWindowMousePassthrough).toHaveBeenNthCalledWith(3, true);

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: originalElementFromPoint,
    });
  });

  it('reports the card stack height so the desktop cards window can stay tight', async () => {
    snapshot = {
      externalized: true,
      cards: [
        createCard('timer-card', 'timer', {
          label: 'Cooking Timer',
          isAlarm: false,
          targetTime: Date.now() + 300_000,
          duration: 300_000,
          completionState: 'running',
        }),
      ],
    };
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const getBoundingClientRectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect() {
      if (this instanceof HTMLElement && this.dataset.desktopCardStack === 'true') {
        return {
          x: 0,
          y: 12,
          width: 640,
          height: 300,
          top: 12,
          right: 640,
          bottom: 312,
          left: 0,
          toJSON: () => ({}),
        };
      }
      return originalGetBoundingClientRect.call(this);
    });

    render(<DesktopCardOverlayApp />);

    await waitFor(() => {
      expect(setCardsWindowLayout).toHaveBeenCalledWith({ height: 328 });
    });

    getBoundingClientRectSpy.mockRestore();
  });

  it('scopes a slightly calmer glass treatment to desktop cards', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/cards.css'), 'utf8');

    expect(css).toContain('.desktop-card-overlay .card-glass');
    expect(css).toContain('--desktop-card-glass-blur: 12px');
  });
});
