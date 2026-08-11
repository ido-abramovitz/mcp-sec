import type { Profile } from './types.js';

// Wire protocol between the backend (holds the actual check/verdict logic,
// never shipped here) and this runner (spins up the customer's own Docker
// sandbox, relays raw MCP traffic). Deliberately public/inspectable: a
// customer running the runner can see exactly what crosses the wire --
// session lifecycle, a tool name + arguments to call, and two oracle
// booleans. Never a payload-generation strategy, never a verdict rule.
// One JSON object per WebSocket frame, `id`-correlated request/reply
// (same idiom as mcp-client.ts's stdio framing, just resolved over
// already-framed WS messages instead of newline-delimited stdio).

export interface SessionStartCommand {
  kind: 'session.start';
  id: number;
  profile: Profile;
  cmd: string;
  env: Record<string, string>;
  callTimeoutMs: number;
  runTimeoutMs: number;
}

export interface RpcCommand {
  kind: 'rpc';
  id: number;
  sessionId: string;
  method: string;
  params: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface OracleDropHitCommand {
  kind: 'oracle.dropHit';
  id: number;
  sessionId: string;
  token: string;
}

export interface OracleListenerLogCommand {
  kind: 'oracle.listenerLog';
  id: number;
  sessionId: string;
  token: string;
}

export interface SessionStopCommand {
  kind: 'session.stop';
  id: number;
  sessionId: string;
}

export type RunnerCommand = SessionStartCommand | RpcCommand | OracleDropHitCommand | OracleListenerLogCommand | SessionStopCommand;

// Plain `Omit<RunnerCommand, 'id'>` collapses a union down to its shared
// properties instead of applying Omit to each member -- this distributes
// it instead, so callers building "everything except id" for whichever
// specific command they're sending still get full per-kind field
// checking. Exported so both the backend (which sends commands) and any
// other future caller share one correct definition instead of each
// re-deriving it slightly differently.
export type RunnerCommandInput = RunnerCommand extends infer C ? Omit<C, 'id'> : never;

export interface RunnerReply {
  kind: 'reply';
  id: number;
  ok: boolean;
  // session.start -> { sessionId }; rpc -> the raw MCP result; oracle.* ->
  // { hit: boolean }; session.stop -> {}.
  result?: unknown;
  error?: string;
}
