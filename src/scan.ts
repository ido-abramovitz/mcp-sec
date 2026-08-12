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

export interface ScanArgs {
  cmd: string;
  env: Record<string, string>;
  apiKey?: string;
}

export async function runScanCommand({ cmd, env, apiKey: apiKeyArg }: ScanArgs): Promise<void> {
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
