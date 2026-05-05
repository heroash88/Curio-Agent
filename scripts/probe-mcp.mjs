// One-off probe: spawns a stdio MCP binary, sends initialize +
// tools/list, and prints each tool name/description to stdout.
// Usage:
//   node scripts/probe-mcp.mjs "C:\\path\\to\\server.exe" [args...]

import { spawn } from 'node:child_process';

const [, , command, ...args] = process.argv;
if (!command) {
  console.error('Usage: node scripts/probe-mcp.mjs <executable> [args...]');
  process.exit(2);
}

const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

let buffer = '';
let nextId = 1;
const pending = new Map();

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf('\n');
  while (index !== -1) {
    const line = buffer.slice(0, index).replace(/\r$/, '').trim();
    buffer = buffer.slice(index + 1);
    if (line.length > 0) {
      try {
        const data = JSON.parse(line);
        const handler = pending.get(data.id);
        if (handler) {
          pending.delete(data.id);
          handler(data);
        }
      } catch (error) {
        console.error('[probe] Unparseable line:', error.message, line.slice(0, 200));
      }
    }
    index = buffer.indexOf('\n');
  }
});

child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => process.stderr.write(`[mcp stderr] ${chunk}`));

child.on('exit', (code, signal) => {
  console.log(`[probe] child exited: code=${code} signal=${signal}`);
  process.exit(typeof code === 'number' ? code : 0);
});

const request = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, (data) => {
    if (data.error) reject(new Error(`${method} -> ${JSON.stringify(data.error)}`));
    else resolve(data.result);
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} })}\n`);
});

(async () => {
  try {
    await request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'curio-probe', version: '1.0.0' },
    });
  } catch (error) {
    console.warn('[probe] initialize failed (continuing):', error.message);
  }

  try {
    const result = await request('tools/list', {});
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    console.log(`[probe] tools/list returned ${tools.length} tools:\n`);
    for (const tool of tools) {
      console.log(`- ${tool.name}`);
      const desc = typeof tool.description === 'string' ? tool.description.split('\n')[0].slice(0, 200) : '';
      if (desc) console.log(`    ${desc}`);
    }
    console.log(`\n[probe] count: ${tools.length}`);
  } catch (error) {
    console.error('[probe] tools/list failed:', error.message);
  } finally {
    try { child.stdin.end(); } catch { /* noop */ }
    setTimeout(() => { try { child.kill(); } catch { /* noop */ } }, 500);
  }
})();
