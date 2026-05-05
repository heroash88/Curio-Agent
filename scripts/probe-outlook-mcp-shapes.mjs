// Probe aws-outlook-mcp for response shapes + schemas of the tools
// the Mail/Tasks/Notes widgets try to call. This is a read-only script;
// it does not invoke any write tools.
//
// Usage: node scripts/probe-outlook-mcp-shapes.mjs

import { spawn } from 'node:child_process';

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

const heading = (label) => console.log(`\n=== ${label} ===`);

(async () => {
  try { await req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '1' } }); } catch {}

  const list = await req('tools/list');
  const tools = list.tools;

  for (const name of ['todo_lists', 'todo_tasks', 'todo_checklist', 'email_read', 'email_reply']) {
    const tool = tools.find((t) => t.name === name);
    heading(`${name} schema`);
    console.log(JSON.stringify(tool?.inputSchema || null, null, 2));
  }

  // Call email_inbox with limit=1 to get a real conversationId to probe email_read.
  heading('email_inbox(limit: 1) response');
  let conversationId = null;
  try {
    const inboxResult = await req('tools/call', { name: 'email_inbox', arguments: { limit: 1 } });
    const text = inboxResult?.content?.[0]?.text || '';
    console.log(text.slice(0, 800));
    const match = text.match(/"conversationId"\s*:\s*"([^"]+)"/);
    if (match) conversationId = match[1];
    console.log(`\nExtracted conversationId: ${conversationId}`);
  } catch (error) {
    console.log('email_inbox failed:', error.message);
  }

  if (conversationId) {
    heading(`email_read(conversationId=${conversationId.slice(0, 24)}...) full response`);
    try {
      const readResult = await req('tools/call', { name: 'email_read', arguments: { conversationId } });
      const text = readResult?.content?.[0]?.text || '';
      console.log(text.slice(0, 3500));
    } catch (error) {
      console.log('email_read failed:', error.message);
    }
  }

  heading('todo_lists(operation: "list") response');
  try {
    const tlResult = await req('tools/call', { name: 'todo_lists', arguments: { operation: 'list' } });
    const text = tlResult?.content?.[0]?.text || '';
    console.log(text.slice(0, 1200));
  } catch (error) {
    console.log('todo_lists failed:', error.message);
  }

  try { child.stdin.end(); } catch {}
  setTimeout(() => { try { child.kill(); } catch {} process.exit(0); }, 500);
})().catch((err) => {
  console.error('probe failed:', err.message);
  process.exit(1);
});
