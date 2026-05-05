const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = {
  startFloatingFace: 'curio-desktop:start-floating-face',
  stopFloatingFace: 'curio-desktop:stop-floating-face',
  openMainWindow: 'curio-desktop:open-main-window',
  openSettings: 'curio-desktop:open-settings',
  faceSnapshot: 'curio-desktop:face-snapshot',
  cardsSnapshot: 'curio-desktop:cards-snapshot',
  faceCommand: 'curio-desktop:face-command',
  cardAction: 'curio-desktop:card-action',
  mediaAccess: 'curio-desktop:media-access',
  floatingModeChange: 'curio-desktop:floating-mode-change',
  cardsMousePassthrough: 'curio-desktop:cards-mouse-passthrough',
  cardsWindowLayout: 'curio-desktop:cards-window-layout',
  mcpStdioStart: 'curio-desktop:mcp-stdio-start',
  mcpStdioSend: 'curio-desktop:mcp-stdio-send',
  mcpStdioClose: 'curio-desktop:mcp-stdio-close',
  mcpStdioMessage: 'curio-desktop:mcp-stdio-message',
  mcpStdioClosed: 'curio-desktop:mcp-stdio-closed',
};

const normalizeRole = (value) => (value === 'face' || value === 'cards' ? value : 'app');

const getRole = () => {
  try {
    return normalizeRole(new URLSearchParams(window.location.search).get('desktopRole'));
  } catch {
    return 'app';
  }
};

const subscribe = (channel, listener) => {
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('curioDesktop', {
  role: getRole(),
  startFloatingFace: () => ipcRenderer.send(CHANNELS.startFloatingFace),
  stopFloatingFace: () => ipcRenderer.send(CHANNELS.stopFloatingFace),
  openMainWindow: () => ipcRenderer.send(CHANNELS.openMainWindow),
  openSettings: () => ipcRenderer.send(CHANNELS.openSettings),
  publishFaceSnapshot: (snapshot) => ipcRenderer.send(CHANNELS.faceSnapshot, snapshot),
  publishCardsSnapshot: (snapshot) => ipcRenderer.send(CHANNELS.cardsSnapshot, snapshot),
  setCardsWindowMousePassthrough: (enabled) => ipcRenderer.send(CHANNELS.cardsMousePassthrough, Boolean(enabled)),
  setCardsWindowLayout: (layout) => ipcRenderer.send(CHANNELS.cardsWindowLayout, layout),
  requestMediaAccess: (mediaType) => ipcRenderer.invoke(CHANNELS.mediaAccess, mediaType),
  sendFaceCommand: (command) => ipcRenderer.send(CHANNELS.faceCommand, command),
  sendCardAction: (action) => ipcRenderer.send(CHANNELS.cardAction, action),
  onFaceSnapshot: (listener) => subscribe(CHANNELS.faceSnapshot, listener),
  onCardsSnapshot: (listener) => subscribe(CHANNELS.cardsSnapshot, listener),
  onFaceCommand: (listener) => subscribe(CHANNELS.faceCommand, listener),
  onCardAction: (listener) => subscribe(CHANNELS.cardAction, listener),
  onFloatingModeChange: (listener) => subscribe(CHANNELS.floatingModeChange, listener),
  mcpStdio: {
    start: (options) => ipcRenderer.invoke(CHANNELS.mcpStdioStart, options),
    send: (sessionId, payload) => ipcRenderer.invoke(CHANNELS.mcpStdioSend, { sessionId, payload }),
    close: (sessionId) => ipcRenderer.invoke(CHANNELS.mcpStdioClose, { sessionId }),
    onMessage: (listener) => subscribe(CHANNELS.mcpStdioMessage, listener),
    onClose: (listener) => subscribe(CHANNELS.mcpStdioClosed, listener),
  },
});
