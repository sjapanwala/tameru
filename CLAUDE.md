# Tameru

Mobile-first budgeting PWA. Local-first, no backend, not in any app store: users install with "Add to Home Screen" and it must feel native. It answers one question fast: **"what can I safely spend today?"**

Differentiators: safe-to-spend number, cash flow forecast, very fast expense capture, privacy (all data stays on the device).

## Commands

- `npm run dev` – dev server (shows the install gate, as production does)
- `npm run dev:app` – dev server with the gate off (`VITE_ALLOW_BROWSER=true`), for working on the app
- `npm test` – Vitest (domain + db tests)
- `npm run build` – typecheck + production build (must pass)
- `npm run preview` – serve the production build (use this to verify install/offline)
- `npm run icons` – regenerate placeholder PNG icons into `public/icons`

## Stack (decided, don't swap)

- Vite + React + TypeScript (strict). Hash-based routing (`src/ui/router.ts`, no router dependency) so static hosting needs no server config. `base: './'` so it works from any sub-path.
- Dexie.js over IndexedDB for **all** app data. Never use localStorage for data. localStorage/sessionStorage hold device-local UI state only (install-gate override, first-run persistence result, theme and accent).
- vite-plugin-pwa (Workbox, `generateSW`): app shell precached, fully functional offline. `registerType: 'prompt'`: a new version shows an "Update ready" toast instead of reloading mid-entry.
- Vitest for unit tests on domain logic (plus db tests on `fake-indexeddb`).
- Plain CSS with CSS variables for tokens (`src/styles/tokens.css`). No UI framework.
- Fonts self-hosted via @fontsource: Geist and Geist Mono. Latin subset only.
- **No runtime network requests at all. No analytics.** Don't add CDNs, remote fonts, or telemetry.

## Structure

- `src/domain` – pure functions. No DB, React, or DOM imports. Everything here is unit tested.
- `src/db` – Dexie schema (`db.ts`), repository functions (`repo.ts`), backup export/import (`backup.ts`), dev sample data (`sample.ts`).
- `src/gate` – the install gate, the only thing a browser tab renders. Must not import the app or database.
- `src/pwa` – browser glue: standalone/platform wrappers, install prompt, storage persistence, service worker registration.
- `src/ui` – shared components (tab bar, sheets, toast, icons, context, router).
- `src/pages` – screens.
- `src/onboarding` – first-run flow: pure state machine (`machine.ts`), shared pieces (`kit.tsx`, `art.tsx`, `motion.ts`), the screens (`setup.tsx`, `dreams.tsx`) and their styles. `pages/Onboarding.tsx` maps each step to a screen and saves progress in `settings.onboarding`, so quitting resumes on the same screen. The app shows it while `onboardedAt` is unset or `settings.onboarding` is non-null (the optional goals stage after the reveal).

UI calls repositories; repositories call Dexie; domain is called by both and imports neither.

## Data model

- **Money is always integer minor units ("cents")**. Never floats. Format with `Intl.NumberFormat` via `domain/money.ts`. Default currency CAD, configurable in Settings.
- `Transaction.amountCents` is **signed**: negative = expense, positive = income. `Recurring.amountCents`, `Budget.monthlyCents`, goal amounts are positive magnitudes (`Recurring.kind` gives direction).
- `Transaction.date` is a local calendar date string `YYYY-MM-DD` (no timezone). Timestamps are ISO 8601 UTC strings.
- Every record has `id` (UUID), `createdAt`, `updatedAt`, `deletedAt` (soft delete, `null` when live). Never hard-delete from the UI; this keeps future sync possible. Repos filter out soft-deleted rows; export includes them.
- Tables: `accounts`, `categories`, `transactions` (date, amountCents, accountId, categoryId, merchant, rawDescriptor, note, needsReview, optional recurringId/recurringDate), `merchantRules` (pattern, cleanName, categoryId), `budgets` (categoryId, monthlyCents), `recurring` (name, amountCents, schedule, kind: bill|income, categoryId), `goals`, `settings` (key/value rows, unique `key`), `importProfiles` (name, signature, mapping).
- Transactions are indexed by `date`, `categoryId`, `accountId`.
- Schema changes: add a new `db.version(n)` block, never edit an old one. Bump `BACKUP_FORMAT_VERSION` if the export shape changes.

### Merchant rules

- `cleanMerchant(raw)` normalises descriptors ("SQ *JOES COFFEE 4412" → "Joe's Coffee"). Input that is already mixed-case is assumed human-typed and keeps its casing.
- `MerchantRule.pattern` is a `merchantKey` (lowercase, alphanumeric, single spaces). A rule matches when the merchant's key equals the pattern or starts with it at a word boundary; longest pattern wins.
- When the user sets/changes a category for a merchant, offer (non-blocking toast) to remember it as a rule. Never create rules silently.

## Design ("Ledger")

