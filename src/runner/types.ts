// Local runner types -- deliberately self-contained. This package never
// imports from the private proof-engine repo; the backend (which does
// import proof-engine's checks/*) talks to a runner purely over the wire
// protocol, so the shapes below only need to match structurally, not be
// literally the same TypeScript type as the backend's own McpClient.

export type Profile = 'airgapped' | 'canary-net' | 'qdrant-net' | 'postgres-net' | 'sqlite-net' | 'mysql-net';

// Minimal stdio JSON-RPC client shape returned by mcp-client.ts's
// attachClient(). The RPC result itself is genuinely dynamic (whatever the
// external target server returns), left as unknown rather than modeled.
export interface McpClient {
  rpc: (method: string, params: Record<string, unknown>, meta?: Record<string, unknown>) => Promise<any>;
}
