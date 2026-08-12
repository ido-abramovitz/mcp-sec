// canary-net profile: the base allowlist PLUS the syscalls needed to make
// a real outbound network connection. Unlike the airgapped profile, this
// one's isolation guarantee is enforced at the NETWORK/NAMESPACE layer
// only (an internal-only Docker network with no route to the real
// internet, see compose.canary-net.yml) rather than two independent
// layers -- the target genuinely needs socket/connect here to reach the
// canary listener, so the syscall layer can't also block it. That's a
// real, honest tradeoff, not an oversight: see docs/SAFETY.md.
import fs from 'node:fs';
import path from 'node:path';
import { BASE_SYSCALLS, buildProfile } from './seccomp-base.ts';

const NETWORK_SYSCALLS = [
  // getsockname/getsockopt are in the shared base already (needed even
  // without real networking, for local socketpair fds) -- not repeated
  // here.
  "socket", "connect", "sendto", "recvfrom", "recvmsg",
  "setsockopt", "getpeername",
  // Node's DNS resolution + connect path also needs this -- found by
  // strace, not guessed (same empirical method used for the airgapped
  // profile's gaps): bind (source port for the outbound UDP DNS query).
  // ppoll used to be listed here too; moved to the shared base once a
  // second target (fully offline) needed it for ordinary subprocess
  // piping, unrelated to networking -- see seccomp-base.js.
  "bind",
];

const profile = buildProfile(NETWORK_SYSCALLS);
const total = BASE_SYSCALLS.length + NETWORK_SYSCALLS.length;
fs.writeFileSync(path.join(import.meta.dirname, 'seccomp-network.json'), JSON.stringify(profile, null, 2));
console.log('wrote seccomp-network.json with', total, 'allowed syscalls');
console.log('network syscalls ALLOWED here -- isolation relies on the internal-only Docker network, not the syscall layer');
