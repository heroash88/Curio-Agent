/**
 * electron-builder configuration
 * Builds Curio Robot for Windows, macOS, and Linux.
 */
module.exports = {
  appId: 'com.curio.robot',
  productName: 'Curio Robot',
  directories: {
    output: 'release',
    buildResources: 'build-resources',
  },
  files: [
    'dist/**/*',
    'electron/**/*',
    'public/curio_icon.png',
    'scripts/nova-proxy.mjs',
    'node_modules/ws/**/*',
  ],
  // Nova proxy script and its `ws` dep must live on the real filesystem
  // (Electron spawns Node against them). Keep them outside app.asar so
  // fs paths resolve in packaged builds.
  asarUnpack: [
    'scripts/nova-proxy.mjs',
    'node_modules/ws/**/*',
  ],
  // The main entry point for Electron
  extraMetadata: {
    main: 'electron/main.cjs',
  },

  // ── Windows ──────────────────────────────────────────────
  win: {
    target: [
      // Ship x64 only for the NSIS installer. Windows arm64 runs x64
      // binaries natively through its emulation layer, so arm64 users
      // can use the x64 installer without issues. Building a combined
      // x64+arm64 NSIS installer pushes the compressed payload past
      // NSIS's 32-bit mmap limit (~1 GB) and crashes makensis.
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ],
    icon: 'public/curio_icon.png',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'Curio Robot',
    // NSIS requires proper `.ico` files for its installer/uninstaller/header
    // icons. The repo ships a PNG today, so we let electron-builder use its
    // bundled default installer icons. The app's own window/taskbar/Start
    // Menu icon still comes from the `.exe` resource, which electron-builder
    // embeds from the PNG supplied in `win.icon` above. When we generate a
    // real `.ico`, re-add installerIcon/uninstallerIcon/installerHeaderIcon
    // here pointing at that file.
  },

  // ── macOS ────────────────────────────────────────────────
  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
    ],
    icon: 'public/curio_icon.png',
    category: 'public.app-category.utilities',
    darkModeSupport: true,
    extendInfo: {
      NSCameraUsageDescription: 'Curio uses the camera for Face ID, face tracking, and optional visual questions when you enable camera features.',
      NSMicrophoneUsageDescription: 'Curio uses the microphone for voice conversations, wake word detection, and Voice ID when you enable voice features.',
    },
  },
  dmg: {
    title: 'Curio Robot',
  },

  // ── Linux ────────────────────────────────────────────────
  linux: {
    target: [
      // x64 only. GitHub's free Linux runners are x64; cross-compiling
      // arm64 AppImage/deb bundles the full ONNX model set twice and
      // blows past fpm's tar/xz limits. Linux arm64 users (Raspberry Pi
      // desktops) use the dedicated rpi-image/ kiosk path instead.
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
    icon: 'public/curio_icon.png',
    category: 'Utility',
    maintainer: 'Curio Team',
    description: 'Voice-powered AI assistant with 30+ response cards',
  },
};
