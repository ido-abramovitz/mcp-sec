#!/usr/bin/env node

import { checkPackage, checkRepository, type CheckResult, type RepositoryRiskResult } from './api.js';
import { discoverConfiguredServers } from './config.js';
import { discoverRepositoryInventory } from './repository.js';
import { runScanCommand } from './scan.js';

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
  if (result.status === 'unknown') {
    console.log(`  Not in our catalog yet -- run \`mcp-sec scan\` to test it live on your own machine.`);
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

function repositoryStatusLabel(status: RepositoryRiskResult['installations'][number]['status']): string {
  return ({
    vulnerable:'\x1b[31mVULNERABLE\x1b[0m',
    verified_clean:'\x1b[32mVERIFIED CLEAN\x1b[0m',
    pending_scan:'\x1b[33mPENDING SCAN\x1b[0m',
    scan_unavailable:'\x1b[33mSCAN UNAVAILABLE\x1b[0m',
    untracked:'\x1b[33mUNTRACKED\x1b[0m',
  })[status];
}

function repositoryExitCode(result: RepositoryRiskResult, failOn: string | null): number {
  if (!failOn) return 0;
  const selected = new Set(failOn.split(',').map((value)=>value.trim()));
  return result.installations.some((item)=>selected.has(item.status) || (selected.has('unknown') && !['vulnerable','verified_clean'].includes(item.status))) ? 1 : 0;
}

async function runRepositoryCheck(argv: string[], failOn: string | null): Promise<void> {
  let directory = process.cwd();
  let json = false;
  for (let index=0;index<argv.length;index++) {
    if (argv[index] === '--dir' && argv[index + 1]) directory = argv[++index]!;
    else if (argv[index] === '--json') json = true;
  }
  const inventory = discoverRepositoryInventory(directory);
  if (!inventory.installations.length) {
    if (json) console.log(JSON.stringify(inventory, null, 2));
    else {
      console.log('No exact-version MCP packages found in this repository.');
      for (const item of inventory.unresolved) console.log(`? ${item.configName} (${item.configPath}) -- ${item.reason}`);
    }
    process.exitCode = inventory.unresolved.length && failOn?.split(',').includes('unknown') ? 1 : 0;
    return;
  }
  const result = await checkRepository(inventory.installations.map(({channel,identifier,version})=>({channel,identifier,version})));
  if (json) {
    console.log(JSON.stringify({repository:inventory.root,unresolved:inventory.unresolved,...result}, null, 2));
  } else {
    console.log(`Repository MCP risk: ${inventory.root}\n`);
    for (const item of result.installations) {
      console.log(`${repositoryStatusLabel(item.status)}  ${item.identifier}@${item.version}`);
      if (item.provenFindings) console.log(`  ${item.provenFindings} proven runtime finding(s)`);
      if (item.confirmedVulnerabilities) console.log(`  ${item.confirmedVulnerabilities} confirmed vulnerability record(s)`);
      if (item.catalogUrl) console.log(`  ${item.catalogUrl}`);
    }
    for (const item of inventory.unresolved) console.log(`\n? ${item.configName} (${item.configPath}) -- ${item.reason}`);
    if (result.crossMcp.chains.length) {
      console.log(`\nPotential cross-MCP paths (${result.crossMcp.chains.length}):`);
      for (const chain of result.crossMcp.chains) {
        console.log(`! ${chain.severity.toUpperCase()} ${chain.title}`);
        console.log(`  ${chain.source.component.identifier}@${chain.source.component.version}:${chain.source.tool.name} -> ${chain.sink.component.identifier}@${chain.sink.component.version}:${chain.sink.tool.name}`);
        console.log(`  Required condition: ${chain.precondition}`);
      }
      console.log(`  ${result.crossMcp.disclaimer}`);
    }
    console.log(`\n${result.summary.vulnerable} vulnerable, ${result.summary.verified_clean} verified clean, ${result.summary.pending_scan + result.summary.scan_unavailable + result.summary.untracked + inventory.unresolved.length} unknown.`);
  }
  process.exitCode = repositoryExitCode(result, failOn);
  if (!process.exitCode && inventory.unresolved.length && failOn?.split(',').includes('unknown')) process.exitCode = 1;
}

function parseScanArgs(argv: string[]): { cmd?: string; env: Record<string, string>; apiKey?: string; dir?: string } {
  const args: { cmd?: string; env: Record<string, string>; apiKey?: string; dir?: string } = { env: {} };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cmd') args.cmd = argv[++i];
    else if (argv[i] === '--env') {
      const raw = argv[++i] ?? '';
      const eq = raw.indexOf('=');
      if (eq > 0) args.env[raw.slice(0, eq)] = raw.slice(eq + 1);
    } else if (argv[i] === '--api-key') args.apiKey = argv[++i];
    else if (argv[i] === '--dir') args.dir = argv[++i];
  }
  return args;
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const { positional, failOn } = parseArgs(rawArgs);

  try {
    if (positional[0] === 'check' && positional[1]) {
      await runSingleCheck(positional[1], failOn);
    } else if (positional[0] === 'repo') {
      await runRepositoryCheck(rawArgs.slice(1), failOn);
    } else if (positional[0] === 'scan') {
      const scanArgs = parseScanArgs(rawArgs.slice(1));
      if (!scanArgs.cmd) {
        console.error('Usage: mcp-sec scan --cmd "<server command>" [--env KEY=VAL ...] [--api-key <key>]');
        process.exitCode = 2;
        return;
      }
      await runScanCommand({ cmd: scanArgs.cmd, env: scanArgs.env, apiKey: scanArgs.apiKey, dir: scanArgs.dir });
    } else if (positional.length === 0) {
      await runProjectScan(failOn);
    } else {
      console.error(
        'Usage:\n  mcp-sec repo [--dir <path>] [--json] [--fail-on=vulnerable,unknown]\n  mcp-sec check <name>[@<version>]\n  mcp-sec  (checks your configured MCP servers)\n  mcp-sec scan --cmd "<server command>" [--env KEY=VAL ...] [--api-key <key>]  (live sandboxed scan, paid)'
      );
      process.exitCode = 2;
    }
  } catch (err) {
    console.error(`mcp-sec: ${(err as Error).message}`);
    process.exitCode = 2;
  }
}

main();
