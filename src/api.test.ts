import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRepository } from './api.ts';

test('submits only exact MCP coordinates to the bounded repository endpoint', async () => {
  const previousFetch = globalThis.fetch;
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({
      generatedAt:'2026-08-22T12:00:00.000Z',installations:[],
      summary:{vulnerable:0,verified_clean:0,pending_scan:0,scan_unavailable:0,untracked:0},
      crossMcp:{chains:[],missingCoordinates:[],disclaimer:'Potential only.'},
      bounded:{maximumInstallations:50,analyzedInstallations:0},
    }), {status:200,headers:{'content-type':'application/json'}});
  }) as typeof fetch;
  try {
    await checkRepository([{channel:'npm',identifier:'example-mcp',version:'1.2.3'}]);
    assert.match(requestUrl, /\/v1\/repository-risk$/);
    assert.equal(requestInit?.method, 'POST');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {installations:[{channel:'npm',identifier:'example-mcp',version:'1.2.3'}]});
  } finally {
    globalThis.fetch = previousFetch;
  }
});
