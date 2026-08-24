'use strict';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Profile } from './types.js';

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Owns: spawning `docker compose run` under a given network profile, env
// vars, and the whole-run watchdog. Does not know JSON-RPC or payload
// semantics -- see mcp-client.ts and (backend-only) checks/*.ts
// respectively. Moved here verbatim from
// proof-engine/red-engine/sandbox-runner.ts (private repo) -- purely
// mechanical, no proprietary check logic.

const PROFILE_COMPOSE_FILES: Record<Profile, string> = {
  airgapped: 'compose.airgapped.yml',
  'canary-net': 'compose.canary-net.yml',
  'qdrant-net': 'compose.qdrant-net.yml',
  'postgres-net': 'compose.postgres-net.yml',
  'sqlite-net': 'compose.sqlite-net.yml',
  'mysql-net': 'compose.mysql-net.yml',
};

// canary-net/qdrant-net need a second, long-lived container running
// BEFORE the target starts and torn down after -- airgapped is
// single-container and this is a no-op for it. qdrant-net's second
// container is a real qdrant/qdrant instance -- some targets' tools can't
// do anything meaningful without a real backend, not just a canary oracle.
const PROFILE_SUPPORT_SERVICES: Record<Profile, string[]> = {
  airgapped: [],
  'canary-net': ['canary-listener'],
  'qdrant-net': ['qdrant'],
  // postgres-net needs BOTH support services: a forced profile routes
  // every check (including ssrf) through this one profile, so the ssrf
  // oracle (canary-listener) has to be present alongside the real
  // Postgres backend, or ssrf's results here would be meaningless.
  'postgres-net': ['postgres', 'canary-listener'],
  // SQLite needs no database container -- just the ssrf oracle, same
  // reasoning as postgres-net's canary-listener inclusion.
  'sqlite-net': ['canary-listener'],
  'mysql-net': ['mysql', 'canary-listener'],
};

// cgnat-net's subnet/listener IP used to be hardcoded identically across
// every job (100.64.55.0/24, listener at .10, in the postgres-net/mysql-
// net/sqlite-net compose files) -- harmless with one job at a time, but
// two concurrent jobs on any of those profiles collide on the exact same
// Docker network subnet and one fails outright ("Pool overlaps with other
// one on this address space"). Derives a per-job /24 within the same RFC
// 6598 CGNAT range (100.64.0.0/10) from sandboxDir itself -- already
// guaranteed unique per job, so no new parameter needed anywhere in the
// call chain. 100.64.0.0/10 has room for 16384 distinct /24s (64 values
// in the second octet x 256 in the third), comfortably more than this
// system will ever run concurrently.
function deriveCgnatAddressing(sandboxDir: string): { subnet: string; listenerIp: string } {
  const hash = crypto.createHash('sha256').update(sandboxDir).digest();
  const offset = hash.readUInt16BE(0) % 16384;
  const octet2 = 64 + (offset >> 8);
  const octet3 = offset & 255;
  return { subnet: `100.${octet2}.${octet3}.0/24`, listenerIp: `100.${octet2}.${octet3}.10` };
}

