# Minimal, throwaway container for running an UNTRUSTED MCP server.
# The point: if the server is malicious or vulnerable, the blast radius is
# this container -- not your real machine.

FROM node:22-trixie-slim
# node:22 on Debian 13 (trixie). Bumped from node:22-slim (bookworm): its
# system python3 is 3.11.2, but a large, growing share of real PyPI MCP
# targets require Python >=3.12/>=3.13 and failed install outright ("requires
# a different Python: 3.11.2 not in '>=3.12'"). Trixie's system python3 is
# 3.13, recovering ~401 of 439 such jobs (see mcp-security#272). Both seccomp
# profiles and all six sandbox profiles re-validated against the new glibc
# after this bump -- see docs/SAFETY.md if new seccomp gaps show up under the
# new runtime (a base-OS bump can change which syscalls glibc issues).
# (History: previously bumped node:20-slim -> node:22-slim for
# filesystem-mcp's Node >=22.14 requirement.)

# git-server.ts (the fixture) reproduces git-mcp-server, so the image needs
# a real git binary for the tool implementations to shell out to --
# installed at build time, while the image still has network access. The
# running container itself has none (see compose.airgapped.yml).
#
# python3/pip: first non-Node real target (mcp-shell-server) is Python.
# The sandbox itself was always meant to be language-agnostic -- this is
# just the first time a target actually required proving that.
#
# libicu76/libssl3t64: azure-mcp (@azure/mcp) ships a real .NET binary
# (azmcp), not JS -- .NET's globalization (ICU) and TLS (OpenSSL) support
# both dlopen these at runtime and fail fast without them ("Couldn't find
# a valid ICU package" / "No usable version of libssl was found"), even
# though the target never gets real network access here. Package names are
# trixie's: libicu72 -> libicu76 (ICU 76), and libssl3 -> libssl3t64
# (OpenSSL 3.5, renamed in Debian's 64-bit time_t transition).
#
# build-essential: proof-engine's scan-batch.js was classifying a real,
# recurring failure bucket as install_native_build_unsupported -- every
# sampled npm error showed node-gyp failing with "not found: make" or a
# missing C++ compiler (glibc's toolchain was never installed here, only
# the interpreters above). Adds real build time/image size, deliberately
# accepted now that a live production bucket depends on it (previously
# deferred as a rushed change with no evidence forcing the tradeoff).
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    git python3 python3-pip python3-venv libicu76 libssl3t64 build-essential \
  && rm -rf /var/lib/apt/lists/*

# Run as a non-root user. Even if the server is compromised, it isn't root
# inside the container.
RUN useradd -m -u 10001 runner
USER runner
WORKDIR /home/runner/target

# The server under test gets mounted in at run time (see compose files), so
# nothing is copied into the image here.

CMD ["bash"]
