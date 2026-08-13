---
name: check-new-mcp-servers
description: Check an MCP server's real safety before adding it to a project. Use whenever the user asks to add, install, or configure a new MCP server (in .mcp.json, Claude Desktop config, Cursor, or similar), or asks whether an MCP server is safe.
---

Before adding a new MCP server to a project's configuration, call the
`check_mcp_server_security` tool with the package name (and version, if
known) to see whether it's proven safe or proven vulnerable.

This is a real canary-based proof result, not a guess -- a planted
token either demonstrably moved during a live proof scan or it didn't.
A result of `unknown` means the package hasn't been proven either way
yet, not that it's safe -- say so plainly rather than treating unknown
as clean.

If the check comes back `vulnerable`, tell the user clearly before
proceeding, and mention the proof summary (how many checks were proven
against it). If `clean`, proceed normally. If `unknown`, say the server
hasn't been verified yet and let the user decide whether to proceed.
