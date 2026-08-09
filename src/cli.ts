#!/usr/bin/env node

// mcp-sec CLI entry point. Deliberately thin -- this package contains no
// scanning logic of its own. Every real check is performed once, centrally,
// by the (private) backend service, and this CLI just asks it a question
// and prints the answer. See CLI-M2/M3 for the real request/response
// plumbing -- this is the M1 scaffold, proving the package/bin/build
// pipeline works end to end before any real logic is wired in.

function main(): void {
  const args = process.argv.slice(2);
  console.log('mcp-sec -- not yet implemented (scaffold only)');
  if (args.length > 0) {
    console.log(`  (received args: ${args.join(' ')})`);
  }
}

main();
