import * as esbuild from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

const MEDIAPIPE_WASM_SRC = 'node_modules/@mediapipe/tasks-vision/wasm';
const MEDIAPIPE_WASM_DEST = 'public/mediapipe/wasm';

const buildWorker = async () => {
  await mkdir(MEDIAPIPE_WASM_DEST, { recursive: true });
  await cp(MEDIAPIPE_WASM_SRC, MEDIAPIPE_WASM_DEST, { recursive: true, force: true });

  await esbuild.build({
    entryPoints: ['src/services/faceTracking.worker.ts'],
    bundle: true,
    outfile: 'public/faceTrackingWorker.bundle.js',
    format: 'iife',
    target: 'es2022',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });

  // Pocket TTS inference worker -- keeps the ~100-step autoregressive ORT loop
  // off the main thread so iOS Safari doesn't thermal-throttle and kill the page.
  await esbuild.build({
    entryPoints: ['src/lib/pocketTts/inference.worker.ts'],
    bundle: true,
    outfile: 'public/pocketTtsWorker.bundle.js',
    format: 'iife',
    target: 'es2022',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });
};

buildWorker().then(() => {
  console.log('Worker built successfully.');
}).catch(() => process.exit(1));