Source of truth: the Claude Design project "Tameru Redesign" (variant **1b** for Home and nav, **2a–2c** for the Add sheet). Statement-like: flat sections under rules, monospaced figures, very little chrome. Design target is 390px wide; layout caps at 480px. Light and dark themes, following the system setting unless Settings → Appearance pins one (`data-theme` on `<html>`). The accent is Shu by default; Settings also offers Navy and Sage (`data-accent`). Both choices live in localStorage (`pwa/appearance.ts`) and apply to the gate too.

Tokens live in `src/styles/tokens.css`:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F5F4EF` | `#0E100F` | page |
| `--surface` | `#FFFFFF` | `#181B19` | sheets, nav pill, Settings cards, inputs |
| `--ink` / `--ink2` | `#151714` / `#5E625C` | `#ECEDE8` / `#A2A69F` | text / secondary text |
| `--ink3` | `#A9ACA5` | `#5A5E58` | decoration only, never text |
| `--line` / `--track` | `#E4E3DD` / `#E9E8E2` | `#262A27` / `#242826` | hairlines / empty meter ticks |
| `--accent` (Shu) | `#A5482C` | `#C4664A` | primary actions, selection, today |
| `--navy` / `--sage` | `#27457A` / `#4F6B52` | `#86A8E0` / `#9DBB95` | alternative accents (`--accent` points at the chosen one) |
| `--pos` (green) | `#1F6B4F` | `#6FCF9F` | money in, always (plus a “+” sign) |
| `--accent-soft` | `#F5E5DD` | `#2E1E18` | tinted accent backgrounds |
| `--neg` (ochre) | `#8A6100` | `#E0B252` | attention only: needs review, overdue, over budget |

- The accent is Shu, a red-orange, so it must never signal a problem, and never money coming in (it reads as a loss): income is always `--pos` green. Attention uses ochre (`--neg`), and destructive buttons are ink, not accent.
- Fonts (self-hosted via @fontsource, latin subset): **Geist** 400/500/600 for text, **Geist Mono** 400/500 for figures and dates (`.mono`). Tabular numerals wherever money appears (`.num` or `.mono`).
- Rules: `--rule` (1.5px ink) opens a section; `--hair` (1px line) separates rows. Pages are flat; raised `--surface` cards are only for Settings groups, the install/welcome screens, sheets and the nav.
- Shape: pill buttons (54px primary), 12px inputs, 16px cards, 28px sheet corners.
- Navigation: floating pill with **Home / Activity / Plan** plus a separate round Add button. Forecast lives inside Plan (sub-tabs; the Plan tab stays active on `#/forecast`). Settings and CSV import are drill-in screens with a back arrow and no nav.
- Add sheet: Expense/Income underline tabs, mono amount with caret, three circles for the most-used categories plus **More**, which opens a searchable menu of the user's categories and the presets in `PRESET_CATEGORIES`; choosing a preset or typing a new name creates the category. Category icons are chosen by name in `ui/CategoryIcon.tsx` (initial letter as fallback). The merchant is always typed; there are no merchant suggestions.
- Home: month title, safe-to-spend figure, Spent / Remaining / Budget / vs last month grid, daily spending bars against the allowance line, bills for the next 14 days, budgets and goals as 24-tick meters.

Rules that still hold:
- Touch targets ≥ 44px (chips are 34px tall with an expanded hit area). Text contrast ≥ 4.5:1.
- Never use colour alone to convey meaning: pair with text, an icon, weight or a sign.
- Real `<button>` / `<label>` / `<input>` / `<a>` elements. Sheets and confirms are native `<dialog>`.
- Input font-size ≥ 16px (prevents iOS zoom).
- Respect safe-area insets (`env(safe-area-inset-*)`, `viewport-fit=cover`).

## PWA and the install gate

- Manifest: name Tameru, `display: standalone`, `id`/`start_url`/`scope` all `./` (no query string), theme and background colours, icons incl. maskable, plus apple-touch-icon and iOS meta tags. `viewport-fit=cover`.
- **Tameru never runs in a browser tab.** `src/Root.tsx` decides once at launch: not standalone → render only `<InstallGate/>` (`src/gate/`). There is no demo mode, no sample data and no visible "continue in browser"; a separate demo site will cover that. The one exception is the hidden developer code below.
- Detection is pure and tested in `src/domain/platform.ts`: `isStandalone()` (`display-mode: standalone` or `navigator.standalone === true`) and `platform()` → `ios_safari | ios_other_browser | ios_in_app_browser | android_chrome | android_other | desktop`.
- Gate content per platform: iOS Safari gets three step cards (no fake install prompt); other iOS browsers and in-app browsers are told to open the link in Safari, with Copy link; Android Chrome gets a real Install button from `beforeinstallprompt` plus manual steps; other Android browsers are sent to Chrome; desktop gets a locally generated QR code (`qrcode-generator`) and Copy link. Every variant ends with "Already installed? Open Tameru from your home screen."
- **Isolation is structural.** The app (`App.tsx`, pages, `db/`, Dexie) is behind a dynamic `import()` in `Root.tsx`, so a gated tab never loads database code at all. `src/gate/gate.test.ts` walks the static import graph from `main.tsx` and fails if `db/`, `pages/`, `App.tsx`, Dexie or any `indexedDB` reference becomes reachable. Keep anything the gate imports free of those.
- First standalone launch: `Root` awaits `navigator.storage.persist()` (result stored in localStorage, shown in Settings), then mounts the app, which goes to onboarding.
- Service worker: the gate applies updates immediately; the app shows an "Update ready" toast instead. The gate is precached and loads offline.
- Link previews: Open Graph tags in `index.html`. Set `VITE_SITE_URL=https://…/` at build time so `og:url` and `og:image` are absolute (crawlers need that).

