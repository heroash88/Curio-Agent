const { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, systemPreferences, Tray } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');

// Keep a global reference so the window isn't garbage-collected.
let mainWindow = null;
let faceWindow = null;
let cardsWindow = null;
let tray = null;
let localServer = null;
let rendererBaseUrl = null;
let novaProxyProcess = null;
let novaProxyPort = null;
let cardsWindowContentHeight = 430;
let isFloatingModeActive = false;
let lastFaceSnapshot = null;
let lastCardsSnapshot = null;
let lastAppliedFaceWindowScale = null;
let faceWindowTextInputOpen = false;
let faceWindowSubtitleOpen = false;
// Tracks where the face sits vertically inside the face window relative
// to the window top, so resizeFaceWindowForScale can keep the face
// anchored on screen when subtitle/input panels change the window size.
// Initialized to null; first resize falls back to window-center math.
let previousFaceCenterInWindowY = null;

const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');
const APP_ICON_PATH = path.join(__dirname, '..', 'public', 'curio_icon.png');

if (isWindows) {
  app.setAppUserModelId('com.curio.robot');
}

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

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindow();
    }
  });
}

function normalizeMediaAccessType(value) {
  return value === 'camera' || value === 'microphone' ? value : null;
}

async function requestMediaAccess(mediaType) {
  const normalized = normalizeMediaAccessType(mediaType);
  if (!normalized) return false;
  if (!isMac) return true;

  try {
    const status = systemPreferences.getMediaAccessStatus(normalized);
    if (status === 'granted') return true;
    if (status === 'denied' || status === 'restricted') return false;
    return Boolean(await systemPreferences.askForMediaAccess(normalized));
  } catch (error) {
    console.warn(`[Curio] Failed to request ${normalized} access:`, error);
    return false;
  }
}

// MIME types for the local static server
const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.ttf':  'font/ttf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.map':  'application/json',
};

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const OPENAI_COMPATIBLE_PROXY_HOSTS = new Set([
  'api.nova.amazon.com',
  'api.openai.com',
  'api.anthropic.com',
  'api.groq.com',
  'openrouter.ai',
  'api.mistral.ai',
]);

function isBlockedProxyHost(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    /^127\./.test(normalized) ||
    /^10\./.test(normalized) ||
    /^192\.168\./.test(normalized) ||
    /^169\.254\./.test(normalized)
  ) {
    return true;
  }
  const private172Match = normalized.match(/^172\.(\d+)\./);
  return private172Match ? Number(private172Match[1]) >= 16 && Number(private172Match[1]) <= 31 : false;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function buildForwardHeaders(req, fallbackAccept) {
  const forwarded = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    const normalizedKey = key.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(normalizedKey) ||
      normalizedKey === 'host' ||
      normalizedKey === 'origin' ||
      normalizedKey === 'referer' ||
      normalizedKey === 'cookie' ||
      normalizedKey === 'accept-encoding' ||
      normalizedKey.startsWith('sec-')
    ) {
      continue;
    }
    forwarded[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  if (!forwarded.Accept && !forwarded.accept) {
    forwarded.Accept = fallbackAccept;
  }
  return forwarded;
}

function writeJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleSameOriginProxy(req, res, options) {
  const requestUrl = new URL(req.url || '/', 'http://curio.local');
  const rawUrl = requestUrl.searchParams.get('url');
  if (!rawUrl) {
    writeJson(res, 400, { error: `Missing ${options.label} URL.` });
    return;
  }

  if (!options.methods.has(req.method || '')) {
    writeJson(res, 405, { error: `Unsupported ${options.label} proxy method.` });
    return;
  }

  try {
    const upstreamUrl = new URL(rawUrl);
    if (!options.isAllowedUrl(upstreamUrl)) {
      writeJson(res, 400, { error: `Unsupported ${options.label} URL.` });
      return;
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers: buildForwardHeaders(req, options.accept),
      ...(req.method === 'POST' ? { body: await readRequestBody(req) } : {}),
    });
    const responseHeaders = {};
    upstreamResponse.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });
    responseHeaders['Cache-Control'] = 'no-store';
    res.writeHead(upstreamResponse.status, responseHeaders);
    res.end(Buffer.from(await upstreamResponse.arrayBuffer()));
  } catch (error) {
    writeJson(res, 502, {
      error: error instanceof Error ? error.message : `${options.label} proxy request failed.`,
    });
  }
}

