'use strict';
import type { McpClient } from './types.js';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

// MCP stdio JSON-RPC transport only. Does not know how the target process
// was launched or what any payload means -- see sandbox-runner.ts. Moved
// here verbatim from proof-engine/red-engine/mcp-client.ts (private repo)
// -- purely mechanical, no proprietary check logic.

interface PendingEntry {
  resolve: (value: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

function attachClient(proc: ChildProcessWithoutNullStreams, { callTimeoutMs = 5000 }: { callTimeoutMs?: number } = {}): McpClient {
  let buf = '';
  let nextId = 1;
  const pending = new Map<number, PendingEntry>();

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg: { id: number; result: unknown };
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // ignore stray non-JSON-RPC noise on stdout
      }
      const entry = pending.get(msg.id);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(msg.id);
        entry.resolve(msg.result);
      }
    }
  });

  proc.once('exit', () => {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.resolve({ __timedOut: true, __processExited: true });
    }
    pending.clear();
  });

  // `meta`, when given, is sent as `params._meta` -- the MCP protocol's own
  // per-request metadata slot (distinct from tool `arguments`). Used by
  // the backend to test whether a target reads attacker-influenced values
  // out of `_meta`.
  function rpc(method: string, params: Record<string, unknown>, meta?: Record<string, unknown>) {
    return new Promise((resolve) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ __timedOut: true });
      }, callTimeoutMs);
      pending.set(id, { resolve, timer });
      const fullParams = meta ? { ...params, _meta: meta } : params;
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: fullParams }) + '\n');
    });
  }

  return { rpc };
}

export { attachClient };
