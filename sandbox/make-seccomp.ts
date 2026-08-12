// Airgapped profile: default-deny, the shared base allowlist, nothing
// network-facing added. No socket/connect/bind/sendto/recvfrom = no
// egress, enforced at the kernel level, regardless of namespace config.
import fs from 'node:fs';
import path from 'node:path';
import { BASE_SYSCALLS, buildProfile } from './seccomp-base.ts';

const profile = buildProfile([]);
fs.writeFileSync(path.join(import.meta.dirname, 'seccomp.json'), JSON.stringify(profile, null, 2));
console.log('wrote seccomp.json with', BASE_SYSCALLS.length, 'allowed syscalls');
console.log('network syscalls (socket/connect/bind) are BLOCKED by omission');
