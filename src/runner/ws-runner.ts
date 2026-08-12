import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { startTarget, startSupportServices, stopSupportServices, listenerLog, dropHit } from './sandbox-runner.js';
import { attachClient } from './mcp-client.js';
import type { McpClient } from './types.js';
import type { RunnerCommand, RunnerReply } from './protocol.js';

// The actual thing a customer runs on their own Docker-equipped machine.
// Connects OUT to the backend (so it works from behind a customer's
// firewall/NAT with no inbound port to open -- the backend is the one
// with a public, stable address) and, for each command received, does
// exactly the same mechanical work red-engine.ts's CLI always did
// locally: spawn a Docker container, speak MCP stdio JSON-RPC to it,
// check for out-of-band oracle hits. Never sees a payload-generation
// strategy or a verdict rule -- those stay server-side; this only relays
// "call this tool with these arguments" and "did this token show up."

interface LiveSession {
  proc: ChildProcessWithoutNullStreams;
  client: McpClient;
  sandboxDir: string;
  profile: string;
}

export interface RunOptions {
  url: string;
  sandboxDir: string;
  // Identifies this connection to the backend as a specific customer --
  // sent as a bearer token on the WS upgrade request itself, so an
  // invalid/missing key is rejected before any socket exists at all
  // (never inside a WS frame, never logged as part of the protocol).
  apiKey: string;
  // What to actually scan -- the runner (this machine) is the one that
  // knows how to launch the customer's own MCP server; answered when the
  // backend asks via scan.info, never guessed or configured backend-side.
  cmd: string;
  env: Record<string, string>;
  onLog?: (line: string) => void;
  // Called once, when the backend delivers the finished scan.report.
  onResult?: (result: { exitCode: number; text: string }) => void;
}

export function runWsRunner({ url, sandboxDir, apiKey, cmd: targetCmd, env: targetEnv, onLog = () => {}, onResult = () => {} }: RunOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const sessions = new Map<string, LiveSession>();
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${apiKey}` } });

    function reply(msg: RunnerReply) {
      ws.send(JSON.stringify(msg));
    }

    ws.on('open', () => onLog(`connected to ${url}`));

    ws.on('message', async (raw: Buffer) => {
      let cmd: RunnerCommand;
      try {
        cmd = JSON.parse(raw.toString('utf8'));
      } catch {
        return; // ignore stray non-JSON noise
      }

      try {
        switch (cmd.kind) {
          case 'session.start': {
            startSupportServices({ sandboxDir, profile: cmd.profile });
            const { proc } = startTarget({ sandboxDir, profile: cmd.profile, cmd: cmd.cmd, env: cmd.env, runTimeoutMs: cmd.runTimeoutMs });
            const client = attachClient(proc, { callTimeoutMs: cmd.callTimeoutMs });
            const sessionId = randomUUID();
            sessions.set(sessionId, { proc, client, sandboxDir, profile: cmd.profile });
            reply({ kind: 'reply', id: cmd.id, ok: true, result: { sessionId } });
            break;
          }
          case 'rpc': {
            const session = sessions.get(cmd.sessionId);
            if (!session) {
              reply({ kind: 'reply', id: cmd.id, ok: false, error: `unknown sessionId: ${cmd.sessionId}` });
              break;
            }
            const result = await session.client.rpc(cmd.method, cmd.params, cmd.meta);
            reply({ kind: 'reply', id: cmd.id, ok: true, result });
            break;
          }
          case 'oracle.dropHit': {
            const session = sessions.get(cmd.sessionId);
            if (!session) {
              reply({ kind: 'reply', id: cmd.id, ok: false, error: `unknown sessionId: ${cmd.sessionId}` });
              break;
            }
            const hit = dropHit(session.sandboxDir, cmd.token);
            reply({ kind: 'reply', id: cmd.id, ok: true, result: { hit } });
            break;
          }
          case 'oracle.listenerLog': {
            const session = sessions.get(cmd.sessionId);
            if (!session) {
              reply({ kind: 'reply', id: cmd.id, ok: false, error: `unknown sessionId: ${cmd.sessionId}` });
              break;
            }
            const hit = listenerLog(session.sandboxDir, cmd.token);
            reply({ kind: 'reply', id: cmd.id, ok: true, result: { hit } });
            break;
          }
          case 'session.stop': {
            const session = sessions.get(cmd.sessionId);
            if (session) {
              session.proc.kill();
              stopSupportServices({ sandboxDir: session.sandboxDir, profile: session.profile as any });
              sessions.delete(cmd.sessionId);
            }
            reply({ kind: 'reply', id: cmd.id, ok: true, result: {} });
            break;
          }
          case 'scan.info': {
            reply({ kind: 'reply', id: cmd.id, ok: true, result: { cmd: targetCmd, env: targetEnv } });
            break;
          }
          case 'scan.report': {
            onResult({ exitCode: cmd.exitCode, text: cmd.text });
            reply({ kind: 'reply', id: cmd.id, ok: true, result: {} });
            break;
          }
        }
      } catch (err) {
        reply({ kind: 'reply', id: (cmd as any).id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });

    ws.on('close', () => resolve());
    ws.on('error', (err) => reject(err));
  });
}
