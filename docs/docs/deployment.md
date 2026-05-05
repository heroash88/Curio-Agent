# Deployment Guide

Curio can run as a development web app, production web app, PWA, Electron app, Home Assistant add-on, or Raspberry Pi kiosk.

## Web Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:8080
```

The dev server listens on `0.0.0.0`, so LAN devices can open:

```text
http://<your-computer-lan-ip>:8080
```

## Production Web Build

```bash
npm run build
npm run preview
```

The production build outputs to `dist/`.

The Vite base path is `./` so the app can run from:

- Root hosting paths.
- Home Assistant ingress paths.
- Electron's local static server.
- Static hosting with nested paths.

## Firebase Hosting

```bash
npm run build
npx firebase deploy --only hosting,functions
```

Firebase deployment requires Firebase CLI setup. Copy `.firebaserc.example` to `.firebaserc`, then set your own Firebase project ID locally.
The Stocks, Portfolio, Quote, Fun Fact, and News widgets use Firebase Functions rewrites for same-origin market, quote, fun-fact, and RSS proxy routes in production Hosting builds.

## PWA on iOS and iPadOS

Curio includes PWA metadata and safe-area handling for Safari and home-screen apps.

Recommendations:

- Use HTTPS for installed PWA features and service worker caching.
- Test portrait and landscape on iPhone and iPad.
- Keep the dashboard in grid mode for smaller screens unless freeform layout is intentional.
- Use Kitten, TinyTTS, Piper, browser TTS, or remote TTS on mobile if Pocket TTS is too heavy.
- Direct access works better than iframe/ingress when microphone and camera APIs are needed.

## Electron Desktop

Development:

```bash
npm run electron:dev
```

Build current platform:

```bash
npm run electron:build
```

Platform targets:

```bash
npm run electron:build:win
npm run electron:build:mac
npm run electron:build:linux
```

Electron packaging includes:

- Built web app from `dist/`.
- Electron main process.
- Local static server for OAuth-friendly `http://127.0.0.1` runtime.
- Nova Sonic proxy script as an unpacked resource.
- App icon from `public/curio_icon.png`.

Output goes to `release/`.

## Home Assistant Add-on

Curio can run inside Home Assistant with ingress and direct access on port `8099`.

Use direct access for:

- Google sign-in.
- Microphone/camera workflows.
- Kiosk/tablet dashboards.

See [../ha-addon/README.md](../ha-addon/README.md).

## Raspberry Pi Kiosk

The Raspberry Pi image boots directly into Chromium running Curio fullscreen.

High-level flow:

```bash
npm run build
cd rpi-image
./build-image.sh
```

The kiosk stack includes nginx, Cage, Chromium, PipeWire, WirePlumber, systemd services, and update scripts.

See [../rpi-image/README.md](../rpi-image/README.md).

## Secure Context Notes

Browser microphone, camera, PWA, and service worker behavior can depend on secure contexts:

- `localhost` is treated as secure.
- HTTPS is recommended for production.
- Plain HTTP LAN access is useful for development but may restrict browser APIs.
- Home Assistant ingress may be iframe-bound; direct access often has fewer restrictions.

## Cross-Origin Isolation

The dev server sends cross-origin isolation headers by default so ONNX Runtime can use fast threaded WASM where possible.

Set this environment variable if you need a plain dev server:

```bash
CURIO_CROSS_ORIGIN_ISOLATED=off npm run dev
```
