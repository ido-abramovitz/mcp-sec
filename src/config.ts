import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Locates and parses the standard MCP config shape --
// { "mcpServers": { "<name>": { "command": "...", "args": [...] } } } --
// used by Claude Desktop, Cursor, and most other MCP hosts. Deliberately
// best-effort: if a server's launch command doesn't match a package spec
// we can confidently parse, we skip it and say so rather than guessing --
// same discipline the rest of this project holds itself to.

export interface DiscoveredServer {
  configName: string; // the key under mcpServers, e.g. "postgres"
  packageName: string | null;
  version: string | null;
  skippedReason?: string;
}

interface McpConfig {
  mcpServers?: Record<string, { command?: string; args?: string[] }>;
}

function candidateConfigPaths(): string[] {
  const home = os.homedir();
  const paths: string[] = [];

  if (process.platform === 'darwin') {
    paths.push(path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  } else if (process.platform === 'win32' && process.env.APPDATA) {
    paths.push(path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json'));
  } else {
    paths.push(path.join(home, '.config', 'Claude', 'claude_desktop_config.json'));
  }

  paths.push(path.join(home, '.cursor', 'mcp.json'));
  paths.push(path.join(process.cwd(), '.cursor', 'mcp.json'));
  paths.push(path.join(process.cwd(), '.mcp.json'));

  return paths;
}

function loadConfig(configPath: string): McpConfig | null {
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null; // malformed config -- skip rather than crash
  }
}

// Extracts "name" and "version" from a package spec string, e.g.
// "@scope/pkg@1.2.3" -> { name: "@scope/pkg", version: "1.2.3" }
// "chrome-devtools-mcp" -> { name: "chrome-devtools-mcp", version: null }
// A literal "@latest" is treated as unpinned (version: null), not a real
// pinned version.
function parsePackageSpec(spec: string): { name: string; version: string | null } | null {
  const m = spec.match(/^(@[^/]+\/[^@]+|[^@]+)(?:@(.+))?$/);
  if (!m) return null;
  const name = m[1];
  const version = m[2] && m[2] !== 'latest' ? m[2] : null;
  return { name, version };
}

function extractPackageSpec(args: string[]): string | null {
  const packageFlagIdx = args.indexOf('--package');
  if (packageFlagIdx !== -1 && args[packageFlagIdx + 1]) {
    return args[packageFlagIdx + 1];
  }
  // The LAST non-flag token, not the first -- confirmed necessary against
  // a real catalog pattern: "npx add-mcp next-devtools-mcp@2.0.0" uses a
  // wrapper installer CLI (add-mcp) as the first argument, with the real
  // package as the final one. Taking the first non-flag token would
  // silently check "add-mcp" instead of the real package.
  const nonFlags = args.filter((a) => !a.startsWith('-'));
  return nonFlags.length > 0 ? nonFlags[nonFlags.length - 1] : null;
}

export function discoverConfiguredServers(): DiscoveredServer[] {
  const found: DiscoveredServer[] = [];
  const seen = new Set<string>();

  for (const configPath of candidateConfigPaths()) {
    const config = loadConfig(configPath);
    if (!config?.mcpServers) continue;

    for (const [configName, server] of Object.entries(config.mcpServers)) {
      if (seen.has(configName)) continue; // same server declared in multiple config files
      seen.add(configName);

      const args = server.args ?? [];
      const spec = extractPackageSpec(args);
      if (!spec) {
        found.push({ configName, packageName: null, version: null, skippedReason: `couldn't identify a package name in its launch command (${server.command} ${args.join(' ')})` });
        continue;
      }
      const parsed = parsePackageSpec(spec);
      if (!parsed) {
        found.push({ configName, packageName: null, version: null, skippedReason: `couldn't parse package spec "${spec}"` });
        continue;
      }
      found.push({ configName, packageName: parsed.name, version: parsed.version });
    }
  }

  return found;
}
