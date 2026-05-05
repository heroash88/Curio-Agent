// Probe aws-outlook-mcp email_read to inspect its full response shape
// so we know how to extract itemId + itemChangeKey for reply.
// Usage: node scripts/probe-email-read.mjs <conversationId>

import { spawn } from 'node:child_process';

const [, , convId] = process.argv;
if (!convId) {
  console.error('Usage: node scripts/probe-email-read.mjs <conversationId>');
  process.exit(2);
}

const child = spawn(
  'C:/Users/thealim/AppData/Local/Toolbox/bin/aws-outlook-mcp.exe',
  [],
  {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, OUTLOOK_MCP_ENABLE_WRITES: 'true' },
  },
);

let buffer = '';
let nextId = 1;
const pending = new Map();

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf('\n');
  while (index !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) {
      try {
        const data = JSON.parse(line);
        const h = pending.get(data.id);
        if (h) { pending.delete(data.id); h(data); }
      } catch {}
    }
    index = buffer.indexOf('\n');
  }
});
child.stderr.on('data', () => {});

const req = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, (data) => data.error
    ? reject(new Error(JSON.stringify(data.error)))
    : resolve(data.result));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} }) + '\n');
});

(async () => {
  try { await req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '1' } }); } catch {}

  // Show email_read schema.
  const list = await req('tools/list');
  const readTool = list.tools.find((t) => t.name === 'email_read');
  console.log('email_read inputSchema:');
  console.log(JSON.stringify(readTool?.inputSchema, null, 2));

  // Call it with the given conversationId.
  console.log(`\n--- email_read result for conversationId=${convId} ---\n`);
  const result = await req('tools/call', { name: 'email_read', arguments: { conversationId: convId } });
  console.log(JSON.stringify(result, null, 2).slice(0, 4000));

  try { child.stdin.end(); } catch {}
  setTimeout(() => { try { child.kill(); } catch {} process.exit(0); }, 400);
})().catch((err) => {
  console.error('probe failed:', err.message);
  process.exit(1);
});
