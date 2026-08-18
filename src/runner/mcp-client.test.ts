import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { attachClient } from './mcp-client.ts';

// Regression tests for the unhandled-EPIPE crash: a target process that dies
// mid-run closes its stdio pipes, and rpc()'s proc.stdin.write() used to
// throw an unhandled 'error' event that crashed the whole scan process --
// discarding every result already collected in the run, not just the
// in-flight call. See mcp-security#12 (proof-engine failure classification,
// unparseable_output category) and the follow-up handoff asking for an
// exit-between-writes case specifically.

test('rpc() resolves instead of crashing the process when the target has already exited', async () => {
  // A process that exits immediately, closing its stdio pipes.
  const proc = spawn('node', ['-e', 'process.exit(0)'], { stdio: ['pipe', 'pipe', 'pipe'] });
  await new Promise<void>((resolve) => proc.once('exit', () => resolve()));

  const client = attachClient(proc as any, { callTimeoutMs: 2000 });
  // The load-bearing assertion here is simply that this line is reached at
  // all: before the fix, writing to the already-closed stdin can throw an
  // unhandled 'error' event that crashes the whole test process, so the
  // test would never get this far.
  const result = await client.rpc('ping', {});
  assert.deepEqual(result, { __timedOut: true });
});

test('rpc() resolves instead of hanging when stdin errors mid-call', async () => {
  // cat happily blocks reading, giving us a live process whose stdin we can
  // sever out from under an in-flight rpc() call.
  const proc = spawn('cat', [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const client = attachClient(proc as any, { callTimeoutMs: 5000 });
  const pending = client.rpc('ping', {});
  proc.stdin.destroy(new Error('simulated broken pipe'));
  const result = await pending;
  assert.equal((result as any).__processExited, true);
  proc.kill();
});

test('rpc() settles a second call cleanly when the target exits between two writes', async () => {
  // A minimal fake target: answers the first request with a real matched
  // JSON-RPC result (proving the transport works normally end to end), then
  // exits without ever reading the second request -- reproducing a target
  // that dies partway through a multi-call run.
  const proc = spawn('node', ['-e', `
    process.stdin.setEncoding('utf8');
    let handled = false;
    process.stdin.on('data', (chunk) => {
      if (handled) return;
      handled = true;
      const msg = JSON.parse(chunk.split('\\n')[0]);
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { ok: true } }) + '\\n', () => process.exit(0));
    });
  `], { stdio: ['pipe', 'pipe', 'pipe'] });

  const client = attachClient(proc as any, { callTimeoutMs: 500 });

  const first = await client.rpc('ping', {});
  assert.deepEqual(first, { ok: true }, 'first call should get a real (non-timeout) matched response');

  await new Promise<void>((resolve) => proc.once('exit', () => resolve()));

  // The load-bearing assertion is again just that this line is reached:
  // before the fix, a write against the now-closed pipe from this second,
  // unrelated call could throw and crash the process, taking the already-
  // collected first result down with it.
  const second = await client.rpc('ping', {});
  assert.deepEqual(second, { __timedOut: true });
});