function startSupportServices({ sandboxDir, profile }: { sandboxDir: string; profile: Profile }) {
  const composeFile = PROFILE_COMPOSE_FILES[profile];
  const services = PROFILE_SUPPORT_SERVICES[profile] || [];
  if (services.length === 0) return;
  // Written unconditionally (even for profiles whose compose file doesn't
  // reference these vars, e.g. canary-net/qdrant-net) -- harmless, and
  // simpler than tracking which profiles need it. Docker Compose reads a
  // .env file from the SAME directory it's invoked from (cwd below), and
  // this always runs before the compose invocations that need it (both
  // this function's own `up -d` and startTarget's `run`, called right
  // after with this same sandboxDir).
  const { subnet, listenerIp } = deriveCgnatAddressing(sandboxDir);
  fs.writeFileSync(path.join(sandboxDir, '.env'), `CGNAT_SUBNET=${subnet}\nCGNAT_LISTENER_IP=${listenerIp}\n`);
  // stdio was 'ignore' -- every failure of this call landed in
  // proof-engine's ledger as the same content-free "failed to start
  // support services [...]" message regardless of the real Docker Compose
  // error, making it impossible to tell a resource-exhaustion failure
  // (candidate root cause: this box is 2 vCPU/1.9GB, and postgres-net
  // starts a real Postgres container concurrently with other scan
  // workers' own compose projects) apart from a port conflict, a stale
  // network, or a missing image -- same content-free-message anti-pattern
  // proof-engine's own #105 already fixed for scan_timeout, just one repo
  // over. Capturing it doesn't change behavior on success (still throws
  // on any non-zero exit); it only means the NEXT failure is diagnosable
  // instead of a guess.
  const result = spawnSync('docker', ['compose', '-f', composeFile, 'up', '-d', ...services], {
    cwd: sandboxDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const output = String(result.stderr || result.stdout || '').trim().slice(-1500);
    throw new Error(`failed to start support services [${services.join(', ')}] for profile ${profile}${output ? `: ${output}` : ' (no output captured)'}`);
  }
}

function supportServiceDownArgs(composeFile: string): string[] {
  // postgres/mysql/qdrant images declare anonymous data volumes. Removing
  // only their containers leaves those volumes detached and invisible to a
  // later compose-down call. Production accumulated thousands of them until
  // the scanner host reached 99% disk usage. Teardown owns these throwaway
  // support services, so it must also own deletion of their ephemeral data.
  return ['compose', '-f', composeFile, 'down', '--volumes', '--remove-orphans'];
}

function stopSupportServices({ sandboxDir, profile }: { sandboxDir: string; profile: Profile }) {
  const composeFile = PROFILE_COMPOSE_FILES[profile];
  const services = PROFILE_SUPPORT_SERVICES[profile] || [];
  if (services.length === 0) return;
  spawnSync('docker', supportServiceDownArgs(composeFile), { cwd: sandboxDir, stdio: 'ignore' });
}

interface StartTargetArgs {
  sandboxDir: string;
  profile: Profile;
  cmd: string;
  env?: Record<string, string>;
  runTimeoutMs?: number;
}

// A target that exits before answering the MCP handshake usually explains
// itself on STDERR (a usage message, a missing-config error, a stack trace)
// -- but that channel used to be discarded (stdio slot 'ignore'), leaving
// every "exited before replying" failure a black box (see mcp-security#279).
// We pipe BOTH stderr and stdout and keep a bounded tail of each, capped at
// 32 KiB. stderr holds usage dumps / stack traces. stdout normally carries the
// MCP JSON-RPC, but a target that never speaks MCP often prints a human banner
// or a "listening on http://..." line to stdout and exits -- the single
// strongest signal for the HTTP-only and wrong-entrypoint buckets. Teeing a
// tail off stdout is safe: attachClient (mcp-client.ts) adds its own 'data'
// listener, and Node delivers every chunk to ALL listeners, so the tee never
// steals bytes from the JSON-RPC parser.
const MAX_STDERR_TAIL_BYTES = 32 * 1024;
const MAX_STDOUT_TAIL_BYTES = 32 * 1024;

// Bounded stream-tail accumulator: holds recent chunks and trims from the
// front once buffered bytes exceed ~2x the cap, so memory stays bounded and
// the newest (most diagnostic) output always survives; the exact last
// `maxBytes` are sliced only when read. Accepts Buffer OR string chunks --
// stderr arrives as Buffers, but stdout arrives as utf8 strings once
// attachClient calls setEncoding('utf8') on the shared stream. Extracted so
// the bounding contract is unit-testable without spawning a container.
export function createStreamTail(maxBytes: number): { push: (chunk: Buffer | string) => void; read: () => string } {
  const chunks: Buffer[] = [];
  let bufferedBytes = 0;
  return {
    push(chunk: Buffer | string) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      chunks.push(buf);
      bufferedBytes += buf.length;
      while (bufferedBytes > maxBytes * 2 && chunks.length > 1) bufferedBytes -= chunks.shift()!.length;
    },
    read() {
      const buf = Buffer.concat(chunks);
      return buf.subarray(Math.max(0, buf.length - maxBytes)).toString('utf8');
    },
  };
}

