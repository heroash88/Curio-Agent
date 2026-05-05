#!/usr/bin/env node
/**
 * Lightweight WebSocket proxy for Amazon Nova Sonic.
 *
 * Browser WebSocket API cannot set custom headers, so this proxy
 * accepts connections on a local port, reads the API key from a
 * query parameter, and forwards to the Nova API with the proper
 * Authorization header.
 *
 * Usage:
 *   node scripts/nova-proxy.mjs [port]
 *
 * Default port: 8081
 * Client connects to: ws://localhost:8081/?token=YOUR_API_KEY
 * Proxy connects to:  wss://api.nova.amazon.com/v1/realtime?model=nova-2-sonic-v1
 */

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = parseInt(process.argv[2] || '8081', 10);
const NOVA_URL = 'wss://api.nova.amazon.com/v1/realtime?model=nova-2-sonic-v1';

const server = createServer((_req, res) => {
    res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
    });
    res.end('Nova WebSocket proxy is running');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (clientWs, req) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const token = url.searchParams.get('token');

    if (!token) {
        clientWs.close(4001, 'Missing token query parameter');
        return;
    }

    console.log(`[nova-proxy] New client connection, forwarding to Nova...`);
    console.log(`[nova-proxy] Token: ${token.substring(0, 8)}...${token.substring(token.length - 4)}`);
    console.log(`[nova-proxy] Upstream URL: ${NOVA_URL}`);

    const novaWs = new WebSocket(NOVA_URL, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Origin': 'https://api.nova.amazon.com',
        },
        rejectUnauthorized: false,
        handshakeTimeout: 10000,
    });

    // Track connection state for diagnostics
    let novaConnState = 'connecting';
    const connStartTime = Date.now();

    const novaConnTimeout = setTimeout(() => {
        if (novaConnState === 'connecting') {
            console.error(`[nova-proxy] TIMEOUT: Nova WebSocket never opened after ${Date.now() - connStartTime}ms`);
            console.error(`[nova-proxy] readyState: ${novaWs.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);
            novaWs.terminate();
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close(4003, 'Nova upstream connection timed out');
            }
        }
    }, 12000);

    novaWs.on('upgrade', (response) => {
        console.log(`[nova-proxy] Nova upgrade response: ${response.statusCode} ${response.statusMessage}`);
        console.log(`[nova-proxy] Nova response headers:`, Object.fromEntries(
            Object.entries(response.headers).filter(([k]) => !k.startsWith('sec-websocket'))
        ));
    });

    novaWs.on('unexpected-response', (req, res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk.toString(); });
        res.on('end', () => {
            console.error(`[nova-proxy] Nova REJECTED WebSocket upgrade: HTTP ${res.statusCode} ${res.statusMessage}`);
            console.error(`[nova-proxy] Response body: ${body.substring(0, 500)}`);
            clearTimeout(novaConnTimeout);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close(4002, `Nova rejected: ${res.statusCode}`);
            }
        });
    });

    let novaReady = false;
    const pendingMessages = [];

    novaWs.on('open', () => {
        clearTimeout(novaConnTimeout);
        novaConnState = 'open';
        console.log(`[nova-proxy] Connected to Nova API (took ${Date.now() - connStartTime}ms)`);
        novaReady = true;
        // Flush any messages that arrived before Nova was ready
        for (const msg of pendingMessages) {
            novaWs.send(msg);
        }
        pendingMessages.length = 0;
    });

    novaWs.on('message', (data) => {
        // Ensure we forward as a string so the browser WebSocket receives text frames
        const str = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(str);
        }
        // Log a preview for debugging
        try {
            console.log('[nova-proxy] Nova -> Client:', str.substring(0, 200));
        } catch { /* ignore logging errors */ }
    });

    novaWs.on('close', (code, reason) => {
        clearTimeout(novaConnTimeout);
        novaConnState = 'closed';
        const reasonStr = reason ? reason.toString() : 'none';
        console.log(`[nova-proxy] Nova closed: code=${code} reason=${reasonStr} (was open for ${Date.now() - connStartTime}ms)`);
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(code, reason.toString());
        }
    });

    novaWs.on('error', (err) => {
        clearTimeout(novaConnTimeout);
        novaConnState = 'error';
        console.error(`[nova-proxy] Nova error (state was: ${novaConnState}, readyState: ${novaWs.readyState}):`, err.message);
        console.error(`[nova-proxy] Full error:`, err);
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(4002, 'Nova upstream error');
        }
    });

    // Forward client messages to Nova
    clientWs.on('message', (data) => {
        const str = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        const preview = str.substring(0, 200);
        console.log('[nova-proxy] Client -> Nova:', preview);
        if (novaReady && novaWs.readyState === WebSocket.OPEN) {
            novaWs.send(str);
        } else {
            pendingMessages.push(str);
        }
    });

    clientWs.on('close', () => {
        console.log('[nova-proxy] Client disconnected');
        if (novaWs.readyState === WebSocket.OPEN) {
            novaWs.close();
        }
    });

    clientWs.on('error', (err) => {
        console.error('[nova-proxy] Client error:', err.message);
        if (novaWs.readyState === WebSocket.OPEN) {
            novaWs.close();
        }
    });
});

server.listen(PORT, () => {
    console.log(`[nova-proxy] WebSocket proxy running on ws://localhost:${PORT}`);
    console.log(`[nova-proxy] Connect with: ws://localhost:${PORT}/?token=YOUR_API_KEY`);
});
