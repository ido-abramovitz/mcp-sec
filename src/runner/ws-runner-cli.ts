#!/usr/bin/env node
import path from 'node:path';
import { runWsRunner } from './ws-runner.js';

// Standalone entrypoint for `runWsRunner` -- what a customer actually
// launches (directly today for testing/M3 verification; via `mcp-sec
// scan`'s Docker preflight + spawn once that CLI command exists).

function parseArgs(argv: string[]): { url?: string; sandboxDir?: string; apiKey?: string } {
  const args: { url?: string; sandboxDir?: string; apiKey?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') args.url = argv[++i];
    else if (argv[i] === '--sandbox-dir') args.sandboxDir = path.resolve(argv[++i] ?? '');
    else if (argv[i] === '--api-key') args.apiKey = argv[++i];
  }
  return args;
}

const { url, sandboxDir, apiKey: apiKeyFlag } = parseArgs(process.argv.slice(2));
// --api-key falls back to MCP_SEC_API_KEY -- never require the key as a
// bare flag people habitually paste into shell history.
const apiKey = apiKeyFlag ?? process.env.MCP_SEC_API_KEY;
if (!url || !sandboxDir || !apiKey) {
  console.error('usage: ws-runner-cli --url <ws://...> --sandbox-dir <path> [--api-key <key>]');
  console.error('  --api-key falls back to the MCP_SEC_API_KEY environment variable.');
  process.exit(2);
}

runWsRunner({
  url,
  sandboxDir,
  apiKey,
  onLog: (line) => console.error(`[mcp-sec runner] ${line}`),
})
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[mcp-sec runner] fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
