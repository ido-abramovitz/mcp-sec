# mcp-sec

Stay safe as your locally-installed MCP servers keep changing.

Almost every MCP server is installed via `npx package@latest` -- meaning
the exact code running on your machine can silently change on every
restart, with no version pin and no review. A server that was safe last
week can be a different, unvetted build today. And unlike mainstream
package ecosystems, a newly-discovered MCP vulnerability can sit
unpatched and unnoticed for a long time before anyone reports it --
there's no established CVE pipeline watching this ecosystem yet.

`mcp-sec` is how you find out whether what's actually running right now
is safe, instead of trusting the version you installed once and forgot
about.

It doesn't pattern-match source code or ask an LLM's opinion, either --
every result comes from a canary-based proof method: a planted token
either demonstrably moves (proof of e.g. SSRF or command injection) or it
doesn't. No guessing, just a binary result.

This CLI is a thin client. All scanning happens once, centrally, against
our backend, which keeps re-checking every server's current version so a
silent update doesn't slip past unnoticed -- running this command asks
"is what's actually installed right now known safe?" rather than scanning
your machine itself.

## Install

```bash
npx mcp-sec-cli check <name>@<version>
```

No install needed for one-off use. For repeated use:

```bash
npm install -g mcp-sec-cli
```

## Usage

Check the exact MCP versions declared by one repository. This command reads
only repository-local `.mcp.json`, `.cursor/mcp.json`, or `.vscode/mcp.json`
configuration and resolves unpinned npm commands from that repository's
`package-lock.json`. It does not inspect other repositories or user-global MCP
configuration.

```bash
MCP_SEC_API_KEY=mcpsec_live_... npx mcp-sec-cli repo
```

The free check returns current exact-version runtime evidence, catalog links,
and potential cross-MCP capability paths for up to 50 MCP packages. It does not
upload source code, config contents, paths, environment variables, or secrets.
The API token is sent as a bearer credential and is never written into the
repository. It can also be provided once with `--api-key` for ephemeral use.
Use `--json` for machine-readable output and
`--fail-on=vulnerable,unknown` for a non-zero exit code.

```bash
mcp-sec check <name>@<version>
```

Run with no arguments from a project directory to scan every MCP server
found in local config files (Claude Desktop, Cursor, `.mcp.json`, etc.):

```bash
mcp-sec
```

## Claude Code plugin

Adds a `check_mcp_server_security` tool Claude can call directly --
useful the moment you're about to add a new MCP server, since Claude
can check it before it's ever installed instead of you running this
separately afterward.

```
/plugin marketplace add ido-abramovitz/mcp-sec
/plugin install mcp-sec@mcp-sec
```

## Live scanning

`check` only answers "is this exact, already-published version known
safe" -- it can never say anything about a server that isn't in our
catalog yet, including your own internal or unpublished ones. For that,
`scan` runs the real canary-based proof checks live, in a sandboxed
Docker container **on your own machine** -- your server's code and any
secrets never leave it. The proprietary payload/verdict logic stays on
our backend; your machine only relays sandboxed traffic to it.

```bash
mcp-sec scan --cmd "npx -y <package>@<version>" [--env KEY=VAL ...]
```

Requires Docker and a paid API key (`--api-key` or `MCP_SEC_API_KEY`) --
contact us for one. `check` will suggest `scan` automatically whenever a
server isn't in our catalog yet.

**Known limitation:** `--cmd` currently only auto-fetches packages
published to the public npm registry (a plain `npx [-y] <pkg>[@version]`
invocation). A server installed from a git tag, a private registry, or
already vendored locally needs its dependencies present in your own
environment before `scan` can reach it -- support for those is planned
but not yet built.

## License

Apache-2.0 -- see [LICENSE](./LICENSE).

## Development

```bash
npm install
npm run typecheck
npm run build
```
