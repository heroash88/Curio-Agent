const { onRequest } = require("firebase-functions/v2/https");

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const OPENAI_COMPATIBLE_PROXY_HOSTS = new Set([
  "api.nova.amazon.com",
  "api.openai.com",
  "api.anthropic.com",
  "api.groq.com",
  "openrouter.ai",
  "api.mistral.ai",
]);

const buildForwardHeaders = (request, fallbackAccept) => {
  const forwarded = {};
  for (const [key, value] of Object.entries(request.headers || {})) {
    const normalizedKey = key.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(normalizedKey) ||
      normalizedKey === "host" ||
      normalizedKey === "origin" ||
      normalizedKey === "referer" ||
      normalizedKey === "cookie" ||
      normalizedKey === "accept-encoding" ||
      normalizedKey.startsWith("sec-")
    ) {
      continue;
    }
    if (typeof value === "string") {
      forwarded[key] = value;
    } else if (Array.isArray(value)) {
      forwarded[key] = value.join(", ");
    }
  }
  if (!forwarded.Accept && !forwarded.accept) {
    forwarded.Accept = fallbackAccept;
  }
  return forwarded;
};

const getRequestBodyBuffer = (request) => {
  if (Buffer.isBuffer(request.rawBody)) return request.rawBody;
  if (Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") return Buffer.from(request.body);
  if (request.body && typeof request.body === "object") return Buffer.from(JSON.stringify(request.body));
  return Buffer.alloc(0);
};

const proxyRequest = async (request, response, proxyPrefix, upstreamOrigin) => {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "GET") {
    response.status(405).json({ error: "Only GET requests are supported." });
    return;
  }

  const originalUrl = request.originalUrl || request.url || "";
  const parsedUrl = new URL(originalUrl, "https://curio.local");
  const upstreamPath = `${parsedUrl.pathname.replace(proxyPrefix, "")}${parsedUrl.search}`;
  const upstreamUrl = new URL(upstreamPath || "/", upstreamOrigin);

  try {
    const upstreamResponse = await fetch(upstreamUrl);
    upstreamResponse.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        response.set(key, value);
      }
    });
    response.set("Cache-Control", "public, max-age=30");
    response.status(upstreamResponse.status).send(Buffer.from(await upstreamResponse.arrayBuffer()));
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "Proxy request failed.",
    });
  }
};

const isBlockedRssProxyHost = (hostname) => {
  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::1"
  ) {
    return true;
  }
  if (/^127\./.test(normalized) || /^10\./.test(normalized) || /^192\.168\./.test(normalized)) {
    return true;
  }
  const private172Match = normalized.match(/^172\.(\d+)\./);
  return private172Match
    ? Number(private172Match[1]) >= 16 && Number(private172Match[1]) <= 31
    : false;
};

const isBlockedGenericProxyHost = (hostname) =>
  isBlockedRssProxyHost(hostname) || /^169\.254\./.test(hostname.toLowerCase());

exports.rssProxy = onRequest({ cors: true }, async (request, response) => {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "GET") {
    response.status(405).json({ error: "Only GET requests are supported." });
    return;
  }

  const rawUrl = String(request.query.url || "");
  if (!rawUrl) {
    response.status(400).json({ error: "Missing RSS URL." });
    return;
  }

  try {
    const upstreamUrl = new URL(rawUrl);
    if (
      !["http:", "https:"].includes(upstreamUrl.protocol) ||
      isBlockedRssProxyHost(upstreamUrl.hostname)
    ) {
      response.status(400).json({ error: "Unsupported RSS URL." });
      return;
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });
    upstreamResponse.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        response.set(key, value);
      }
    });
    response.set("Cache-Control", "public, max-age=60");
    response.status(upstreamResponse.status).send(Buffer.from(await upstreamResponse.arrayBuffer()));
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "RSS proxy request failed.",
    });
  }
});