/**
 * Pick a free port on 127.0.0.1.
 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Locate the bundled Nova proxy script. In dev we run from the repo
 * so scripts/nova-proxy.mjs is alongside. In packaged builds,
 * electron-builder copies the scripts folder into app.asar.unpacked.
 */
function getNovaProxyScriptPath() {
  const candidates = [
    path.join(__dirname, '..', 'scripts', 'nova-proxy.mjs'),
    path.join(process.resourcesPath || '', 'scripts', 'nova-proxy.mjs'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'scripts', 'nova-proxy.mjs'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Start the bundled Nova Sonic WebSocket proxy on a local port.
 * Resolves with the chosen port, or null if startup failed (Nova just
 * won't be available then -- the rest of the app still runs).
 */
async function startNovaProxy() {
  if (novaProxyProcess && !novaProxyProcess.killed && novaProxyPort) {
    return novaProxyPort;
  }

  const scriptPath = getNovaProxyScriptPath();
  if (!scriptPath) {
    console.warn('[Curio] Nova proxy script not found; Nova Sonic will be unavailable.');
    return null;
  }

  try {
    const port = await getFreePort();
    const proc = spawn(process.execPath, [scriptPath, String(port)], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (buf) => {
      process.stdout.write(`[nova-proxy] ${buf}`);
    });
    proc.stderr.on('data', (buf) => {
      process.stderr.write(`[nova-proxy] ${buf}`);
    });
    proc.on('error', (error) => {
      console.warn('[Curio] Nova proxy process error:', error);
      if (novaProxyProcess === proc) {
        novaProxyProcess = null;
        novaProxyPort = null;
      }
    });
    proc.on('exit', (code) => {
      console.warn(`[Curio] Nova proxy exited with code ${code}`);
      if (novaProxyProcess === proc) {
        novaProxyProcess = null;
        novaProxyPort = null;
      }
    });

    novaProxyProcess = proc;
    novaProxyPort = port;
    console.log(`[Curio] Nova proxy running at ws://127.0.0.1:${port}`);
    return port;
  } catch (err) {
    console.error('[Curio] Failed to start Nova proxy:', err);
    return null;
  }
}

/**
 * Start a local HTTP server to serve the built dist/ folder.
 * This gives us a real http://localhost origin so OAuth redirects,
 * Firebase Auth, and HA OAuth all work correctly.
 */
function startLocalServer(distPath) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url || '/', 'http://curio.local');
      if (requestUrl.pathname === '/mcp-proxy') {
        void handleSameOriginProxy(req, res, {
          label: 'MCP',
          methods: new Set(['POST']),
          accept: 'application/json, text/event-stream',
          isAllowedUrl: (url) => url.protocol === 'https:' && !isBlockedProxyHost(url.hostname),
        });
        return;
      }
      if (requestUrl.pathname === '/mcp-oauth-proxy') {
        void handleSameOriginProxy(req, res, {
          label: 'MCP OAuth',
          methods: new Set(['GET', 'POST']),
          accept: 'application/json',
          isAllowedUrl: (url) => url.protocol === 'https:' && !isBlockedProxyHost(url.hostname),
        });
        return;
      }
      if (requestUrl.pathname === '/openai-compatible-proxy') {
        void handleSameOriginProxy(req, res, {
          label: 'provider',
          methods: new Set(['GET', 'POST']),
          accept: 'application/json, text/event-stream',
          isAllowedUrl: (url) => (
            url.protocol === 'https:' &&
            OPENAI_COMPATIBLE_PROXY_HOSTS.has(url.hostname.toLowerCase())
          ),
        });
        return;
      }

      let urlPath = (req.url || '/').split('?')[0].split('#')[0];
      if (urlPath === '/') urlPath = '/index.html';

      const filePath = path.join(distPath, urlPath);
      const ext = path.extname(filePath).toLowerCase();

      if (!filePath.startsWith(distPath)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          fs.readFile(path.join(distPath, 'index.html'), (err2, indexData) => {
            if (err2) {
              res.writeHead(404);
              res.end('Not Found');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexData);
          });
          return;
        }

        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`[Curio] Local server running at http://127.0.0.1:${port}`);
      resolve({ server, port });
    });

    server.on('error', reject);
  });
}

