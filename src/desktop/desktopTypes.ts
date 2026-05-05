import type { Card } from '../services/cardTypes';
import type { CurioState } from '../services/emotionDetection';
import type { FaceTrackingSample } from '../services/faceTracking';

export type CurioDesktopRole = 'app' | 'face' | 'cards';

export interface DesktopFaceSnapshot {
  faceStyleId: string;
  state: CurioState;
  activeCard: Card | null;
  emotionHint: string | null;
  lowPowerMode: boolean;
  faceTrackingEnabled: boolean;
  idleSleepTimeout: number;
  themeMode: 'light' | 'dark';
  robotFaceScale: number;
  faceTrackingSample: FaceTrackingSample | null;
  speakerName: string | null;
  subtitleText: string | null;
  subtitleSpeaker: 'user' | 'model' | null;
  isConnected: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
}

export interface DesktopCardsSnapshot {
  cards: Card[];
  externalized: boolean;
}

export interface DesktopCardsWindowLayout {
  height: number;
}

export interface DesktopWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DesktopFaceCommand =
  | { type: 'activate' }
  | { type: 'submit-text'; text: string }
  | { type: 'open-app' }
  | { type: 'open-settings' }
  | { type: 'stop-floating' }
  | { type: 'drag-by'; dx: number; dy: number }
  | { type: 'layout-changed'; textInputOpen: boolean; subtitleOpen?: boolean }
  | { type: 'bounds-changed'; bounds: DesktopWindowBounds };

export type DesktopCardAction =
  | { type: 'dismiss'; cardId: string }
  | { type: 'interaction-start'; cardId: string }
  | { type: 'interaction-end'; cardId: string }
  | { type: 'update'; cardId: string; data: Partial<Card['data']> };

/**
 * Options passed from the renderer to spawn a local MCP stdio process.
 */
export interface McpStdioStartOptions {
  serverId: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * A single JSON-RPC-shaped message delivered by the stdio process on its
 * stdout, already parsed as JSON. Parse failures are reported as `raw`.
 */
export interface McpStdioIncomingMessage {
  sessionId: string;
  data?: unknown;
  raw?: string;
  parseError?: string;
}

export interface McpStdioCloseEvent {
  sessionId: string;
  serverId: string;
  code: number | null;
  signal: string | null;
  stderrTail?: string;
  error?: string;
}

export interface McpStdioStartResult {
  sessionId: string;
  pid?: number;
}

export interface CurioDesktopMcpStdio {
  start: (options: McpStdioStartOptions) => Promise<McpStdioStartResult>;
  send: (sessionId: string, payload: unknown) => Promise<boolean>;
  close: (sessionId: string) => Promise<void>;
  onMessage: (listener: (message: McpStdioIncomingMessage) => void) => () => void;
  onClose: (listener: (event: McpStdioCloseEvent) => void) => () => void;
}

export interface CurioDesktopBridge {
  role: CurioDesktopRole;
  startFloatingFace: () => void;
  stopFloatingFace: () => void;
  openMainWindow: () => void;
  openSettings: () => void;
  publishFaceSnapshot: (snapshot: DesktopFaceSnapshot) => void;
  publishCardsSnapshot: (snapshot: DesktopCardsSnapshot) => void;
  setCardsWindowMousePassthrough?: (enabled: boolean) => void;
  setCardsWindowLayout?: (layout: DesktopCardsWindowLayout) => void;
  requestMediaAccess?: (mediaType: 'camera' | 'microphone') => Promise<boolean>;
  sendFaceCommand: (command: DesktopFaceCommand) => void;
  sendCardAction: (action: DesktopCardAction) => void;
  onFaceSnapshot: (listener: (snapshot: DesktopFaceSnapshot) => void) => () => void;
  onCardsSnapshot: (listener: (snapshot: DesktopCardsSnapshot) => void) => () => void;
  onFaceCommand: (listener: (command: DesktopFaceCommand) => void) => () => void;
  onCardAction: (listener: (action: DesktopCardAction) => void) => () => void;
  onFloatingModeChange: (listener: (active: boolean) => void) => () => void;
  /**
   * Optional stdio MCP bridge. Present only in the Electron desktop app.
   * Used by the generic MCP service to spawn local MCP servers (e.g. tools
   * exposed as CLI executables). Browsers/PWAs will not have this.
   */
  mcpStdio?: CurioDesktopMcpStdio;
}
