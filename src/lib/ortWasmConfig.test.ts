import { describe, expect, it } from 'vitest';

import {
  configureOrtWasmEnv,
  createOrtWasmPaths,
  normalizeOrtWasmPathPrefix,
} from './ortWasmConfig';

describe('ortWasmConfig', () => {
  it('normalizes ORT wasm paths to a folder prefix string', () => {
    expect(normalizeOrtWasmPathPrefix('/models')).toBe('/models/');
    expect(normalizeOrtWasmPathPrefix('/models/')).toBe('/models/');
  });

  it('creates an ORT wasm binary path without pointing the JS loader at public', () => {
    expect(createOrtWasmPaths('/models')).toEqual({
      wasm: '/models/ort-wasm-simd-threaded.wasm',
    });
  });

  it('configures ORT to load the bundled JS loader and public wasm binary', () => {
    const env = { wasm: {} };

    configureOrtWasmEnv(env, { numThreads: 2, proxy: false });

    expect(env.wasm.wasmPaths).toEqual({
      wasm: '/models/ort-wasm-simd-threaded.wasm',
    });
    expect(env.wasm.simd).toBe(true);
    expect(env.wasm.numThreads).toBe(2);
    expect(env.wasm.proxy).toBe(false);
  });

  it('does not overwrite an existing wasm path unless forced', () => {
    const env = { wasm: { wasmPaths: '/custom/' } };

    configureOrtWasmEnv(env);
    expect(env.wasm.wasmPaths).toBe('/custom/');

    configureOrtWasmEnv(env, { forceWasmPaths: true });
    expect(env.wasm.wasmPaths).toEqual({
      wasm: '/models/ort-wasm-simd-threaded.wasm',
    });
  });
});
