import fs from 'node:fs';
import path from 'node:path';

export interface RepositoryInstallation {
  channel: 'npm' | 'pypi';
  identifier: string;
  version: string;
  configName: string;
  configPath: string;
}

export interface UnresolvedRepositoryServer {
  configName: string;
  configPath: string;
  reason: string;
}

export interface RepositoryInventory {
  root: string;
  installations: RepositoryInstallation[];
  unresolved: UnresolvedRepositoryServer[];
}

interface ServerConfig { command?: string; args?: string[] }
interface McpConfig { mcpServers?: Record<string, ServerConfig>; servers?: Record<string, ServerConfig> }

const CONFIG_PATHS = ['.mcp.json', path.join('.cursor', 'mcp.json'), path.join('.vscode', 'mcp.json')];
const EXACT_VERSION = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function readJson(file: string): unknown | null {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function parsePackageSpec(spec: string): { name: string; version: string | null } | null {
  const match = spec.match(/^(@[^/]+\/[^@]+|[^@]+)(?:@(.+))?$/);
  if (!match) return null;
  const version = match[2] && EXACT_VERSION.test(match[2]) ? match[2].replace(/^v/, '') : null;
  return { name: match[1]!, version };
}

function npmSpec(server: ServerConfig): { name: string; version: string | null } | null {
  if (!['npx', 'bunx'].includes(server.command ?? '')) return null;
  const args = server.args ?? [];
  const packageIndex = args.indexOf('--package');
  const candidate = packageIndex >= 0 ? args[packageIndex + 1] : args.filter((arg) => !arg.startsWith('-')).at(-1);
  return candidate ? parsePackageSpec(candidate) : null;
}

function pythonSpec(server: ServerConfig): { name: string; version: string | null } | null {
  if (!['uvx', 'pipx'].includes(server.command ?? '')) return null;
  const candidate = (server.args ?? []).find((arg) => !arg.startsWith('-'));
  if (!candidate) return null;
  const match = candidate.match(/^([A-Za-z0-9_.-]+)(?:==(.+))?$/);
  if (!match) return null;
  return { name: match[1]!, version: match[2] && EXACT_VERSION.test(match[2]) ? match[2] : null };
}

function npmLockedVersion(root: string, name: string): string | null {
  const lock = readJson(path.join(root, 'package-lock.json')) as Record<string, unknown> | null;
  if (lock) {
    const packages = lock.packages as Record<string, {version?: unknown}> | undefined;
    const fromPackages = packages?.[`node_modules/${name}`]?.version;
    if (typeof fromPackages === 'string' && fromPackages) return fromPackages;
    const dependencies = lock.dependencies as Record<string, {version?: unknown}> | undefined;
    const fromDependencies = dependencies?.[name]?.version;
    if (typeof fromDependencies === 'string' && fromDependencies) return fromDependencies;
  }
  const installed = readJson(path.join(root, 'node_modules', ...name.split('/'), 'package.json')) as {version?:unknown} | null;
  return typeof installed?.version === 'string' ? installed.version : null;
}

export function discoverRepositoryInventory(rootInput = process.cwd()): RepositoryInventory {
  const root = path.resolve(rootInput);
  const installations: RepositoryInstallation[] = [];
  const unresolved: UnresolvedRepositoryServer[] = [];
  const seen = new Set<string>();

  for (const relativeConfigPath of CONFIG_PATHS) {
    const configPath = path.join(root, relativeConfigPath);
    const config = readJson(configPath) as McpConfig | null;
    const servers = config?.mcpServers ?? config?.servers;
    if (!servers) continue;
    for (const [configName, server] of Object.entries(servers)) {
      const npm = npmSpec(server);
      const python = pythonSpec(server);
      const channel = python ? 'pypi' : 'npm';
      const parsed = python ?? npm;
      if (!parsed) {
        unresolved.push({configName, configPath:relativeConfigPath, reason:'could not identify a supported npm or PyPI package'});
        continue;
      }
      const version = parsed.version ?? (channel === 'npm' ? npmLockedVersion(root, parsed.name) : null);
      if (!version) {
        unresolved.push({configName, configPath:relativeConfigPath, reason:`${parsed.name} is not pinned to an exact version and no repository lockfile resolved it`});
        continue;
      }
      const coordinate = `${channel}\u0000${parsed.name}\u0000${version}`;
      if (seen.has(coordinate)) continue;
      seen.add(coordinate);
      installations.push({channel, identifier:parsed.name, version, configName, configPath:relativeConfigPath});
    }
  }

  installations.sort((a, b) => a.identifier.localeCompare(b.identifier));
  return {root, installations, unresolved};
}
