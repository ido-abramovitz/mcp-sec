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
