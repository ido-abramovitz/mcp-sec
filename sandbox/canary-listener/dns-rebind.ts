#!/usr/bin/env node
'use strict';

/**
 * DNS-rebinding test oracle: a minimal DNS server, NOT a real recursive
 * resolver. For one specific hostname (REBIND_HOSTNAME), it answers the
 * FIRST query with a normal-looking PUBLIC IP (SAFE_IP -- passes any
 * "is this a private/blocked address" pre-check), and every subsequent
 * query for the same name with our REAL internal address (REBIND_IP,
 * canary-listener's own address) -- modeling the worst case for a
 * target: validate a hostname once via one resolve, then genuinely
 * reconnect/re-resolve for the real request and land somewhere
 * different. Any other query (postgres, canary-listener, anything the
 * target legitimately needs) is forwarded byte-for-byte to Docker's own
 * embedded resolver (127.0.0.11:53) and relayed back -- we only need to
 * fake the ONE hostname this test cares about, not be a real resolver.
 *
 * Used by checks/ssrf.ts's 'dns-rebind' variant together with
 * compose.postgres-net.yml's target service pointing its DNS at this
 * container (`dns: [100.64.55.10]`) instead of Docker's default.
 */

import dgram from 'node:dgram';

const PORT = 53;
const REBIND_HOSTNAME = 'rebind-canary.test';
const SAFE_IP = '93.184.216.34'; // a normal-looking public IP (formerly example.com) -- not reachable, not our concern; only needs to structurally pass an "is this private/blocked" check
const REBIND_IP = process.env.CGNAT_LISTENER_IP || '100.64.55.10'; // canary-listener's own real, reachable address (per-job when set, see sandbox-runner.ts's deriveCgnatAddressing)
const DOCKER_DNS = '127.0.0.11';

const queryCountByName = new Map<string, number>();

function parseQuestionName(buf: Buffer, offset: number): { name: string; end: number } {
  const labels: string[] = [];
  let pos = offset;
  while (true) {
    const len = buf[pos];
    if (len === 0) {
      pos += 1;
      break;
    }
    labels.push(buf.toString('ascii', pos + 1, pos + 1 + len));
    pos += 1 + len;
  }
  return { name: labels.join('.'), end: pos };
}

function parseQuestionType(buf: Buffer, questionEnd: number): number {
  return buf.readUInt16BE(questionEnd);
}

// NOERROR, zero answers -- a valid, harmless response for query types we
// don't fake (AAAA, etc.) on our rebind hostname. Necessary because a
// single `getent hosts`-style lookup issues BOTH an A and an AAAA query;
// without this, the AAAA query would also consume a "hit" against the
// same counter used for the A query, corrupting the safe-then-rebind
// sequence before the A answer we actually care about ever arrives.
function buildEmptyResponse(query: Buffer): Buffer {
  const id = query.readUInt16BE(0);
  const { end: questionEnd } = parseQuestionName(query, 12);
  const questionSection = query.subarray(12, questionEnd + 4);

  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x8180, 2);
  header.writeUInt16BE(1, 4); // QDCOUNT
  header.writeUInt16BE(0, 6); // ANCOUNT = 0
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);

  return Buffer.concat([header, questionSection]);
}

function buildAResponse(query: Buffer, ip: string): Buffer {
  const id = query.readUInt16BE(0);
  const { end: questionEnd } = parseQuestionName(query, 12);
  const qtypeQclassLen = 4;
  const questionSection = query.subarray(12, questionEnd + qtypeQclassLen);

  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x8180, 2); // QR=1, opcode=0, AA=0, TC=0, RD=1, RA=1, RCODE=0
  header.writeUInt16BE(1, 4); // QDCOUNT
  header.writeUInt16BE(1, 6); // ANCOUNT
  header.writeUInt16BE(0, 8); // NSCOUNT
  header.writeUInt16BE(0, 10); // ARCOUNT

  const answer = Buffer.alloc(16);
  answer.writeUInt16BE(0xc00c, 0); // NAME: pointer to offset 12 (the question's qname)
  answer.writeUInt16BE(1, 2); // TYPE = A
  answer.writeUInt16BE(1, 4); // CLASS = IN
  answer.writeUInt32BE(1, 6); // TTL = 1s -- deliberately short, matching the real-world rebinding precondition
  answer.writeUInt16BE(4, 10); // RDLENGTH
  const ipParts = ip.split('.').map(Number);
  answer[12] = ipParts[0];
  answer[13] = ipParts[1];
  answer[14] = ipParts[2];
  answer[15] = ipParts[3];

  return Buffer.concat([header, questionSection, answer]);
}

const socket = dgram.createSocket('udp4');
const forwardSocket = dgram.createSocket('udp4');

const pendingForwards = new Map<number, { clientAddr: string; clientPort: number }>();

forwardSocket.on('message', (msg: Buffer) => {
  const id = msg.readUInt16BE(0);
  const client = pendingForwards.get(id);
  if (!client) return;
  pendingForwards.delete(id);
  socket.send(msg, client.clientPort, client.clientAddr);
});

const TYPE_A = 1;

socket.on('message', (msg: Buffer, rinfo: { address: string; port: number }) => {
  let qname = '';
  let questionEnd = 0;
  try {
    const parsed = parseQuestionName(msg, 12);
    qname = parsed.name.toLowerCase();
    questionEnd = parsed.end;
  } catch {
    return; // malformed query -- drop, a real resolver would too under load
  }

  if (qname === REBIND_HOSTNAME) {
    if (parseQuestionType(msg, questionEnd) !== TYPE_A) {
      socket.send(buildEmptyResponse(msg), rinfo.port, rinfo.address);
      return;
    }
    const count = (queryCountByName.get(qname) || 0) + 1;
    queryCountByName.set(qname, count);
    const ip = count === 1 ? SAFE_IP : REBIND_IP;
    socket.send(buildAResponse(msg, ip), rinfo.port, rinfo.address);
    return;
  }

  // Passthrough: forward to Docker's real embedded resolver and relay
  // the reply back once it arrives.
  const id = msg.readUInt16BE(0);
  pendingForwards.set(id, { clientAddr: rinfo.address, clientPort: rinfo.port });
  forwardSocket.send(msg, 53, DOCKER_DNS);
});

function startDnsRebindServer() {
  socket.bind(PORT, () => {
    process.stderr.write(`dns-rebind server up on :${PORT} (rebind hostname: ${REBIND_HOSTNAME})\n`);
  });
}

export { startDnsRebindServer };
