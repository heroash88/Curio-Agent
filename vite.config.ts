import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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

const isBlockedRssProxyHost = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '0.0.0.0' ||
    normalized === '::1'
  ) {
    return true;
  }
  if (/^127\./.test(normalized) || /^10\./.test(normalized) || /^192\.168\./.test(normalized)) {
    return true;
  }
  const private172Match = normalized.match(/^172\.(\d+)\./);
  return private172Match ? Number(private172Match[1]) >= 16 && Number(private172Match[1]) <= 31 : false;
};

const isBlockedGenericProxyHost = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  return (
    isBlockedRssProxyHost(normalized) ||
    /^169\.254\./.test(normalized)
  );
};

const OPENAI_COMPATIBLE_PROXY_HOSTS = new Set([
  'api.nova.amazon.com',
  'api.openai.com',
  'api.anthropic.com',
  'api.groq.com',
  'openrouter.ai',
  'api.mistral.ai',
]);

const readProxyBody = (request: any): Promise<Buffer> => new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  request.on('end', () => resolve(Buffer.concat(chunks)));
  request.on('error', reject);
});

const buildForwardHeaders = (
  requestHeaders: Record<string, string | string[] | undefined>,
  fallbackAccept: string,
): Record<string, string> => {
  const forwarded: Record<string, string> = {};
  for (const [key, value] of Object.entries(requestHeaders)) {
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
    if (typeof value === 'string') {
      forwarded[key] = value;
    } else if (Array.isArray(value)) {
      forwarded[key] = value.join(', ');
    }
  }
  if (!forwarded.Accept && !forwarded.accept) {
    forwarded.Accept = fallbackAccept;
  }
  return forwarded;
};

const copyProxyResponseHeaders = (upstreamResponse: Response, response: any) => {
  upstreamResponse.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      response.setHeader(key, value);
    }
  });
};

const createRssProxyPlugin = (): Plugin => ({
  name: 'curio-rss-proxy',
  configureServer(server) {
    server.middlewares.use('/rss-proxy', async (request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
      }

      if (request.method !== 'GET') {
        response.statusCode = 405;
        response.end(JSON.stringify({ error: 'Only GET requests are supported.' }));
        return;
      }

      const parsedRequest = new URL(request.url || '/', 'http://curio.local');
      const rawUrl = parsedRequest.searchParams.get('url');
      if (!rawUrl) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'Missing RSS URL.' }));
        return;
      }

      try {
        const upstreamUrl = new URL(rawUrl);
        if (!['http:', 'https:'].includes(upstreamUrl.protocol) || isBlockedRssProxyHost(upstreamUrl.hostname)) {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'Unsupported RSS URL.' }));
          return;
        }

        const upstreamResponse = await fetch(upstreamUrl, {
          headers: {
            Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
          },
        });
        response.statusCode = upstreamResponse.status;
        response.setHeader(
          'Content-Type',
          upstreamResponse.headers.get('content-type') || 'application/xml; charset=utf-8',
        );
        response.setHeader('Cache-Control', 'public, max-age=60');
        response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
      } catch (error) {
        response.statusCode = 502;
        response.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'RSS proxy request failed.',
        }));
      }
    });
  },
});

const createMcpProxyPlugin = (): Plugin => ({
  name: 'curio-mcp-proxy',
  configureServer(server) {
    server.middlewares.use('/mcp-proxy', async (request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, x-api-key, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID');
      response.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');

      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
      }

      if (request.method !== 'POST') {
        response.statusCode = 405;
        response.end(JSON.stringify({ error: 'Only POST requests are supported.' }));
        return;
      }

      const parsedRequest = new URL(request.url || '/', 'http://curio.local');
      const rawUrl = parsedRequest.searchParams.get('url');
      if (!rawUrl) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'Missing MCP URL.' }));
        return;
      }

      try {
        const upstreamUrl = new URL(rawUrl);
        if (upstreamUrl.protocol !== 'https:' || isBlockedGenericProxyHost(upstreamUrl.hostname)) {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'Unsupported MCP URL.' }));
          return;
        }

        const upstreamResponse = await fetch(upstreamUrl, {
          method: 'POST',
          headers: buildForwardHeaders(
            request.headers as Record<string, string | string[] | undefined>,
            'application/json, text/event-stream',
          ),
          body: await readProxyBody(request),
        });
        response.statusCode = upstreamResponse.status;
        copyProxyResponseHeaders(upstreamResponse, response);
        response.setHeader('Cache-Control', 'no-store');
        response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
      } catch (error) {
        response.statusCode = 502;
        response.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'MCP proxy request failed.',
        }));
      }
    });
  },
});