function startTarget({ sandboxDir, profile, cmd, env = {}, runTimeoutMs }: StartTargetArgs): {
  proc: ChildProcessWithoutNullStreams;
  wasKilledByWatchdog: () => boolean;
  stderrTail: () => string;
  stdoutTail: () => string;
  exitInfo: () => { code: number | null; signal: NodeJS.Signals | null; killedByWatchdog: boolean };
} {
  const composeFile = PROFILE_COMPOSE_FILES[profile];
  if (!composeFile) throw new Error(`unknown sandbox profile: ${profile}`);

  // drops/ is bind-mounted writable into the container, which runs as a
  // fixed non-root UID (10001, see sandbox/Dockerfile) that essentially
  // never matches whatever host UID checked out this repo. Force it
  // world-writable here, unconditionally, so this never depends on which
  // UID happens to run the sandbox.
  const dropsDir = path.join(sandboxDir, 'drops');
  if (fs.existsSync(dropsDir)) fs.chmodSync(dropsDir, 0o777);

  const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const args = ['compose', '-f', composeFile, 'run', '--rm', '-T', ...envArgs, 'target', 'sh', '-c', cmd];

  // stdio slot 3 is 'pipe' (was 'ignore') so we can capture the target's
  // stderr; the data listener below drains it continuously, so the pipe
  // never fills and blocks the child.
  const proc = spawn('docker', args, { cwd: sandboxDir, stdio: ['pipe', 'pipe', 'pipe'] }) as unknown as ChildProcessWithoutNullStreams;

  const stderr = createStreamTail(MAX_STDERR_TAIL_BYTES);
  if (proc.stderr) {
    proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    // Best-effort diagnostics only -- a stderr stream error must never crash
    // the scan (mirrors mcp-client.ts's own defensive stdin/stdout handling).
    proc.stderr.on('error', () => {});
  }

  // Tee a bounded tail off stdout too. attachClient attaches its own parser
  // listener later (synchronously, before any data flows), so this is purely
  // additive -- both listeners see every chunk. Chunks arrive as utf8 strings
  // once attachClient sets the encoding; createStreamTail handles either.
  const stdout = createStreamTail(MAX_STDOUT_TAIL_BYTES);
  if (proc.stdout) {
    proc.stdout.on('data', (chunk: Buffer | string) => stdout.push(chunk));
    proc.stdout.on('error', () => {});
  }

  // Record why the target died, for per-attempt diagnostic classification: a
  // clean non-zero exit vs. a signal (OOM/segfault) vs. our own watchdog kill
  // are different failure modes that the raw stderr tail alone can't always
  // distinguish.
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  proc.once('exit', (code, signal) => { exitCode = code; exitSignal = signal; });

  let killedByWatchdog = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  if (runTimeoutMs) {
    watchdog = setTimeout(() => {
      killedByWatchdog = true;
      proc.kill('SIGKILL');
    }, runTimeoutMs);
    proc.once('exit', () => clearTimeout(watchdog));
  }

  return {
    proc,
    wasKilledByWatchdog: () => killedByWatchdog,
    stderrTail: () => stderr.read(),
    stdoutTail: () => stdout.read(),
    exitInfo: () => ({ code: exitCode, signal: exitSignal, killedByWatchdog }),
  };
}

// The out-of-band oracle for canary-net checks (ssrf, exfiltration): does
// the listener's own request log contain this exact token?
function listenerLog(sandboxDir: string, token: string): boolean {
  const logPath = path.join(sandboxDir, 'canary-hits', 'hits.log');
  if (!fs.existsSync(logPath)) return false;
  return fs.readFileSync(logPath, 'utf8').includes(token);
}

