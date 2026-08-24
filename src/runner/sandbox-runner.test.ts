import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCgnatAddressing, supportServiceDownArgs, createStderrTail } from './sandbox-runner.ts';

// #171: cgnat-net's subnet/listener IP used to be hardcoded identically
// across every job, so two concurrent postgres-net/mysql-net/sqlite-net
// jobs collided on the exact same Docker network subnet ("Pool overlaps
// with other one on this address space"). deriveCgnatAddressing replaces
// that with a per-sandboxDir value within the RFC 6598 CGNAT range.

test('is deterministic for the same sandboxDir', () => {
  const a = deriveCgnatAddressing('/tmp/job-42');
  const b = deriveCgnatAddressing('/tmp/job-42');
  assert.deepEqual(a, b);
});

test('differs across distinct sandboxDirs (no collision for two concurrent jobs)', () => {
  const a = deriveCgnatAddressing('/tmp/job-1');
  const b = deriveCgnatAddressing('/tmp/job-2');
  assert.notEqual(a.subnet, b.subnet);
  assert.notEqual(a.listenerIp, b.listenerIp);
});

test('stays within the RFC 6598 CGNAT range (100.64.0.0/10)', () => {
  for (const dir of ['/tmp/job-1', '/tmp/job-2', '/tmp/job-99999', '/var/run/sandbox-abc']) {
    const { subnet, listenerIp } = deriveCgnatAddressing(dir);
    const subnetMatch = subnet.match(/^100\.(\d+)\.(\d+)\.0\/24$/);
    assert.ok(subnetMatch, `subnet ${subnet} must be a 100.x.y.0/24`);
    const octet2 = Number(subnetMatch![1]);
    assert.ok(octet2 >= 64 && octet2 < 128, `second octet ${octet2} must fall in 64-127 (100.64.0.0/10)`);
    assert.equal(listenerIp, subnet.replace('.0/24', '.10'));
  }
});

test('listenerIp is always the .10 host within its own derived subnet', () => {
  const { subnet, listenerIp } = deriveCgnatAddressing('/tmp/some-job');
  assert.equal(listenerIp, subnet.replace(/\.0\/24$/, '.10'));
});

test('support-service teardown removes ephemeral anonymous volumes', () => {
  assert.deepEqual(
    supportServiceDownArgs('compose.postgres-net.yml'),
    ['compose', '-f', 'compose.postgres-net.yml', 'down', '--volumes', '--remove-orphans'],
  );
});

// #279 M1.5: the sandbox now captures a bounded tail of the target's stderr
// so an "exited before replying" failure is no longer a black box. The
// accumulator keeps the NEWEST bytes (the usage/error the target printed
// right before dying) and stays memory-bounded regardless of volume.
test('createStderrTail returns everything while under the cap', () => {
  const t = createStderrTail(1024);
  assert.equal(t.read(), '');
  t.push(Buffer.from('usage: server <stdio>\n'));
  t.push(Buffer.from('missing MCP_TOKEN\n'));
  assert.equal(t.read(), 'usage: server <stdio>\nmissing MCP_TOKEN\n');
});

test('createStderrTail keeps only the last maxBytes, preserving the newest output', () => {
  const t = createStderrTail(10);
  for (let i = 0; i < 100; i++) t.push(Buffer.from(`line${i}\n`));
  const tail = t.read();
  assert.equal(Buffer.byteLength(tail), 10, 'tail is capped to maxBytes');
  assert.ok(t.read().endsWith('line99\n'), `must keep the newest output, got: ${JSON.stringify(tail)}`);
  assert.ok(!t.read().includes('line0\n'), 'oldest output is dropped');
});

test('createStderrTail stays memory-bounded across many chunks', () => {
  const t = createStderrTail(8);
  for (let i = 0; i < 10000; i++) t.push(Buffer.from('x'.repeat(64)));
  assert.equal(t.read(), 'x'.repeat(8));
});
