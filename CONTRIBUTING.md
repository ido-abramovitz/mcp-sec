# Contributing

This repo is the free, open-source CLI client only -- it contains no
scanning logic and no data. It just calls a backend API and prints the
result.

## Setup

```bash
npm install
npm run typecheck
npm run build
```

## Pull requests

1. Fork the repo
2. Make your change on a branch
3. Run `npm run typecheck` and `npm run build` before opening a PR
4. Open a PR against `main`

## Reporting a security issue

Please don't open a public issue for a security vulnerability. Contact us
directly instead (contact method TBD).
