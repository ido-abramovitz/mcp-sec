'use strict';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Profile } from './types.js';

import { spawn, spawnSync } from 'node:child_process';
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

function startSupportServices({ sandboxDir, profile }: { sandboxDir: string; profile: Profile }) {
  const composeFile = PROFILE_COMPOSE_FILES[profile];
  const services = PROFILE_SUPPORT_SERVICES[profile] || [];
  if (services.length === 0) return;
  const result = spawnSync('docker', ['compose', '-f', composeFile, 'up', '-d', ...services], {
    cwd: sandboxDir,
    stdio: 'ignore',
  });
  if (result.status !== 0) {
    throw new Error(`failed to start support services [${services.join(', ')}] for profile ${profile}`);
  }
}

function stopSupportServices({ sandboxDir, profile }: { sandboxDir: string; profile: Profile }) {
  const composeFile = PROFILE_COMPOSE_FILES[profile];
  const services = PROFILE_SUPPORT_SERVICES[profile] || [];
  if (services.length === 0) return;
  spawnSync('docker', ['compose', '-f', composeFile, 'down', '--remove-orphans'], { cwd: sandboxDir, stdio: 'ignore' });
}

interface StartTargetArgs {
  sandboxDir: string;
  profile: Profile;
  cmd: string;
  env?: Record<string, string>;
  runTimeoutMs?: number;
}

function startTarget({ sandboxDir, profile, cmd, env = {}, runTimeoutMs }: StartTargetArgs): { proc: ChildProcessWithoutNullStreams; wasKilledByWatchdog: () => boolean } {
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

  // stdio's third slot ('ignore') means the real return type has stderr:
  // null (ChildProcessByStdio<Writable, Readable, null>) -- consuming code
  // only ever touches stdout/stdin/kill(), never stderr.
  const proc = spawn('docker', args, { cwd: sandboxDir, stdio: ['pipe', 'pipe', 'ignore'] }) as unknown as ChildProcessWithoutNullStreams;

  let killedByWatchdog = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  if (runTimeoutMs) {
    watchdog = setTimeout(() => {
      killedByWatchdog = true;
      proc.kill('SIGKILL');
    }, runTimeoutMs);
    proc.once('exit', () => clearTimeout(watchdog));
  }

  return { proc, wasKilledByWatchdog: () => killedByWatchdog };
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
function installTarget({ sandboxDir, packageSpec }: { sandboxDir: string; packageSpec: string }): { ok: boolean; error?: string } {
  const result = spawnSync(
    'docker',
    ['compose', '-f', 'compose.install.yml', 'run', '--rm', '-T', 'target', 'sh', '-c', `npm install --no-audit --no-fund --prefix /home/runner/target ${packageSpec}`],
    { cwd: sandboxDir, encoding: 'utf8' },
  );
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

export { startTarget, startSupportServices, stopSupportServices, listenerLog, dropHit, installTarget, extractNpxPackageSpec, PROFILE_COMPOSE_FILES };
export type { Profile };
