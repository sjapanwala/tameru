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
- Fonts self-hosted via @fontsource: Bricolage Grotesque 500/700 (headings, big numbers), Instrument Sans 400/500/600 (body). Latin subset only.
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
- Tables: `accounts`, `categories`, `transactions` (date, amountCents, accountId, categoryId, merchant, rawDescriptor, note, needsReview), `merchantRules` (pattern, cleanName, categoryId), `budgets` (categoryId, monthlyCents), `recurring` (name, amountCents, schedule, kind: bill|income, categoryId), `goals`, `settings` (key/value rows, unique `key`).
- Transactions are indexed by `date`, `categoryId`, `accountId`.
- Schema changes: add a new `db.version(n)` block, never edit an old one. Bump `BACKUP_FORMAT_VERSION` if the export shape changes.

### Merchant rules

- `cleanMerchant(raw)` normalises descriptors ("SQ *JOES COFFEE 4412" → "Joe's Coffee"). Input that is already mixed-case is assumed human-typed and keeps its casing.
- `MerchantRule.pattern` is a `merchantKey` (lowercase, alphanumeric, single spaces). A rule matches when the merchant's key equals the pattern or starts with it at a word boundary; longest pattern wins.
- When the user sets/changes a category for a merchant, offer (non-blocking toast) to remember it as a rule. Never create rules silently.

## Design

Calm and numeric. Design target is 390px wide; layout caps at 480px.

Tokens: ink `#101C19`, ground `#F3F5F4`, surface `#FFFFFF`, hairline `#E1E8E5`, muted text `#55635F`, accent teal `#0A7A66` (good/primary), warn burnt orange `#B4470F` (attention only), teal tint `#E3F1ED`, warn tint `#FBEBE1`. Card radius 20–24px, generous spacing, tabular numerals wherever money appears (`.num`).

Rules:
- Touch targets ≥ 44px. Text contrast ≥ 4.5:1.
- Never use colour alone to convey meaning: pair with text or an icon.
- Real `<button>` / `<label>` / `<input>` / `<a>` elements. Sheets and confirms are native `<dialog>`.
- Input font-size ≥ 16px (prevents iOS zoom).
- Navigation: bottom tab bar with Home, Activity, raised centre Add, Forecast, Plan. Settings is reached from the page header.
- Respect safe-area insets (`env(safe-area-inset-*)`, `viewport-fit=cover`).

## PWA

- Manifest: name Tameru, standalone, icons incl. maskable, plus apple-touch-icon and iOS meta tags.
- Install gate: if not standalone (`navigator.standalone` or `display-mode`), show the install screen (iOS Safari instructions; `beforeinstallprompt` button on Android/Chrome). Entering data in a browser tab is discouraged because iOS tab storage and installed-app storage are separate; "continue in browser" is a per-session escape hatch with a persistent warning banner.
- On first run in standalone, call `navigator.storage.persist()`; Settings shows the result.
- Must open and work with no connection.

## Milestones

1. **Foundation** (built): scaffold, tokens, shell + tab bar, Dexie schema + repos, PWA config, install gate, persistence request, onboarding (currency, one account with starting balance, default categories Groceries / Dining out / Transport / Fun / Health), Settings with JSON export, JSON import (with confirm), dev-only sample data.
2. **Capture and activity** (built): Quick Add bottom sheet (big amount, custom number pad, recent-merchant chips, category chips, optional note; target < 5 s per expense), merchant cleanup + rules, Activity (grouped by day, edit, delete with undo, needs-review filter, search).
3. Home with safe-to-spend, category budgets, coming-up bills.
   Planned definition: `safeToSpendToday = (expected income this month − reserved bills − goal contributions − variable spend so far) / days left in month`. Implement as a pure function in `src/domain`.
4. Recurring bills/paydays + 30/60/90-day forecast + what-if.
5. CSV import with per-bank column mapping (feeds `cleanMerchant` + rules, sets `needsReview`); encrypted backup file (Web Crypto AES-GCM + PBKDF2) via share sheet.

Tables for 3–5 (`budgets`, `recurring`, `goals`) already exist in the schema and backup format; they have no UI yet.

## Done means

`npm run build` passes, tests pass, the app is installable and loads offline (verify against `npm run preview`, not dev), and there are no console errors.
