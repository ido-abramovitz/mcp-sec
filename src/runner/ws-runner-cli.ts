#!/usr/bin/env node
import path from 'node:path';
import { runWsRunner } from './ws-runner.js';

// Standalone entrypoint for `runWsRunner` -- what a customer actually
// launches (via `mcp-sec scan`'s Docker preflight + spawn).

function parseArgs(argv: string[]): { url?: string; sandboxDir?: string; apiKey?: string; cmd?: string; env: Record<string, string> } {
  const args: { url?: string; sandboxDir?: string; apiKey?: string; cmd?: string; env: Record<string, string> } = { env: {} };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') args.url = argv[++i];
    else if (argv[i] === '--sandbox-dir') args.sandboxDir = path.resolve(argv[++i] ?? '');
    else if (argv[i] === '--api-key') args.apiKey = argv[++i];
    else if (argv[i] === '--cmd') args.cmd = argv[++i];
    else if (argv[i] === '--env') {
      const raw = argv[++i] ?? '';
      const eq = raw.indexOf('=');
      if (eq > 0) args.env[raw.slice(0, eq)] = raw.slice(eq + 1);
    }
  }
  return args;
}

const { url, sandboxDir, apiKey: apiKeyFlag, cmd, env } = parseArgs(process.argv.slice(2));
// --api-key falls back to MCP_SEC_API_KEY -- never require the key as a
// bare flag people habitually paste into shell history.
const apiKey = apiKeyFlag ?? process.env.MCP_SEC_API_KEY;
if (!url || !sandboxDir || !apiKey || !cmd) {
  console.error('usage: ws-runner-cli --url <ws://...> --sandbox-dir <path> --cmd "<server command>" [--env KEY=VAL ...] [--api-key <key>]');
  console.error('  --api-key falls back to the MCP_SEC_API_KEY environment variable.');
  process.exit(2);
}

let resultExitCode = 1;

runWsRunner({
  url,
  sandboxDir,
  apiKey,
  cmd,
  env,
  onLog: (line) => console.error(`[mcp-sec runner] ${line}`),
  onResult: (result) => {
    console.log(result.text);
    resultExitCode = result.exitCode;
  },
})
  .then(() => process.exit(resultExitCode))
  .catch((err) => {
    console.error(`[mcp-sec runner] fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
