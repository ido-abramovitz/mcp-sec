'use strict';

// Shared base allowlist: every syscall a normal Node program (and the
// container runtime's own init) needs, validated empirically while
// building the airgapped profile (see docs/SAFETY.md for the real gaps
// found: readlinkat, socketpair/shutdown, utimensat). Deliberately does
// NOT include socket/connect/bind/sendto/recvfrom -- profiles that need
// real network syscalls (see make-seccomp-network.js) add those on top,
// explicitly, rather than starting from a list that already has them.

const BASE_SYSCALLS = [
  // process / thread basics
  "read","write","open","openat","close","stat","fstat","lstat","poll","lseek",
  "mmap","mprotect","munmap","brk","rt_sigaction","rt_sigprocmask","rt_sigreturn",
  "ioctl","pread64","pwrite64","readv","writev","access","pipe","pipe2","select",
  "sched_yield","mremap","msync","mincore","madvise","dup","dup2","dup3",
  "nanosleep","getitimer","setitimer","getpid","sendfile","clone","clone3","fork",
  "vfork","execve","exit","wait4","kill","uname","fcntl","flock","fsync","fdatasync",
  "truncate","ftruncate","getdents","getdents64","getcwd","chdir","fchdir","rename",
  "mkdir","mkdirat","rmdir","creat","link","linkat","unlink","unlinkat","symlink","symlinkat",
  "renameat","renameat2","readlink","readlinkat","chmod","fchmod","fchmodat","fchownat",
  // The "*at" siblings above (mkdirat, unlinkat, symlinkat, linkat,
  // renameat/renameat2, fchmodat, fchownat) were found necessary against a
  // real target (azure-mcp, a self-contained .NET bundle that extracts
  // embedded files to a cache dir at startup) -- but the actual root cause
  // is architecture, not this one target: ARM64 (this sandbox's host
  // architecture) never implemented the legacy path-based syscalls at all
  // (mkdir, rename, symlink, unlink, chmod, chown), only their modern "at"
  // equivalents -- glibc silently translates old libc calls to them. Every
  // plain syscall in this list that has a real ARM64 replacement was
  // therefore already a no-op allow-rule on this architecture; this is the
  // first real target that actually needed one of the missing "at" forms.
  "chown","fchown","lchown","copy_file_range","umask","gettimeofday","getrlimit","getrusage","sysinfo",
  // copy_file_range: found necessary against the install-loop profile
  // (sandbox/compose.install.yml) -- Python's shutil fast-copy path
  // tries this modern zero-copy syscall before falling back to
  // read+write when moving files across filesystems (e.g. pip's
  // tmpfs staging dir to the bind-mounted target/ dir during `pip
  // install --target`), and it wasn't in the original allowlist since
  // no earlier real target's install/runtime path had exercised it.
  "setxattr","lsetxattr","fsetxattr","getxattr","lgetxattr","fgetxattr",
  "listxattr","llistxattr","flistxattr","removexattr","lremovexattr","fremovexattr",
  // xattr family: the actual root cause of the SAME install-loop failure
  // above -- confirmed via the profile's own defaultAction
  // (SCMP_ACT_ERRNO -> EPERM for anything not explicitly allowed, which
  // is exactly the "[Errno 1] Operation not permitted" Python raised).
  // shutil.copystat() (called by shutil.move()'s cross-filesystem
  // fallback, and by copytree()) tries to preserve extended attributes
  // via os.listxattr()/os.setxattr() unconditionally on Linux -- none of
  // the xattr syscalls were ever in this allowlist before pip's `--target`
  // install path became the first real caller to exercise them.
  "times","getuid","getgid","setuid","setgid","geteuid","getegid","setpgid","getppid",
  "getpgrp","setsid","getgroups","setgroups","getresuid","getresgid","getpgid",
  "capget","capset","sigaltstack","statfs","fstatfs","arch_prctl","gettid","futex",
  "sched_getaffinity","set_tid_address","restart_syscall","clock_gettime","clock_getres",
  "clock_nanosleep","exit_group","epoll_create","epoll_create1","epoll_ctl","epoll_wait",
  "epoll_pwait","set_robust_list","get_robust_list","eventfd","eventfd2","timerfd_create",
  "timerfd_settime","timerfd_gettime","signalfd","signalfd4","prlimit64","getrandom",
  "memfd_create","newfstatat","statx","faccessat","faccessat2","rseq","prctl",
  "close_range",
  // Found via strace against azure-mcp (a real .NET/CoreCLR target --
  // heavier and more syscall-hungry than any prior target's runtime).
  // All of these are runtime/scheduler/local-filesystem internals, not
  // network-capable -- deliberately NOT included from that same trace:
  // socket, bind, connect, listen, setsockopt, getpeername, sendmmsg,
  // recvmsg, io_uring_setup (io_uring in particular can be used to route
  // around several other seccomp restrictions on some kernels, so it
  // stays blocked regardless of whether a target wants it).
  "mknodat","get_mempolicy","getsid","membarrier",
  "sched_get_priority_max","sched_get_priority_min","sched_getparam",
  "sched_getscheduler","sched_setaffinity","sched_setscheduler",
  // runc's own container-init does a "safe" /proc/thread-self/fd lookup on
  // recent kernels/runc versions -- not called by the target process, but
  // blocking it means the container never finishes starting.
  "readlinkat",
  // Node's native spawnSync (execSync/execFileSync) sets up a local AF_UNIX
  // socketpair for sync IPC with the spawn helper, then shuts it down when
  // done. Neither call can create a real network socket on its own (see
  // make-seccomp.js's note on this) -- included here regardless since it's
  // needed any time Node spawns a child process, on any profile.
  "socketpair","shutdown",
  // Found via strace against a real, heavier package (338 transitive
  // deps -- exercises more of Node's internals than any fixture does):
  // getsockname/getsockopt, called on the SAME local socketpair fds
  // above, not on a real network socket -- socket()/connect() themselves
  // stay blocked on this (airgapped) profile, so there's nothing
  // network-facing for either call to introspect.
  "getsockname","getsockopt",
  // touch(1) sets file timestamps via utimensat after creating the file
  // with open(O_CREAT) -- without this the file still gets created, but
  // touch prints a spurious "Operation not permitted" warning.
  "utimensat","utime","utimes",
  // Found via strace against the first real Python target
  // (tumf/mcp-shell-server): CPython's asyncio sets up its own local
  // socketpair for event-loop self-pipe wakeups, and reads/writes it with
  // recvfrom/sendto rather than plain read/write. Same fds as the
  // socketpair entry above -- socket()/connect() themselves stay blocked
  // on this (airgapped) profile, so there's still no way to reach a real
  // network socket with either call.
  "recvfrom","sendto",
  // Found via strace against a second real Python target
  // (awslabs.finch-mcp-server), fully offline (airgapped, no network
  // profile involved) -- CPython's synchronous subprocess.run(...,
  // capture_output=True) multiplexes the child's stdout/stderr pipes with
  // ppoll while reading them, a different code path than asyncio's
  // event-loop polling above. fadvise64 (posix_fadvise, a read-pattern
  // hint to the kernel) showed up in the same trace. Neither creates or
  // touches a network-facing descriptor -- ppoll/fadvise64 only operate on
  // file descriptors the process already holds (pipes and regular files),
  // so this doesn't reopen anything socket()/connect() still block.
  // (ppoll was previously listed only in make-seccomp-network.js's
  // network-only additions; moved here since it's needed for ordinary
  // subprocess piping too, unrelated to networking.)
  "ppoll","fadvise64",
];

function buildProfile(extraSyscalls: string[] = []) {
  return {
    defaultAction: "SCMP_ACT_ERRNO", // deny everything not listed
    architectures: ["SCMP_ARCH_X86_64", "SCMP_ARCH_X86", "SCMP_ARCH_X32", "SCMP_ARCH_AARCH64"],
    syscalls: [{ names: [...BASE_SYSCALLS, ...extraSyscalls], action: "SCMP_ACT_ALLOW" }],
  };
}

export { BASE_SYSCALLS, buildProfile };