exports.mcpProxy = onRequest({ cors: true }, async (request, response) => {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, x-api-key, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  );
  response.set("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Only POST requests are supported." });
    return;
  }

  const rawUrl = String(request.query.url || "");
  if (!rawUrl) {
    response.status(400).json({ error: "Missing MCP URL." });
    return;
  }

  try {
    const upstreamUrl = new URL(rawUrl);
    if (upstreamUrl.protocol !== "https:" || isBlockedGenericProxyHost(upstreamUrl.hostname)) {
      response.status(400).json({ error: "Unsupported MCP URL." });
      return;
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers: buildForwardHeaders(request, "application/json, text/event-stream"),
      body: getRequestBodyBuffer(request),
    });
    upstreamResponse.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        response.set(key, value);
      }
    });
    response.set("Cache-Control", "no-store");
    response.status(upstreamResponse.status).send(Buffer.from(await upstreamResponse.arrayBuffer()));
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "MCP proxy request failed.",
    });
  }
});

exports.mcpOAuthProxy = onRequest({ cors: true }, async (request, response) => {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "GET" && request.method !== "POST") {
    response.status(405).json({ error: "Only GET and POST requests are supported." });
    return;
  }

  const rawUrl = String(request.query.url || "");
  if (!rawUrl) {
    response.status(400).json({ error: "Missing MCP OAuth URL." });
    return;
  }

  try {
    const upstreamUrl = new URL(rawUrl);
    if (upstreamUrl.protocol !== "https:" || isBlockedGenericProxyHost(upstreamUrl.hostname)) {
      response.status(400).json({ error: "Unsupported MCP OAuth URL." });
      return;
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: buildForwardHeaders(request, "application/json"),
      ...(request.method === "POST" ? { body: getRequestBodyBuffer(request) } : {}),
    });
    upstreamResponse.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        response.set(key, value);
      }
    });
    response.set("Cache-Control", "no-store");
    response.status(upstreamResponse.status).send(Buffer.from(await upstreamResponse.arrayBuffer()));
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "MCP OAuth proxy request failed.",
    });
  }
});

exports.openAICompatibleProxy = onRequest({ cors: true }, async (request, response) => {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, api-key, anthropic-version, x-api-key");

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "GET" && request.method !== "POST") {
    response.status(405).json({ error: "Only GET and POST requests are supported." });
    return;
  }

  const rawUrl = String(request.query.url || "");
  if (!rawUrl) {
    response.status(400).json({ error: "Missing provider URL." });
    return;
  }

  try {
    const upstreamUrl = new URL(rawUrl);
    if (
      upstreamUrl.protocol !== "https:" ||
      !OPENAI_COMPATIBLE_PROXY_HOSTS.has(upstreamUrl.hostname.toLowerCase())
    ) {
      response.status(400).json({ error: "Unsupported provider URL." });
      return;
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: buildForwardHeaders(request, "application/json, text/event-stream"),
      ...(request.method === "POST" ? { body: getRequestBodyBuffer(request) } : {}),
    });
    upstreamResponse.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        response.set(key, value);
      }
    });
    response.set("Cache-Control", "no-store");
    response.status(upstreamResponse.status).send(Buffer.from(await upstreamResponse.arrayBuffer()));
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "OpenAI-compatible proxy request failed.",
    });
  }
});

exports.stockProxy = onRequest({ cors: true }, (request, response) =>
  proxyRequest(request, response, "/stock-proxy", "https://query1.finance.yahoo.com"),
);

exports.stooqProxy = onRequest({ cors: true }, (request, response) =>
  proxyRequest(request, response, "/stooq-proxy", "https://stooq.com"),
);

exports.quotesProxy = onRequest({ cors: true }, (request, response) =>
  proxyRequest(request, response, "/quotes-proxy", "https://zenquotes.io"),
);

exports.factsProxy = onRequest({ cors: true }, (request, response) =>
  proxyRequest(request, response, "/facts-proxy", "https://uselessfacts.jsph.pl"),
);