// Runs a target's fetch/install step under compose.install.yml -- the one
// profile with real network access (see that file's own header comment),
// on purpose, ONLY for this. Installs into ./target itself (npm --prefix),
// not the default global npx cache, because ./target is the exact host
// directory every other (network-isolated) profile mounts back in
// read-only -- so whatever lands here at install time is exactly what a
// later `npx <pkg>@<version>` at test time resolves locally, with no
// network call, via npx's own node_modules-first resolution. Every
// historical target in this project needed this same fetch-then-reuse
// step; only difference is a human used to do it by hand.
// Bounded at 2 minutes -- generous for what should be a small MCP server
// package (real installs observed so far: 2-11s), but still finite. Before
// this, spawnSync had no timeout at all: a hung `npm install` (a
// postinstall script waiting on an unreachable network call, a registry
// retry loop, etc.) blocked the whole process indefinitely with zero
// recovery -- confirmed live against @agentek/mcp-server@0.1.27, which sat
// for 1h51m using 3s of CPU time before being killed by hand.
const INSTALL_TIMEOUT_MS = 120_000;

function installTarget({ sandboxDir, packageSpec }: { sandboxDir: string; packageSpec: string }): { ok: boolean; error?: string } {
  const result = spawnSync(
    'docker',
    ['compose', '-f', 'compose.install.yml', 'run', '--rm', '-T', 'target', 'sh', '-c', `npm install --no-audit --no-fund --prefix /home/runner/target ${packageSpec}`],
    { cwd: sandboxDir, encoding: 'utf8', timeout: INSTALL_TIMEOUT_MS },
  );
  // Killing the `docker compose run` client process (what the timeout
  // option's signal targets) does not reliably stop the container it
  // launched -- confirmed live: five orphaned sandbox-target-run-*
  // containers, one up to 50 minutes old, survived their client process
  // dying. `down --remove-orphans` is scoped to this compose file's own
  // project (compose.install.yml), so it only ever cleans up this
  // install's own container, never another profile's.
  if (result.signal || result.error?.message?.includes('ETIMEDOUT')) {
    spawnSync('docker', ['compose', '-f', 'compose.install.yml', 'down', '--volumes', '--remove-orphans'], { cwd: sandboxDir });
    return { ok: false, error: `install timed out after ${INSTALL_TIMEOUT_MS}ms (packageSpec=${packageSpec})` };
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'install failed').trim();
    return { ok: false, error: detail.slice(-2000) };
  }
  return { ok: true };
}

// Recognizes only the one shape every real MCP server config in this
// project actually uses: `npx [-y] <pkg>[@<version>] [server args...]`.
// The package spec is the FIRST non-flag token after npx -- unlike
// config.ts's extractPackageSpec (which reads the LAST non-flag token out
// of a static config's args array, for a different "wrapper installer
// CLI" shape) -- here anything after the package spec is the target
// server's own arguments, not part of what npx needs to fetch. Anything
// that isn't an npx invocation (a bare local script, an already-installed
// binary, etc.) has nothing to fetch, so this returns null and the
// install step is skipped entirely -- matches how a customer's own
// already-vendored project code was always handled.
function extractNpxPackageSpec(cmd: string): string | null {
  const tokens = cmd.trim().split(/\s+/);
  if (tokens[0] !== 'npx') return null;
  const nonFlags = tokens.slice(1).filter((t) => !t.startsWith('-'));
  return nonFlags.length > 0 ? nonFlags[0] : null;
}

// The out-of-band oracle for BLIND checks that can't rely on response text
// at all (e.g. command injection): did a file matching this exact token
// show up in the host-visible drop zone? Consumes the file on a hit.
function dropHit(sandboxDir: string, token: string): boolean {
  const dropPath = path.join(sandboxDir, 'drops', token);
  if (!fs.existsSync(dropPath)) return false;
  try {
    fs.unlinkSync(dropPath);
  } catch {
    // already gone -- fine, the hit itself is what matters
  }
  return true;
}

export { startTarget, startSupportServices, stopSupportServices, supportServiceDownArgs, listenerLog, dropHit, installTarget, extractNpxPackageSpec, PROFILE_COMPOSE_FILES, deriveCgnatAddressing };
export type { Profile };