const createMcpOAuthProxyPlugin = (): Plugin => ({
  name: 'curio-mcp-oauth-proxy',
  configureServer(server) {
    server.middlewares.use('/mcp-oauth-proxy', async (request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
      }

      if (request.method !== 'GET' && request.method !== 'POST') {
        response.statusCode = 405;
        response.end(JSON.stringify({ error: 'Only GET and POST requests are supported.' }));
        return;
      }

      const parsedRequest = new URL(request.url || '/', 'http://curio.local');
      const rawUrl = parsedRequest.searchParams.get('url');
      if (!rawUrl) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'Missing MCP OAuth URL.' }));
        return;
      }

      try {
        const upstreamUrl = new URL(rawUrl);
        if (upstreamUrl.protocol !== 'https:' || isBlockedGenericProxyHost(upstreamUrl.hostname)) {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'Unsupported MCP OAuth URL.' }));
          return;
        }

        const upstreamResponse = await fetch(upstreamUrl, {
          method: request.method,
          headers: buildForwardHeaders(
            request.headers as Record<string, string | string[] | undefined>,
            'application/json',
          ),
          ...(request.method === 'POST' ? { body: await readProxyBody(request) } : {}),
        });
        response.statusCode = upstreamResponse.status;
        copyProxyResponseHeaders(upstreamResponse, response);
        response.setHeader('Cache-Control', 'no-store');
        response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
      } catch (error) {
        response.statusCode = 502;
        response.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'MCP OAuth proxy request failed.',
        }));
      }
    });
  },
});

