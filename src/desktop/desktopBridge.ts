import { getDesktopRole } from './desktopRole';
import type {
  CurioDesktopBridge,
  CurioDesktopRole,
  DesktopCardAction,
  DesktopCardsSnapshot,
  DesktopCardsWindowLayout,
  DesktopFaceCommand,
  DesktopFaceSnapshot,
  CurioDesktopMcpStdio,
  McpStdioStartOptions,
  McpStdioStartResult,
  McpStdioIncomingMessage,
  McpStdioCloseEvent,
} from './desktopTypes';

const noopUnsubscribe = () => {};

const makeNoopBridge = (): CurioDesktopBridge => ({
  role: getDesktopRole(),
  startFloatingFace: () => {},
  stopFloatingFace: () => {},
  openMainWindow: () => {},
  openSettings: () => {},
  publishFaceSnapshot: () => {},
  publishCardsSnapshot: () => {},
  setCardsWindowMousePassthrough: () => {},
  setCardsWindowLayout: () => {},
  sendFaceCommand: () => {},
  sendCardAction: () => {},
  onFaceSnapshot: () => noopUnsubscribe,
  onCardsSnapshot: () => noopUnsubscribe,
  onFaceCommand: () => noopUnsubscribe,
  onCardAction: () => noopUnsubscribe,
  onFloatingModeChange: () => noopUnsubscribe,
});

export const getCurioDesktopBridge = (): CurioDesktopBridge =>
  typeof window !== 'undefined' && window.curioDesktop
    ? window.curioDesktop
    : makeNoopBridge();

export const getCurioDesktopRole = (): CurioDesktopRole =>
  getCurioDesktopBridge().role;

export type {
  DesktopCardAction,
  DesktopCardsSnapshot,
  DesktopCardsWindowLayout,
  DesktopFaceCommand,
  DesktopFaceSnapshot,
  CurioDesktopMcpStdio,
  McpStdioStartOptions,
  McpStdioStartResult,
  McpStdioIncomingMessage,
  McpStdioCloseEvent,
};
