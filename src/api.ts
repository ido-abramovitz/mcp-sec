// Talks to the mcp-sec backend -- the only place any real proof result
// lives. This file has no scanning logic in it at all; it's the entire
// surface area where this package touches the network.

const API_BASE = process.env.MCP_SEC_API_URL || 'https://api.mcpsecurity.cloud';

export interface CheckResult {
  name: string;
  requestedVersion: string | null;
  knownVersion: string | null;
  versionMatch: boolean | null;
  status: 'clean' | 'vulnerable' | 'unknown';
  lastVerified: string | null;
  summary?: { proven: number; clean: number; error: number };
  message?: string;
}

export async function checkPackage(name: string, version: string | null): Promise<CheckResult> {
  const url = new URL('/v1/check', API_BASE);
  url.searchParams.set('name', name);
  if (version) url.searchParams.set('version', version);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API request failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as CheckResult;
}
