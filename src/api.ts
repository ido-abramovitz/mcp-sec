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

export interface RepositoryRiskInstallation {
  channel: string;
  identifier: string;
  version: string;
  status: 'vulnerable' | 'verified_clean' | 'pending_scan' | 'scan_unavailable' | 'untracked';
  provenFindings: number;
  confirmedVulnerabilities: number;
  scanFinishedAt: string | null;
  catalogUrl: string | null;
}

export interface RepositoryRiskResult {
  generatedAt: string;
  installations: RepositoryRiskInstallation[];
  summary: Record<RepositoryRiskInstallation['status'], number>;
  crossMcp: {
    chains: Array<{
      title: string;
      severity: 'critical' | 'high';
      source: {component:{name:string;identifier:string;version:string};tool:{name:string}};
      sink: {component:{name:string;identifier:string;version:string};tool:{name:string}};
      explanation: string;
      precondition: string;
    }>;
    missingCoordinates: Array<{channel:string;identifier:string;version:string}>;
    disclaimer: string;
  };
  bounded: {maximumInstallations:number;analyzedInstallations:number};
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

export async function checkRepository(
  installations: Array<{channel:string;identifier:string;version:string}>,
  apiKey = process.env.MCP_SEC_API_KEY,
): Promise<RepositoryRiskResult> {
  if (!apiKey) throw new Error('MCP_SEC_API_KEY is required. Set it in the environment or pass --api-key.');
  const url = new URL('/v1/repository-risk', API_BASE);
  const res = await fetch(url, {
    method: 'POST',
    headers: {'content-type':'application/json','authorization':`Bearer ${apiKey}`},
    body: JSON.stringify({installations}),
  });
  if (!res.ok) throw new Error(`API request failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as RepositoryRiskResult;
}
