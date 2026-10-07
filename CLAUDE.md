# Tameru

Mobile-first budgeting PWA. Local-first, no backend, not in any app store: users install with "Add to Home Screen" and it must feel native. It answers one question fast: **"what can I safely spend today?"**

Differentiators: safe-to-spend number, cash flow forecast, very fast expense capture, privacy (all data stays on the device).

## Commands

- `npm run dev` – dev server
- `npm test` – Vitest (domain + db tests)
- `npm run build` – typecheck + production build (must pass)
- `npm run preview` – serve the production build (use this to verify install/offline)
- `npm run icons` – regenerate placeholder PNG icons into `public/icons`

## Stack (decided, don't swap)

- Vite + React + TypeScript (strict). Hash-based routing (`src/ui/router.ts`, no router dependency) so static hosting needs no server config. `base: './'` so it works from any sub-path.
- Dexie.js over IndexedDB for **all** app data. Never use localStorage for data. localStorage/sessionStorage hold device-local UI state only (install-gate override, first-run persistence result).
- vite-plugin-pwa (Workbox, `generateSW`): app shell precached, fully functional offline. `registerType: 'prompt'`: a new version shows an "Update ready" toast instead of reloading mid-entry.
- Vitest for unit tests on domain logic (plus db tests on `fake-indexeddb`).
- Plain CSS with CSS variables for tokens (`src/styles/tokens.css`). No UI framework.
- Fonts self-hosted via @fontsource: Geist and Geist Mono. Latin subset only.
- **No runtime network requests at all. No analytics.** Don't add CDNs, remote fonts, or telemetry.

## Structure

- `src/domain` – pure functions. No DB, React, or DOM imports. Everything here is unit tested.
- `src/db` – Dexie schema (`db.ts`), repository functions (`repo.ts`), backup export/import (`backup.ts`), dev sample data (`sample.ts`).
- `src/pwa` – standalone detection, install prompt, storage persistence, service worker registration.
- `src/ui` – shared components (tab bar, sheets, toast, icons, context, router).
- `src/pages` – screens.

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

Source of truth: the Claude Design project "Tameru Redesign" (variant **1b** for Home and nav, **2a–2c** for the Add sheet). Statement-like: flat sections under rules, monospaced figures, very little chrome. Design target is 390px wide; layout caps at 480px. Light and dark themes, following the system setting.

Tokens live in `src/styles/tokens.css`:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F5F4EF` | `#0E100F` | page |
| `--surface` | `#FFFFFF` | `#181B19` | sheets, nav pill, Settings cards, inputs |
| `--ink` / `--ink2` | `#151714` / `#5E625C` | `#ECEDE8` / `#A2A69F` | text / secondary text |
| `--ink3` | `#A9ACA5` | `#5A5E58` | decoration only, never text |
| `--line` / `--track` | `#E4E3DD` / `#E9E8E2` | `#262A27` / `#242826` | hairlines / empty meter ticks |
| `--accent` (Shu) | `#A5482C` | `#C4664A` | primary actions, selection, today |
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

## PWA

- Manifest: name Tameru, standalone, icons incl. maskable, plus apple-touch-icon and iOS meta tags.
- Install gate: if not standalone (`navigator.standalone` or `display-mode`), show the install screen (iOS Safari instructions; `beforeinstallprompt` button on Android/Chrome). Entering data in a browser tab is discouraged because iOS tab storage and installed-app storage are separate; "continue in browser" is a per-session escape hatch with a persistent warning banner.
- On first run in standalone, call `navigator.storage.persist()`; Settings shows the result.
- Must open and work with no connection.

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
- **Forecast** starts from the current balance, adds unpaid occurrences, optionally subtracts the 30-day average daily variable spend from tomorrow on. What-ifs are never saved.
- **Chart**: plan is ink solid, what-if is violet dashed (`--series-scenario`), told apart by legend + dash, not colour alone. One direct label (the low point). The events table below it is the non-visual equivalent.
- **CSV**: a file layout is identified by `csvSignature` (its header row, or column count if headerless) and its mapping is remembered in `importProfiles`. Re-importing a file adds nothing: rows matching an existing date + amount + raw descriptor are skipped (counted, so genuine same-day repeats survive).
- **Encrypted backup**: PBKDF2-SHA-256 (600k iterations, random 16-byte salt) → AES-256-GCM (random 12-byte IV), in a JSON envelope (`*.encrypted.json`). No passphrase recovery. Import accepts both plain and encrypted files.
- DB is at schema v2 (`importProfiles` added); backup format v2. Older backups still import.

## Done means

`npm run build` passes, tests pass, the app is installable and loads offline (verify against `npm run preview`, not dev), and there are no console errors.
