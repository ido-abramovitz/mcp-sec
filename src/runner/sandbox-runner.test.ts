import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCgnatAddressing } from './sandbox-runner.ts';

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
