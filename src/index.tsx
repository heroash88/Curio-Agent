import React from 'react';
import ReactDOM from 'react-dom/client';
// Global stylesheet entry. `index.css` owns the Tailwind import and the
// `@layer base` root reset. Everything else lives in focused partials
// under `src/styles/` and is imported here in cascade order so the final
// CSS bundle matches the single-file history before the split.
import './index.css';
import './styles/tokens.css';
import './styles/ether-utilities.css';
import './styles/settings-modal.css';
import './styles/ether-pills.css';
import './styles/daily-summary.css';
import './styles/rich-note.css';
import './styles/page-hidden.css';
import './styles/safe-area.css';
import './styles/curio-pwa-shell.css';
import './styles/dashboard-shell.css';
import './styles/scrollbars.css';
import './styles/lucide-fix.css';
import './styles/curio-face.css';
import './styles/cards.css';
import './styles/dashboard-widgets.css';
import './styles/face-container.css';
import './styles/kiro-face.css';
import './styles/date-info-widget.css';
import './styles/astronomy-widget.css';
import App from './App';
import { loadRuntimeConfig } from './utils/runtimeConfig';
import { migrateSecretsToEncrypted } from './utils/secretStorage';
import { runSettingsMigrations } from './utils/settingsMigrations';
import { loadCustomWakeWords } from './services/wakeWordCatalog';
import { completePendingSpotifySignIn } from './services/spotifyApi';

// Read any runtime config passed in via query params (e.g. Electron
// injects ?novaProxy=ws://127.0.0.1:<port> after spawning the local
// Nova proxy). Must run before any service that reads window globals.
loadRuntimeConfig();

// Run settings schema migrations (synchronous, fast)
runSettingsMigrations();

// Migrate any plaintext secrets to encrypted form (fire-and-forget)
migrateSecretsToEncrypted().catch((err) =>
  console.warn('[SecretStorage] Migration failed:', err),
);

completePendingSpotifySignIn()
  .catch((err) =>
    console.warn('[Spotify] OAuth resume failed:', err),
  );

// Load custom wake word models from IndexedDB (fire-and-forget)
loadCustomWakeWords().catch((err) =>
  console.warn('[WakeWord] Failed to load custom models:', err),
);

const isLocalDevelopmentHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

if (isLocalDevelopmentHost && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });

  if ('caches' in window) {
    void caches.keys().then((cacheNames) => {
      cacheNames.forEach((cacheName) => {
        void caches.delete(cacheName);
      });
    });
  }
} else if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((registration) => {
      console.log('SW registered: ', registration);

      // When a new SW takes control, reload once so the fresh assets are used.
      // The flag prevents reload loops when a SW activates on first install.
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });

      // If a new SW is found, ask it to activate immediately.
      const promoteWaiting = (sw: ServiceWorker | null) => {
        if (sw) sw.postMessage({ type: 'SKIP_WAITING' });
      };
      if (registration.waiting) promoteWaiting(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            promoteWaiting(installing);
          }
        });
      });
    }).catch((registrationError) => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

// Global error handler
window.onerror = function (msg, url, line, col, error) {
  console.error("Global Error Caught:", msg, url, line, col, error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML += `<div style="color:red; background:white; padding:20px; position:fixed; top:0; left:0; z-index:240;">
      Error: ${msg} <br/>
      ${url}:${line}:${col}
    </div>`;
  }
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("Could not find root element to mount to");
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Failed to mount React root:", error);
}