function buildRendererUrl(desktopRole = 'app') {
  const base = rendererBaseUrl || (isDev ? 'http://localhost:8080/' : 'http://127.0.0.1/');
  const url = new URL(base);
  if (novaProxyPort) {
    url.searchParams.set('novaProxy', `ws://127.0.0.1:${novaProxyPort}`);
  }
  if (desktopRole !== 'app') {
    url.searchParams.set('desktopRole', desktopRole);
  }
  return url.toString();
}

function configureWebContents(window) {
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowed = [
        'media',
        'mediaKeySystem',
        'geolocation',
        'notifications',
        'fullscreen',
      ];
      callback(allowed.includes(permission));
    },
  );

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('accounts.google.com') || url.includes('apis.google.com')) {
      return { action: 'allow' };
    }
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 480,
    minHeight: 600,
    title: 'Curio Robot',
    icon: APP_ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });

  configureWebContents(mainWindow);

  mainWindow.on('close', (event) => {
    if (isFloatingModeActive && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      updateTrayMenu();
    }
  });

  mainWindow.loadURL(buildRendererUrl('app'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function normalizeCardsWindowHeight(height, workAreaHeight) {
  const numericHeight = Number(height);
  const desiredHeight = Number.isFinite(numericHeight) ? Math.ceil(numericHeight) : 430;
  const maxHeight = Math.max(140, Math.floor(Number(workAreaHeight) || 430) - 24);
  return Math.min(Math.max(140, desiredHeight), maxHeight);
}

function positionCardsWindow(height = cardsWindowContentHeight) {
  if (!cardsWindow) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = display.workArea;
  const width = Math.min(820, Math.max(360, workArea.width - 32));
  const nextHeight = normalizeCardsWindowHeight(height, workArea.height);
  cardsWindowContentHeight = nextHeight;
  cardsWindow.setBounds({
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y),
    width,
    height: nextHeight,
  });
}

function setCardsWindowLayout(layout) {
  if (!cardsWindow || cardsWindow.isDestroyed()) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const nextHeight = normalizeCardsWindowHeight(layout?.height, display.workArea.height);
  const current = cardsWindow.getBounds();
  if (Math.abs(current.height - nextHeight) < 6) return;
  positionCardsWindow(nextHeight);
}

function setCardsWindowMousePassthrough(enabled) {
  if (!cardsWindow || cardsWindow.isDestroyed()) return;
  if (enabled) {
    cardsWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    cardsWindow.setIgnoreMouseEvents(false);
  }
}

function configureFloatingCompanionWindow(window) {
  if (!window || window.isDestroyed()) return;
  if (!isWindows) {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  window.setAlwaysOnTop(true, isWindows ? 'screen-saver' : 'floating');
  window.setSkipTaskbar(true);
}

function resizeFaceWindowForScale(scale, force = false) {
  if (!faceWindow || faceWindow.isDestroyed()) return;
  const normalized = Math.max(60, Math.min(600, Number(scale) || 100));
  const faceSize = Math.round(Math.max(180, Math.min(1500, normalized * 2.65)));
  // Keep these reserves in lock-step with the DesktopFaceApp layout so
  // the face stays anchored while panels open/close. Input panel adds
  // ~184px below (textarea 80px + padding + action row + gap). Subtitle
  // panel adds ~80px above (max-h-16 content + padding + gap).
  const inputReserve = faceWindowTextInputOpen ? 184 : 0;
  const subtitleReserve = faceWindowSubtitleOpen ? 80 : 0;
  const horizontalChrome = 8;
  const verticalChrome = 8;
  const width = Math.max(faceSize + horizontalChrome, 360);
  const height = Math.min(
    1700,
    faceSize + inputReserve + subtitleReserve + verticalChrome,
  );
  const current = faceWindow.getBounds();
  const sameSize =
    Math.abs(current.width - width) < 4 &&
    Math.abs(current.height - height) < 4;
  const sameScale = lastAppliedFaceWindowScale === normalized;
  if (!force && sameSize && sameScale) return;

  // Anchor on the face center so opening/closing panels does not make
  // the face visually jump. Within the new window, the face center sits
  // at subtitleReserve + faceSize/2 from the top (the middle flex slot).
  const previousFaceCenterX = current.x + Math.round(current.width / 2);
  const previousCenterInWindow =
    previousFaceCenterInWindowY === null
      ? Math.round(current.height / 2)
      : previousFaceCenterInWindowY;
  const previousFaceCenterY = current.y + Math.round(previousCenterInWindow);
  const faceCenterXInWindow = Math.round(width / 2);
  const faceCenterYInWindow = subtitleReserve + Math.round(faceSize / 2);
  faceWindow.setBounds({
    x: Math.round(previousFaceCenterX - faceCenterXInWindow),
    y: Math.round(previousFaceCenterY - faceCenterYInWindow),
    width,
    height,
  });
  previousFaceCenterInWindowY = faceCenterYInWindow;
  lastAppliedFaceWindowScale = normalized;
}

function createFaceWindow() {
  if (faceWindow && !faceWindow.isDestroyed()) return faceWindow;

  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  faceWindow = new BrowserWindow({
    width: 280,
    height: 280,
    minWidth: 170,
    minHeight: 170,
    maxWidth: 1520,
    maxHeight: 1800,
    x: Math.round(workArea.x + workArea.width - 320),
    y: Math.round(workArea.y + workArea.height - 420),
    title: 'Curio Floating Face',
    icon: APP_ICON_PATH,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });

  configureWebContents(faceWindow);
  configureFloatingCompanionWindow(faceWindow);
  faceWindow.loadURL(buildRendererUrl('face'));
  faceWindow.once('ready-to-show', () => {
    if (!faceWindow || faceWindow.isDestroyed()) return;
    resizeFaceWindowForScale(lastFaceSnapshot?.robotFaceScale, true);
    faceWindow.showInactive();
    if (lastFaceSnapshot) {
      faceWindow.webContents.send(CHANNELS.faceSnapshot, lastFaceSnapshot);
    }
  });
  faceWindow.on('closed', () => {
    faceWindow = null;
    previousFaceCenterInWindowY = null;
    lastAppliedFaceWindowScale = null;
    if (isFloatingModeActive) stopFloatingMode();
  });

  return faceWindow;
}

function createCardsWindow() {
  if (cardsWindow && !cardsWindow.isDestroyed()) return cardsWindow;

  cardsWindow = new BrowserWindow({
    width: 820,
    height: 430,
    title: 'Curio Desktop Cards',
    icon: APP_ICON_PATH,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });

  configureWebContents(cardsWindow);
  configureFloatingCompanionWindow(cardsWindow);
  setCardsWindowMousePassthrough(true);
  positionCardsWindow();
  cardsWindow.loadURL(buildRendererUrl('cards'));
  cardsWindow.once('ready-to-show', () => {
    if (!cardsWindow || cardsWindow.isDestroyed()) return;
    if (lastCardsSnapshot?.externalized && lastCardsSnapshot.cards?.length > 0) {
      cardsWindow.showInactive();
      cardsWindow.webContents.send(CHANNELS.cardsSnapshot, lastCardsSnapshot);
    }
  });
  cardsWindow.on('closed', () => {
    cardsWindow = null;
  });

  return cardsWindow;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createWindow();
    return;
  }
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  updateTrayMenu();
}

function broadcastFloatingMode(active) {
  for (const window of [mainWindow, faceWindow, cardsWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send(CHANNELS.floatingModeChange, active);
    }
  }
}

function createTrayIconImage() {
  const image = nativeImage.createFromPath(APP_ICON_PATH).resize({ width: 16, height: 16 });
  if (isMac) image.setTemplateImage(true);
  return image;
}

function ensureTray() {
  if (tray) return;
  tray = new Tray(createTrayIconImage());
  tray.setToolTip('Curio Robot');
  tray.on('click', () => showMainWindow());
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Curio', click: () => showMainWindow() },
    {
      label: 'Open Settings',
      click: () => {
        showMainWindow();
        mainWindow?.webContents.send(CHANNELS.faceCommand, { type: 'open-settings' });
      },
    },
    { type: 'separator' },
    {
      label: isFloatingModeActive ? 'Stop Floating Face' : 'Start Floating Face',
      click: () => {
        if (isFloatingModeActive) stopFloatingMode();
        else startFloatingMode();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Curio',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]));
}

function updateCardsWindowVisibility(snapshot) {
  if (!cardsWindow || cardsWindow.isDestroyed()) return;
  if (snapshot?.externalized && Array.isArray(snapshot.cards) && snapshot.cards.length > 0) {
    const wasVisible = cardsWindow.isVisible();
    positionCardsWindow();
    if (!wasVisible) {
      setCardsWindowMousePassthrough(true);
      cardsWindow.showInactive();
    }
    cardsWindow.webContents.send(CHANNELS.cardsSnapshot, snapshot);
  } else {
    cardsWindow.webContents.send(CHANNELS.cardsSnapshot, snapshot || { cards: [], externalized: false });
    setCardsWindowMousePassthrough(true);
    cardsWindow.hide();
  }
}

function startFloatingMode() {
  isFloatingModeActive = true;
  ensureTray();
  createFaceWindow();
  createCardsWindow();
  broadcastFloatingMode(true);
  updateTrayMenu();

  if (lastFaceSnapshot && faceWindow && !faceWindow.isDestroyed()) {
    faceWindow.webContents.send(CHANNELS.faceSnapshot, lastFaceSnapshot);
  }
  if (lastCardsSnapshot) {
    updateCardsWindowVisibility({ ...lastCardsSnapshot, externalized: true });
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function stopFloatingMode() {
  isFloatingModeActive = false;
  broadcastFloatingMode(false);
  if (faceWindow && !faceWindow.isDestroyed()) {
    const win = faceWindow;
    faceWindow = null;
    win.close();
  }
  if (cardsWindow && !cardsWindow.isDestroyed()) {
    const win = cardsWindow;
    cardsWindow = null;
    win.close();
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (!app.isQuitting && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

function cleanupBackgroundServices() {
  globalShortcut.unregisterAll();
  if (localServer) {
    localServer.close();
    localServer = null;
  }
  if (novaProxyProcess) {
    try { novaProxyProcess.kill(); } catch { /* noop */ }
    novaProxyProcess = null;
  }
  novaProxyPort = null;
  closeAllMcpStdioSessions();
}

// ── MCP stdio session manager ─────────────────────────────────────
//
// Spawns local MCP servers as child processes and bridges JSON-RPC
// over newline-delimited stdin/stdout. Only available in the desktop
// app; the renderer-side generic MCP service gates on whether this
// bridge exists.

const MCP_STDIO_MAX_STDERR_TAIL = 4_000;
const mcpStdioSessions = new Map();

function broadcastMcpStdioMessage(payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window && !window.isDestroyed()) {
      window.webContents.send(CHANNELS.mcpStdioMessage, payload);
    }
  }
}

function broadcastMcpStdioClosed(payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window && !window.isDestroyed()) {
      window.webContents.send(CHANNELS.mcpStdioClosed, payload);
    }
  }
}

function startMcpStdioSession(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('mcp-stdio: options required');
  }
  const serverId = typeof options.serverId === 'string' ? options.serverId.trim() : '';
  const command = typeof options.command === 'string' ? options.command.trim() : '';
  if (!serverId) throw new Error('mcp-stdio: serverId required');
  if (!command) throw new Error('mcp-stdio: command required');

  const args = Array.isArray(options.args)
    ? options.args.map((v) => (typeof v === 'string' ? v : String(v ?? '')))
    : [];
  const cwd = typeof options.cwd === 'string' && options.cwd.trim() ? options.cwd.trim() : undefined;
  const envOverrides = options.env && typeof options.env === 'object' ? options.env : {};
  const env = { ...process.env };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      env[key] = typeof value === 'string' ? value : String(value ?? '');
    }
  }

  const sessionId = `${serverId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  let child;
  try {
    child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
  } catch (error) {
    throw new Error(`mcp-stdio: failed to spawn "${command}": ${error.message || error}`);
  }

  const session = {
    sessionId,
    serverId,
    child,
    stdoutBuffer: '',
    stderrTail: '',
    closed: false,
  };
  mcpStdioSessions.set(sessionId, session);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    session.stdoutBuffer += chunk;
    let newlineIndex = session.stdoutBuffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const rawLine = session.stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, '');
      session.stdoutBuffer = session.stdoutBuffer.slice(newlineIndex + 1);
      if (rawLine.trim().length > 0) {
        try {
          const parsed = JSON.parse(rawLine);
          broadcastMcpStdioMessage({ sessionId, data: parsed });
        } catch (error) {
          broadcastMcpStdioMessage({
            sessionId,
            raw: rawLine,
            parseError: error instanceof Error ? error.message : String(error),
          });
        }
      }
      newlineIndex = session.stdoutBuffer.indexOf('\n');
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    session.stderrTail = (session.stderrTail + chunk).slice(-MCP_STDIO_MAX_STDERR_TAIL);
    process.stderr.write(`[mcp-stdio ${serverId}] ${chunk}`);
  });

  child.on('error', (error) => {
    if (session.closed) return;
    session.closed = true;
    mcpStdioSessions.delete(sessionId);
    broadcastMcpStdioClosed({
      sessionId,
      serverId,
      code: null,
      signal: null,
      error: error.message || String(error),
      stderrTail: session.stderrTail || undefined,
    });
  });

  child.on('exit', (code, signal) => {
    if (session.closed) return;
    session.closed = true;
    mcpStdioSessions.delete(sessionId);
    broadcastMcpStdioClosed({
      sessionId,
      serverId,
      code: typeof code === 'number' ? code : null,
      signal: signal || null,
      stderrTail: session.stderrTail || undefined,
    });
  });

  return { sessionId, pid: child.pid };
}

function sendMcpStdioPayload(sessionId, payload) {
  const session = mcpStdioSessions.get(sessionId);
  if (!session || session.closed) return false;
  try {
    const line = typeof payload === 'string' ? payload : JSON.stringify(payload);
    session.child.stdin.write(`${line}\n`);
    return true;
  } catch (error) {
    console.warn(`[Curio] Failed to write to MCP stdio session ${sessionId}:`, error);
    return false;
  }
}

function closeMcpStdioSession(sessionId) {
  const session = mcpStdioSessions.get(sessionId);
  if (!session) return;
  session.closed = true;
  mcpStdioSessions.delete(sessionId);
  try { session.child.stdin.end(); } catch { /* noop */ }
  try { session.child.kill(); } catch { /* noop */ }
}

function closeAllMcpStdioSessions() {
  for (const sessionId of [...mcpStdioSessions.keys()]) {
    closeMcpStdioSession(sessionId);
  }
}

function registerDesktopIpc() {
  ipcMain.handle(CHANNELS.mediaAccess, (_event, mediaType) => requestMediaAccess(mediaType));
  ipcMain.on(CHANNELS.startFloatingFace, () => startFloatingMode());
  ipcMain.on(CHANNELS.stopFloatingFace, () => stopFloatingMode());
  ipcMain.on(CHANNELS.openMainWindow, () => showMainWindow());
  ipcMain.on(CHANNELS.openSettings, () => {
    showMainWindow();
    mainWindow?.webContents.send(CHANNELS.faceCommand, { type: 'open-settings' });
  });

  ipcMain.on(CHANNELS.faceSnapshot, (_event, snapshot) => {
    lastFaceSnapshot = snapshot;
    if (faceWindow && !faceWindow.isDestroyed()) {
      resizeFaceWindowForScale(snapshot?.robotFaceScale);
      faceWindow.webContents.send(CHANNELS.faceSnapshot, snapshot);
    }
  });

  ipcMain.on(CHANNELS.cardsSnapshot, (_event, snapshot) => {
    lastCardsSnapshot = snapshot;
    if (isFloatingModeActive) {
      updateCardsWindowVisibility({ ...snapshot, externalized: true });
    } else if (cardsWindow && !cardsWindow.isDestroyed()) {
      updateCardsWindowVisibility({ cards: [], externalized: false });
    }
  });

  ipcMain.on(CHANNELS.cardsMousePassthrough, (event, enabled) => {
    if (!cardsWindow || cardsWindow.isDestroyed() || event.sender !== cardsWindow.webContents) return;
    setCardsWindowMousePassthrough(Boolean(enabled));
  });

  ipcMain.on(CHANNELS.cardsWindowLayout, (event, layout) => {
    if (!cardsWindow || cardsWindow.isDestroyed() || event.sender !== cardsWindow.webContents) return;
    setCardsWindowLayout(layout);
  });

  ipcMain.on(CHANNELS.faceCommand, (_event, command) => {
    if (!command || typeof command.type !== 'string') return;
    if (command.type === 'open-app') {
      showMainWindow();
      return;
    }
    if (command.type === 'open-settings') {
      showMainWindow();
    }
    if (command.type === 'stop-floating') {
      stopFloatingMode();
      return;
    }
    if (command.type === 'drag-by') {
      if (faceWindow && !faceWindow.isDestroyed()) {
        const bounds = faceWindow.getBounds();
        faceWindow.setBounds({
          ...bounds,
          x: bounds.x + Math.round(Number(command.dx) || 0),
          y: bounds.y + Math.round(Number(command.dy) || 0),
        });
      }
      return;
    }
    if (command.type === 'layout-changed') {
      faceWindowTextInputOpen = Boolean(command.textInputOpen);
      faceWindowSubtitleOpen = Boolean(command.subtitleOpen);
      resizeFaceWindowForScale(lastFaceSnapshot?.robotFaceScale, true);
      return;
    }
    if (command.type === 'bounds-changed') {
      return;
    }
    mainWindow?.webContents.send(CHANNELS.faceCommand, command);
  });

  ipcMain.on(CHANNELS.cardAction, (_event, action) => {
    mainWindow?.webContents.send(CHANNELS.cardAction, action);
  });

  ipcMain.handle(CHANNELS.mcpStdioStart, (_event, options) => {
    try {
      return startMcpStdioSession(options);
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  });

  ipcMain.handle(CHANNELS.mcpStdioSend, (_event, args) => {
    const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : '';
    if (!sessionId) return false;
    return sendMcpStdioPayload(sessionId, args.payload);
  });

  ipcMain.handle(CHANNELS.mcpStdioClose, (_event, args) => {
    const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : '';
    if (!sessionId) return;
    closeMcpStdioSession(sessionId);
  });
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;

  // Start the Nova proxy first so createWindow can include the port in
  // the renderer URL. Failure is non-fatal.
  await startNovaProxy();

  if (isDev) {
    rendererBaseUrl = 'http://localhost:8080/';
  } else {
    const distPath = path.join(__dirname, '..', 'dist');
    const { server, port } = await startLocalServer(distPath);
    localServer = server;
    rendererBaseUrl = `http://127.0.0.1:${port}/`;
  }

  registerDesktopIpc();

  await createWindow();

  globalShortcut.register('F11', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    else showMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (isFloatingModeActive && isMac) return;
  cleanupBackgroundServices();
  app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  cleanupBackgroundServices();
});
