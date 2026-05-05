export interface OrtWasmEnvLike {
  wasm: {
    wasmPaths?: unknown;
    simd?: boolean | 'fixed' | 'relaxed';
    numThreads?: number;
    proxy?: boolean;
  };
}

const DEFAULT_ORT_WASM_PATH_PREFIX = '/models/';
const DEFAULT_ORT_WASM_BINARY = 'ort-wasm-simd-threaded.wasm';

export const normalizeOrtWasmPathPrefix = (
  prefix = DEFAULT_ORT_WASM_PATH_PREFIX,
) => (prefix.endsWith('/') ? prefix : `${prefix}/`);

export const createOrtWasmPaths = (
  prefix = DEFAULT_ORT_WASM_PATH_PREFIX,
) => ({
  wasm: `${normalizeOrtWasmPathPrefix(prefix)}${DEFAULT_ORT_WASM_BINARY}`,
});

export const configureOrtWasmEnv = <T extends OrtWasmEnvLike>(
  env: T,
  options: {
    wasmPathPrefix?: string;
    numThreads?: number;
    proxy?: boolean;
    forceWasmPaths?: boolean;
  } = {},
): T => {
  const wasm = env.wasm;
  if (options.forceWasmPaths || !wasm.wasmPaths) {
    // Keep the ORT JavaScript loader bundled with the app, and only pin the
    // WebAssembly binary to public/models. In Vite dev, importing public .mjs
    // files as modules triggers a 500; fetching public .wasm files is fine.
    wasm.wasmPaths = createOrtWasmPaths(options.wasmPathPrefix);
  }
  wasm.simd = true;

  if (typeof options.numThreads === 'number' && Number.isFinite(options.numThreads)) {
    wasm.numThreads = Math.max(1, Math.floor(options.numThreads));
  }

  if (typeof options.proxy === 'boolean') {
    wasm.proxy = options.proxy;
  }

  return env;
};