### Developer escape hatch: `VITE_ALLOW_BROWSER`

To run the app in a desktop browser, set `VITE_ALLOW_BROWSER=true` when starting Vite. It skips the gate.

- `npm run dev:app` – dev server with the app in the browser (plain `npm run dev` shows the gate, like production).
- `npm run build:browser` – a build with the gate off, for Playwright or `npm run preview`.
- It is read in `vite.config.ts` and compiled to the constant `__ALLOW_BROWSER__`, so it is off unless explicitly set and the bypass is dead code in a normal `npm run build`. A build with it on prints a warning. **Never deploy a build made with it.**

### Hidden developer code (temporary)

Tapping the gate's logo five times reveals a code field. The code (`0000`, in `src/pwa/unlock.ts`) sets `tameru.gate` in localStorage and reloads; `Root` then treats the tab as allowed. It works in production builds and is **not security**: the code ships in the bundle. Replace it before this matters. Settings shows "Lock this browser again" while it is active.

## Milestones (all five built)

1. **Foundation**: scaffold, tokens, shell + tab bar, Dexie schema + repos, PWA config, install gate, persistence request, onboarding, Settings with JSON export/import, dev-only sample data.
2. **Capture and activity**: Quick Add bottom sheet (target < 5 s per expense), merchant cleanup + rules, Activity (grouped by day, edit, delete with undo, needs-review filter, search).
3. **Home**: safe-to-spend, category budgets, coming-up bills (`domain/safeToSpend.ts`).
   `safeToSpendToday = (expected income this month − reserved bills − goal contributions − variable spend so far) / days left in month`, floored, never below zero.
4. **Plan + Forecast**: recurring bills/paydays, budgets and goals (Plan); 30/60/90-day forecast with what-if (`domain/recurring.ts`, `domain/forecast.ts`, `ui/BalanceChart.tsx`).
5. **Import + encrypted backup**: CSV import with per-bank column mapping at `#/import` (`domain/csv.ts`); passphrase-encrypted backup (`domain/encryptedBackup.ts`).

### Planning rules worth knowing

- **Recurring items** repeat forward from `schedule.anchorDate` only; nothing occurs before the anchor. Monthly/yearly dates a month lacks fall on its last day.
- **Paid occurrences**: marking a bill paid (or income received) creates a normal transaction carrying `recurringId` + `recurringDate`. Those transactions are *not* variable spend (the bill is already reserved) and the occurrence is dropped from "Coming up" and from the forecast. Undo = soft-delete that transaction.
- **Variable spend** = expenses without a `recurringId`.
- **Income that varies** (`Recurring.variable`): `amountCents` is a cautious low estimate. "Got it" on Home asks what actually arrived and records that. Safe-to-spend counts received paydays at their recorded amount and the rest at the estimate. After three paydays Home offers (toast, never silently) to plan on the lowest of the last three (`cautiousEstimate`).
- **Forecast** starts from the current balance, adds unpaid occurrences, optionally subtracts the 30-day average daily variable spend from tomorrow on. What-ifs are never saved.
- **Chart**: plan is ink solid, what-if is violet dashed (`--series-scenario`), told apart by legend + dash, not colour alone. One direct label (the low point). The events table below it is the non-visual equivalent.
- **CSV**: a file layout is identified by `csvSignature` (its header row, or column count if headerless) and its mapping is remembered in `importProfiles`. Re-importing a file adds nothing: rows matching an existing date + amount + raw descriptor are skipped (counted, so genuine same-day repeats survive).
- **Encrypted backup**: PBKDF2-SHA-256 (600k iterations, random 16-byte salt) → AES-256-GCM (random 12-byte IV), in a JSON envelope (`*.encrypted.json`). No passphrase recovery. Import accepts both plain and encrypted files.
- DB is at schema v2 (`importProfiles` added); backup format v2. Older backups still import.

## Done means

`npm run build` passes, tests pass, the app is installable and loads offline (verify against `npm run preview`, not dev), and there are no console errors.
