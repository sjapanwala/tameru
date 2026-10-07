# Tameru

A mobile-first budgeting PWA that answers one question fast: **what can I safely spend today?**

Local-first and private: there is no backend, no account and no analytics. All data lives in
IndexedDB on your device. Install it with "Add to Home Screen".

## Develop

```sh
npm install
npm run dev:app   # dev server with the app in your browser (Settings has "Load sample data")
npm run dev       # dev server as users see it: a browser tab shows only the install screen
npm test          # unit tests
npm run build     # typecheck + production build into dist/
npm run preview   # serve dist/ — use this to check install and offline behaviour
npm run build:browser   # build with the install gate off, for browser testing; never deploy it
```

`dist/` is fully static and uses hash routing with relative paths, so it can be hosted from any
static host or sub-path. Installing on a phone needs HTTPS.

Project decisions and conventions are in [CLAUDE.md](CLAUDE.md).
