# Minimal, throwaway container for running an UNTRUSTED MCP server.
# The point: if the server is malicious or vulnerable, the blast radius is
# this container -- not your real machine.

FROM node:22-slim
# Bumped from node:20-slim: filesystem-mcp (the path-traversal real-world
# fixture) requires Node >=22.14. Re-tested against all existing fixtures
# after this change -- see docs/SAFETY.md if new seccomp gaps show up
# under the new runtime.

# git-server.ts (the fixture) reproduces git-mcp-server, so the image needs
# a real git binary for the tool implementations to shell out to --
# installed at build time, while the image still has network access. The
# running container itself has none (see compose.airgapped.yml).
#
# python3/pip: first non-Node real target (mcp-shell-server) is Python.
# The sandbox itself was always meant to be language-agnostic -- this is
# just the first time a target actually required proving that.
#
# libicu72/libssl3: azure-mcp (@azure/mcp) ships a real .NET binary
# (azmcp), not JS -- .NET's globalization (ICU) and TLS (OpenSSL) support
# both dlopen these at runtime and fail fast without them ("Couldn't find
# a valid ICU package" / "No usable version of libssl was found"), even
# though the target never gets real network access here.
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    git python3 python3-pip python3-venv libicu72 libssl3 \
  && rm -rf /var/lib/apt/lists/*

# Run as a non-root user. Even if the server is compromised, it isn't root
# inside the container.
RUN useradd -m -u 10001 runner
USER runner
WORKDIR /home/runner/target

# The server under test gets mounted in at run time (see compose files), so
# nothing is copied into the image here.

CMD ["bash"]
