// The live/on-demand half of this CLI: sandboxes and scans a server on
// THIS machine (Docker required) while the actual exploit-proving logic
// stays on the backend -- see src/runner/. Deliberately a separate,
// explicit command from `check` (src/api.ts): that command is instant,
// free, and side-effect-free; this one spins up Docker, runs live
// exploit payloads against a real process, and spends the caller's
// budget. Same reasoning as `npm audit` vs `npm audit fix`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runWsRunner } from './runner/index.js';

const SCAN_URL = process.env.MCP_SEC_SCAN_URL || 'wss://scan.mcpsecurity.cloud';

// Distinct exit codes so scripts/CI can tell "couldn't even run" apart
// from "ran and found something" -- extends cli.ts's existing 0/1/2
// convention (0 clean, 1 usage/internal error, 2 vulnerable-per-catalog).
export const EXIT_DOCKER_MISSING = 3;
export const EXIT_NO_API_KEY = 4;

function dockerAvailable(): boolean {
  const version = spawnSync('docker', ['version'], { stdio: 'ignore' });
  const composeVersion = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' });
  return version.status === 0 && composeVersion.status === 0;
}

// The package ships its own sandbox/ (Dockerfile, compose profiles,
// seccomp configs -- see package.json's "files") as a read-only
// reference copy alongside dist/. Runtime state (target/, sentinels/,
// drops/, canary-hits/) has to live somewhere writable that isn't the
// installed package tree itself, so this mirrors the asset files into a
// per-user working directory once, then reuses it on later scans instead
// of re-copying and rebuilding every time.
function ensureWorkingSandboxDir(): string {
  const packageSandboxDir = path.join(import.meta.dirname, '..', 'sandbox');
  const workingDir = path.join(os.homedir(), '.mcp-sec', 'sandbox');

  const marker = path.join(workingDir, '.assets-copied');
  if (!fs.existsSync(marker)) {
    fs.mkdirSync(workingDir, { recursive: true });
    for (const entry of fs.readdirSync(packageSandboxDir)) {
      if (['target', 'sentinels', 'drops', 'canary-hits'].includes(entry)) continue;
      fs.cpSync(path.join(packageSandboxDir, entry), path.join(workingDir, entry), { recursive: true });
    }
    fs.writeFileSync(marker, new Date().toISOString());
  }
  for (const dir of ['target', 'sentinels', 'drops', 'canary-hits']) {
    fs.mkdirSync(path.join(workingDir, dir), { recursive: true });
  }
  return workingDir;
}

// The sandbox container mounts sandboxDir/target as its own working
// directory (see sandbox/compose.*.yml + Dockerfile's WORKDIR) -- `--cmd`
// is expected to run from inside it, so the server code it references
// has to actually be there. Copies the customer's own project directory
// in fresh before every scan (never trusts leftover state from a
// previous scan of a different server) and clears it after, same
// "run, then clean up" discipline as this tool's own fixture test
// scripts. Skips node_modules/.git -- irrelevant to what's being tested
// and often huge; the target container installs its own deps if the
// customer's --cmd needs that (e.g. `npm install && node server.js`).
const SKIP_ENTRIES = new Set(['node_modules', '.git']);

function packageProjectIntoSandbox(sourceDir: string, sandboxDir: string): void {
  const targetDir = path.join(sandboxDir, 'target');
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir)) {
    if (SKIP_ENTRIES.has(entry)) continue;
    fs.cpSync(path.join(sourceDir, entry), path.join(targetDir, entry), { recursive: true });
  }
}

export interface ScanArgs {
  cmd: string;
  env: Record<string, string>;
  apiKey?: string;
  // Defaults to the current working directory -- run `mcp-sec scan` from
  // inside your MCP server's own project, same as you'd run `npm start`.
  dir?: string;
}

export async function runScanCommand({ cmd, env, apiKey: apiKeyArg, dir }: ScanArgs): Promise<void> {
  const apiKey = apiKeyArg ?? process.env.MCP_SEC_API_KEY;
  if (!apiKey) {
    console.error('mcp-sec scan: no API key given -- pass --api-key or set MCP_SEC_API_KEY.');
    console.error('Live scanning is a paid feature (it runs real exploit payloads against your own server on your own machine); contact us for a key.');
    process.exitCode = EXIT_NO_API_KEY;
    return;
  }

  if (!dockerAvailable()) {
    console.error('mcp-sec scan: Docker is required (this command sandboxes your server in a container on this machine).');
    console.error('Install Docker Desktop (or another docker/docker-compose-compatible engine) and try again.');
    process.exitCode = EXIT_DOCKER_MISSING;
    return;
  }

  const sandboxDir = ensureWorkingSandboxDir();
  packageProjectIntoSandbox(dir ?? process.cwd(), sandboxDir);
  console.error(`mcp-sec scan: connecting to ${SCAN_URL} ...`);

  let resultExitCode = 1;
  await runWsRunner({
    url: SCAN_URL,
    sandboxDir,
    apiKey,
    cmd,
    env,
    onLog: (line) => console.error(`  ${line}`),
    onResult: (result) => {
      console.log(result.text);
      resultExitCode = result.exitCode;
    },
  });
  process.exitCode = resultExitCode;
}
