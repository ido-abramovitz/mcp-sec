#!/usr/bin/env node
import path from 'node:path';
import { runWsRunner } from './ws-runner.js';

// Standalone entrypoint for `runWsRunner` -- what a customer actually
// launches (directly today for testing/M3 verification; via `mcp-sec
// scan`'s Docker preflight + spawn once that CLI command exists).

function parseArgs(argv: string[]): { url?: string; sandboxDir?: string } {
  const args: { url?: string; sandboxDir?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') args.url = argv[++i];
    else if (argv[i] === '--sandbox-dir') args.sandboxDir = path.resolve(argv[++i] ?? '');
  }
  return args;
}

const { url, sandboxDir } = parseArgs(process.argv.slice(2));
if (!url || !sandboxDir) {
  console.error('usage: ws-runner-cli --url <ws://...> --sandbox-dir <path>');
  process.exit(2);
}

runWsRunner({
  url,
  sandboxDir,
  onLog: (line) => console.error(`[mcp-sec runner] ${line}`),
})
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[mcp-sec runner] fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
