# mcp-sec

Canary-proof security checks for MCP (Model Context Protocol) servers.

Most MCP scanners work by pattern-matching source code or LLM-judging tool
descriptions. `mcp-sec` doesn't guess -- it verifies actual, observed
behavior against a real, running instance of the server, using a
canary-based proof method: a planted token either demonstrably moves
(proof of e.g. SSRF or command injection) or it doesn't. No pattern match,
no LLM opinion, just a binary result.

This CLI is a thin client. All scanning happens once, centrally, against
our backend -- running this command asks "is this MCP server known safe?"
rather than scanning your machine.

**Status: early scaffold, not yet published or functional.** See the
milestone list below.

## Install

Not yet published to npm.

## Usage

```bash
npx mcp-sec check <name>@<version>
```

(Not yet implemented -- this is a build-in-progress scaffold.)

## License

Apache-2.0 -- see [LICENSE](./LICENSE).

## Development

```bash
npm install
npm run typecheck
npm run build
```
