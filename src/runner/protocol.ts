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

// Sent once, before the first session.start of a scan -- asks the runner
// to fetch/cache whatever `cmd` needs (currently: npx-style installs only,
// see sandbox-runner.ts's extractNpxPackageSpec) under the one profile
// with real network access, so every later session.start's network-
// isolated profile can resolve it locally with no network call. A cmd
// that isn't an npx invocation has nothing to fetch -- the runner replies
// ok with installed:false rather than treating that as an error.
export interface InstallCommand {
  kind: 'install';
  id: number;
  cmd: string;
  env: Record<string, string>;
}

// Backend asks the runner what to actually scan -- the runner (the
// customer's own machine) is the one that knows how to launch their MCP
// server; the backend never guesses or is told out-of-band. Reuses the
// same request/reply idiom as every other command instead of a separate
// unsolicited-announcement channel.
export interface ScanInfoCommand {
  kind: 'scan.info';
  id: number;
}

// Backend delivers the finished verdict to the runner for local display
// -- the one message in this protocol that carries an actual result
// (proven/clean/etc per candidate), never a payload or a rule, just the
// same coverage/findings shape red-engine.ts's own report.ts already
// renders locally.
export interface ScanReportCommand {
  kind: 'scan.report';
  id: number;
  exitCode: number;
  text: string;
}

export type RunnerCommand = SessionStartCommand | RpcCommand | OracleDropHitCommand | OracleListenerLogCommand | SessionStopCommand | ScanInfoCommand | ScanReportCommand | InstallCommand;

// Plain `Omit<RunnerCommand, 'id'>` collapses a union down to its shared
// properties instead of applying Omit to each member -- distribution only
// happens when the checked type is a naked generic parameter of the
// conditional type itself (not a concrete alias referenced from inside
// one), so this needs its own generic helper rather than inlining
// `RunnerCommand extends infer C ? ... : never` directly. Exported so both
// the backend (which sends commands) and any other future caller share
// one correct definition instead of each re-deriving it slightly
// differently.
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
export type RunnerCommandInput = DistributiveOmit<RunnerCommand, 'id'>;

export interface RunnerReply {
  kind: 'reply';
  id: number;
  ok: boolean;
  // session.start -> { sessionId }; rpc -> the raw MCP result; oracle.* ->
  // { hit: boolean }; session.stop -> {}.
  result?: unknown;
  error?: string;
}
