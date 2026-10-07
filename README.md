# Tameru

A mobile-first budgeting PWA that answers one question fast: **what can I safely spend today?**

Local-first and private: there is no backend, no account and no analytics. All data lives in
IndexedDB on your device. Install it with "Add to Home Screen".

## Develop

```sh
npm install
npm run dev       # dev server (Settings has a "Load sample data" button in dev)
npm test          # unit tests
npm run build     # typecheck + production build into dist/
npm run preview   # serve dist/ — use this to check install and offline behaviour
```

`dist/` is fully static and uses hash routing with relative paths, so it can be hosted from any
static host or sub-path. Installing on a phone needs HTTPS.

Project decisions and conventions are in [CLAUDE.md](CLAUDE.md).