const createOpenAICompatibleProxyPlugin = (): Plugin => ({
  name: 'curio-openai-compatible-proxy',
  configureServer(server) {
    server.middlewares.use('/openai-compatible-proxy', async (request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, api-key, anthropic-version, x-api-key');

      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
      }

      if (request.method !== 'GET' && request.method !== 'POST') {
        response.statusCode = 405;
        response.end(JSON.stringify({ error: 'Only GET and POST requests are supported.' }));
        return;
      }

      const parsedRequest = new URL(request.url || '/', 'http://curio.local');
      const rawUrl = parsedRequest.searchParams.get('url');
      if (!rawUrl) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'Missing provider URL.' }));
        return;
      }

      try {
        const upstreamUrl = new URL(rawUrl);
        if (
          upstreamUrl.protocol !== 'https:' ||
          !OPENAI_COMPATIBLE_PROXY_HOSTS.has(upstreamUrl.hostname.toLowerCase())
        ) {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'Unsupported provider URL.' }));
          return;
        }

        const upstreamResponse = await fetch(upstreamUrl, {
          method: request.method,
          headers: buildForwardHeaders(
            request.headers as Record<string, string | string[] | undefined>,
            'application/json, text/event-stream',
          ),
          ...(request.method === 'POST' ? { body: await readProxyBody(request) } : {}),
        });
        response.statusCode = upstreamResponse.status;
        copyProxyResponseHeaders(upstreamResponse, response);
        response.setHeader('Cache-Control', 'no-store');
        response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
      } catch (error) {
        response.statusCode = 502;
        response.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'OpenAI-compatible proxy request failed.',
        }));
      }
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const crossOriginIsolationMode = (() => {
    const value = env.CURIO_CROSS_ORIGIN_ISOLATED?.toLowerCase();
    if (value === '0' || value === 'false' || value === 'off') return 'off';
    if (value === 'require-corp') return 'require-corp';
    return 'credentialless';
  })();
  const crossOriginIsolationHeaders = crossOriginIsolationMode === 'off'
    ? undefined
    : {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': crossOriginIsolationMode,
      };
  const htmlInputs: Record<string, string> = {
    main: path.resolve(__dirname, 'index.html'),
  };

  if (env.CURIO_DEBUG_HTML === '1') {
    htmlInputs.pocketDebug = path.resolve(__dirname, 'pocket-debug.html');
  }

  return {
    // Use relative paths so the app works in HA ingress (served under
    // /api/hassio_ingress/<token>/) as well as at the root.
    base: './',
    worker: {
      format: 'iife',
    },
    server: {
      port: 8080,
      host: '0.0.0.0',
      allowedHosts: true,
      // ONNX Runtime needs SharedArrayBuffer/crossOriginIsolated for fast
      // threaded WASM. Credentialless keeps third-party media embeds usable
      // while still enabling local model inference to use multiple threads.
      // Set CURIO_CROSS_ORIGIN_ISOLATED=off if you need a plain dev server.
      headers: crossOriginIsolationHeaders,
      proxy: {
        '/stock-proxy': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/stock-proxy/, ''),
        },
        '/stooq-proxy': {
          target: 'https://stooq.com',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/stooq-proxy/, ''),
        },
        '/quotes-proxy': {
          target: 'https://zenquotes.io',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/quotes-proxy/, ''),
        },
        '/facts-proxy': {
          target: 'https://uselessfacts.jsph.pl',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/facts-proxy/, ''),
        },
        '/slack-proxy': {
          target: 'https://slack.com/api',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/slack-proxy/, ''),
        },
      },
    },
    preview: {
      headers: crossOriginIsolationHeaders,
    },

    plugins: [
      createRssProxyPlugin(),
      createMcpProxyPlugin(),
      createMcpOAuthProxyPlugin(),
      createOpenAICompatibleProxyPlugin(),
      react(),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ""),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ""),
      '__APP_VERSION__': JSON.stringify(process.env.npm_package_version || '0.0.0'),
    },
    esbuild: {
      pure: mode === 'production' ? ['console.log', 'console.debug'] : [],
    },
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, '.') },
        // Use ORT's WASM build with the generated JS loader bundled into the app.
        // The shared ORT config pins only the .wasm binary to public/models; Vite
        // dev rejects public .mjs files when they are imported as source modules.
        {
          find: /^onnxruntime-web(?:\/wasm)?$/,
          replacement: path.resolve(__dirname, 'node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs'),
        },
        // The published openwakeword-js bundle inlines ORT's JSEP/WebGPU
        // runtime, which makes Vite warn about unused WASM URLs. Point at the
        // package source so the ORT alias above can keep wake word on wasm.
        {
          find: 'openwakeword-js',
          replacement: path.resolve(__dirname, 'node_modules/openwakeword-js/src/index.ts'),
        },
      ],
    },
    optimizeDeps: {
      exclude: ['openwakeword-js'],
    },
    assetsInclude: ['**/*.onnx', '**/*.wasm'],
    build: {
      chunkSizeWarningLimit: 6000,
      rollupOptions: {
        maxParallelFileOps: 64,
        input: htmlInputs,
        onwarn(warning, defaultHandler) {
          // Suppress "doesn't exist at build time" for ONNX WASM files
          // served from public/models/ and resolved at runtime.
          if (warning.message?.includes('ort-wasm-simd-threaded')) return;
          defaultHandler(warning);
        },
        output: {
          manualChunks(id) {
            // Normalize Windows backslashes for matching
            const normalId = id.replace(/\\/g, '/');
            if (normalId.includes('node_modules/')) {
              // React core
              if (normalId.includes('node_modules/react-dom/') || normalId.includes('node_modules/react/')) {
                return 'react';
              }
              // Framer Motion
              if (normalId.includes('node_modules/framer-motion/')) {
                return 'framer-motion';
              }
              // Lucide icons
              if (normalId.includes('node_modules/lucide-react/')) {
                return 'lucide';
              }
              // Google GenAI SDK
              if (normalId.includes('node_modules/@google/genai/')) {
                return 'genai';
              }
              // MediaPipe vision
              if (normalId.includes('node_modules/@mediapipe/')) {
                return 'mediapipe';
              }
            }
          }
        }
      }
    }
  };
});
