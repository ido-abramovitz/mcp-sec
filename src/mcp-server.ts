#!/usr/bin/env node
// Exposes checkPackage() (api.ts) as a real MCP tool, so Claude Code /
// Cursor / any MCP client can call it directly -- e.g. the moment a user
// is about to add a new MCP server to their config, an agent can check
// it first instead of the human needing to separately discover and run
// this CLI. Deliberately thin: same free /v1/check lookup the `check`
// command already uses, no new backend logic, no paid `scan` here.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { checkPackage } from './api.js';

const server = new McpServer({ name: 'mcp-sec', version: '0.0.1' });

server.registerTool(
  'check_mcp_server_security',
  {
    title: 'Check MCP server security',
    description:
      "Checks whether a named MCP server package (and optionally an exact version) is known-safe or known-vulnerable, per mcpsecurity.cloud's canary-proof catalog -- a planted token either demonstrably moved or it didn't, never a guess. Call this BEFORE recommending or adding a new MCP server to a project's config. A package not in the catalog returns status 'unknown', not 'clean' -- that is not the same as safe.",
    inputSchema: {
      name: z.string().describe('The npm package name of the MCP server, e.g. "@cyanheads/git-mcp-server"'),
      version: z.string().optional().describe('The exact version being installed, e.g. "2.1.4". Omit to check the latest known version.'),
    },
  },
  async ({ name, version }) => {
    try {
      const result = await checkPackage(name, version ?? null);
      const lines = [
        `${name}${result.requestedVersion ? `@${result.requestedVersion}` : ''}: ${result.status.toUpperCase()}`,
        result.knownVersion ? `Known version: ${result.knownVersion} (versionMatch: ${result.versionMatch})` : null,
        result.summary ? `Proof summary: ${result.summary.proven} proven, ${result.summary.clean} clean, ${result.summary.error} error` : null,
        result.lastVerified ? `Last verified: ${result.lastVerified}` : null,
        result.message ?? null,
      ].filter((l): l is string => l !== null);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `mcp-sec check failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
