#!/usr/bin/env node

import { checkPackage, type CheckResult } from './api.js';
import { discoverConfiguredServers } from './config.js';

const SYMBOLS: Record<CheckResult['status'], string> = {
  clean: '\x1b[32m✔\x1b[0m',
  vulnerable: '\x1b[31m✖\x1b[0m',
  unknown: '\x1b[33m?\x1b[0m',
};

function printResult(label: string, result: CheckResult): void {
  const versionLabel = result.requestedVersion ? `${label}@${result.requestedVersion}` : label;
  console.log(`${SYMBOLS[result.status]} ${versionLabel}`);
  if (result.status === 'clean' && result.summary) {
    console.log(`  Proven clean -- ${result.summary.clean}/${result.summary.clean + result.summary.proven + result.summary.error} checks, last verified ${result.lastVerified}`);
  } else if (result.status === 'vulnerable' && result.summary) {
    console.log(`  PROVEN VULNERABLE -- ${result.summary.proven} confirmed finding(s), last verified ${result.lastVerified}`);
  } else if (result.status === 'unknown') {
    console.log(`  ${result.message ?? 'Not yet known.'}`);
  }
  if (result.message && result.status !== 'unknown') {
    console.log(`  ${result.message}`);
  }
}

function parseArgs(argv: string[]): { positional: string[]; failOn: string | null } {
  const positional: string[] = [];
  let failOn: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith('--fail-on=')) {
      failOn = arg.slice('--fail-on='.length);
    } else {
      positional.push(arg);
    }
  }
  return { positional, failOn };
}

function exitCodeFor(results: CheckResult[], failOn: string | null): number {
  if (!failOn) return 0;
  const targets = failOn.split(',').map((s) => s.trim());
  return results.some((r) => targets.includes(r.status)) ? 1 : 0;
}

async function runSingleCheck(spec: string, failOn: string | null): Promise<void> {
  const at = spec.lastIndexOf('@');
  // Handle scoped packages (@scope/name@version) -- only split on an '@'
  // that isn't the leading scope character.
  const name = at > 0 ? spec.slice(0, at) : spec;
  const version = at > 0 ? spec.slice(at + 1) : null;

  const result = await checkPackage(name, version);
  printResult(name, result);
  process.exitCode = exitCodeFor([result], failOn);
}

async function runProjectScan(failOn: string | null): Promise<void> {
  const servers = discoverConfiguredServers();
  if (servers.length === 0) {
    console.log('No MCP servers found in Claude Desktop, Cursor, or a local .mcp.json config.');
    return;
  }

  console.log(`Checking ${servers.length} configured MCP server(s)...\n`);
  const results: CheckResult[] = [];
  for (const server of servers) {
    if (!server.packageName) {
      console.log(`? ${server.configName} -- skipped (${server.skippedReason})`);
      continue;
    }
    const result = await checkPackage(server.packageName, server.version);
    printResult(server.packageName, result);
    results.push(result);
  }

  const vulnerable = results.filter((r) => r.status === 'vulnerable').length;
  const unknown = results.filter((r) => r.status === 'unknown').length;
  const clean = results.length - vulnerable - unknown;
  console.log(`\n${vulnerable} vulnerable, ${unknown} unknown, ${clean} clean.`);
  process.exitCode = exitCodeFor(results, failOn);
}

async function main(): Promise<void> {
  const { positional, failOn } = parseArgs(process.argv.slice(2));

  try {
    if (positional[0] === 'check' && positional[1]) {
      await runSingleCheck(positional[1], failOn);
    } else if (positional.length === 0) {
      await runProjectScan(failOn);
    } else {
      console.error('Usage:\n  mcp-sec check <name>[@<version>]\n  mcp-sec  (scans your configured MCP servers)');
      process.exitCode = 2;
    }
  } catch (err) {
    console.error(`mcp-sec: ${(err as Error).message}`);
    process.exitCode = 2;
  }
}

main();
