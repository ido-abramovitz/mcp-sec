#!/usr/bin/env node
'use strict';

/**
 * The canary-net oracle: a tiny HTTP server that logs every inbound
 * request, verbatim, to a file the HOST can read (mounted outside the
 * container). This is OUR OWN trusted code -- it doesn't need the
 * target's lockdown, it needs to reliably observe.
 *
 * Any request path is logged as-is; checks embed their canary token in
 * the path (e.g. GET /<canary>), and Red Engine's ctx.listenerLog()
 * greps this file for that exact token -- same "call-scoped, exact-token
 * match" invariant as every other check, just with a network request as
 * the observed artifact instead of a file or an echoed string.
 */

import http from 'node:http';
import fs from 'node:fs';
import { startDnsRebindServer } from './dns-rebind.ts';

const PORT = 8080;
const LOG_PATH = '/var/log/canary-hits/hits.log';

// Redirect-based SSRF bypass variant (see checks/ssrf.ts's
// 'redirect-to-cgnat' variant): a request to /redirect-to-cgnat/<token>
// gets a 302 to the CGNAT-range address instead of a logged hit --
// testing whether the TARGET's SSRF guard re-validates a redirect's
// destination, or only checked the original (here, harmless-looking)
// URL before following it. Every other path keeps the original
// behavior unchanged.
const CGNAT_REDIRECT_PREFIX = '/redirect-to-cgnat/';
const LISTENER_IP = process.env.CGNAT_LISTENER_IP || '100.64.55.10';

const server = http.createServer((req: any, res: any) => {
  if (req.url && req.url.startsWith(CGNAT_REDIRECT_PREFIX)) {
    const token = req.url.slice(CGNAT_REDIRECT_PREFIX.length);
    res.writeHead(302, { Location: `http://${LISTENER_IP}:8080/${token}` });
    res.end();
    return;
  }
  const entry = {
    ts: new Date().toISOString(),
    method: req.method,
    url: req.url,
    remoteAddress: req.socket.remoteAddress,
  };
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});

server.listen(PORT, () => {
  process.stderr.write(`canary-listener up on :${PORT}, logging to ${LOG_PATH}\n`);
});

startDnsRebindServer();
