# Architecture and structure (technical)

Project structure, APIs, data models, and main flows.

---

## 1. Folder structure (relevant)

```
broker-dashboard/
├── app/
│   ├── api/                    # API Routes
│   │   ├── auth/[...nextauth]/ route.ts           # NextAuth (Google)
│   │   ├── dashboard/          route.ts           # GET dashboard (summary + charts)
│   │   ├── files/
│   │   │   ├── route.ts        # GET file list + activeFileId
│   │   │   ├── upload/route.ts # POST upload XLSX → parse → DB
│   │   │   ├── select/route.ts # POST set active file
│   │   │   └── delete/route.ts # POST delete file + assets, auto-select latest
│   │   └── admin/
│   │       ├── users/route.ts        # GET list of users who tried to sign in
│   │       └── users/toggle/route.ts # POST approve/revoke access
│   ├── components/
│   │   ├── DashboardCharts.tsx
│   │   ├── FinanzaFooter.tsx
│   │   ├── FinanzaNavbar.tsx
│   │   └── AdminPanel.tsx
│   ├── contexts/
│   │   └── CacheContext.tsx    # In-memory cache (files + dashboard)
│   ├── layout.tsx
│   ├── page.tsx                # Main page (Upload / Dashboard / Admin tabs)
│   └── providers.tsx           # SessionProvider + CacheProvider
├── lib/
│   ├── auth.ts                 # authOptions (NextAuth + session callback)
│   ├── access.ts               # ADMIN_EMAIL and isAdminEmail helper
│   ├── etfIndexGroups.ts       # Ticker → index mapping (grouped ETFs)
│   ├── xtbParser.ts            # XTB XLSX parser (Open Positions, ETFs only)
│   ├── yahoo.ts                # Yahoo Finance daily closes (EUR) + DB cache
│   ├── portfolioHistory.ts     # Monthly / yearly valuation and returns
│   └── prisma.ts               # Prisma client (singleton)
├── prisma/
│   ├── schema.prisma           # Models and generator (no url in datasource)
│   └── generated/...           # Generated client
├── prisma.config.ts            # Prisma 7 config (datasource url, etc.)
├── docs/                       # Documentation
│   ├── README.md
│   ├── product/requirements.md
│   └── technical/
│       ├── technologies.md
│       └── architecture.md
└── next.config.ts
```

---

## 2. API Routes

All routes that require an authenticated user use `getServerSession(authOptions)` (exported from `lib/auth.ts`).

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/auth/*` | NextAuth (login, callback, session). |
| GET | `/api/files` | User's file list + `activeFileId` (only approved users or admin). |
| POST | `/api/files/upload` | Body: FormData with XLSX file. Parses sheet "Open Positions" (ETFs only, via `lib/xtbParser.ts`), persists to `UploadedFile` + `Asset`; only allowed for approved users or admin. |
| POST | `/api/files/select` | Body: `{ fileId }`. Marks a file as active (`isActive`) for the user; only allowed for approved users or admin. |
| POST | `/api/files/delete` | Body: `{ fileId }`. Deletes the file and its assets, then marks the most recently uploaded remaining file as active (if any). |
| GET | `/api/dashboard?fileId=...&includePlans=true|false` | Dashboard data (filter via `lib/assetFilter.ts`, `includePlans` defaults to true): summary, byCategory, byYear, investedVsProfitByYear, byTicker, byIndexGroup (grouped ETFs via `lib/etfIndexGroups.ts`); only for approved users or admin. |
| GET | `/api/dashboard/history?fileId=...` | Monthly (report year) and yearly portfolio history using Yahoo Finance prices (`lib/yahoo.ts`, `lib/portfolioHistory.ts`); prices cached in `PriceHistory`. Returns `needsReupload` for files uploaded before `openedAt` existed. |
| GET | `/api/version` | Public. Current build id (`NEXT_PUBLIC_BUILD_ID` = git SHA), `Cache-Control: no-store`; used by `NewVersionBanner`. |
| GET | `/api/admin/users` | Admin-only: list of users who tried to sign in, with access flags and timestamps. |
| POST | `/api/admin/users/toggle` | Admin-only: approve/revoke user access (`accessApproved`, `accessApprovedAt`). |

---

## 3. Data models (Prisma)

- **User**: `id`, `name`, `email`, `emailVerified`, `image`, plus access-control fields:
  - `accessApproved: Boolean @default(false)`
  - `accessRequestedAt: DateTime @default(now())`
  - `accessApprovedAt: DateTime?`
  - Relations: `accounts`, `sessions`, `files`.
- **Account, Session, VerificationToken**: standard NextAuth models (Prisma Adapter).
- **UploadedFile**: `id`, `fileName`, `uploadedAt`, `isActive`, `userId`; relation to `Asset[]`.
- **PriceHistory**: Yahoo Finance cache, one row per Yahoo symbol: `symbol` (PK), `currency`, `fromDate`, `closes` (JSON `[["YYYY-MM-DD", closeEur], ...]`), `fetchedAt`. Refreshed when older than 12h or when it doesn't cover the requested start date.
- **PushSubscription**: one Web Push endpoint per device (`endpoint` unique, `p256dh`, `auth`, `userAgent`, `userId`).
- **AlertWatch**: watched ETFs per user (`userId` + `ticker` unique, `name`, `enabled`, `alertedAt`).
- **AlertRun**: one row per scheduled check (`slot` = Lisbon `YYYY-MM-DD HH`, `summary` JSON).
- **StockFundamentals**: one row per S&P 500 symbol: `name`, `sector`, `industry`, `metrics` (JSON, selected Finnhub metrics + derived `_peMedian5y`, `_epsUpYearsPct`, `_epsPositiveYearsPct`, `_netMarginStd`), `series` (JSON annual/quarterly), `error`, `fetchedAt`.
- **StockDetailCache**: `symbol` (PK), `data` (JSON detail), `fetchedAt`.
- **UploadedFile.reportDate**: XTB report generation date (defines the file's year).
- **Asset**: per XLSX lot (`openedAt` = full open time UTC; `product` = "My Trades" | "Investment Plan", null for old uploads): `ticker`, `name`, `category`, `type`, `quantity`, `avgPrice`, `investedValue`, `currentValue`, `profitLoss`, `year`, `fileId`.

The active file is the single `UploadedFile` with `isActive === true` for that `userId` (select logic and `delete` route keep this invariant).

---

## 4. Client cache (CacheContext)

- **State**: `files: FilesResponse | null`, `dashboard: Record<fileId, DashboardData>`.
- **Functions**:
  - `loadFiles()` — fetch `/api/files` once per session and store in cache.
  - `invalidateFiles()` — clear only the file list.
  - `updateFilesInCache()` — update file list and `activeFileId` after actions like select.
  - `getDashboardData(fileId)` — read cached dashboard data for a file.
  - `loadDashboard(fileId)` — fetch `/api/dashboard?fileId=...` once per file and cache the result.
  - `invalidateDashboard(fileId)` — remove dashboard cache entry when a file is deleted.
  - `clearCache()` — clear both files and dashboard (used on logout and "Limpar cache").
- **Integration**:
  - Main page reads from cache for file list and active file.
  - `DashboardCharts` reads dashboard data from cache or loads it on demand.
  - Navbar "Limpar cache" button calls `clearCache()`.

---

## 5. Main flows

1. **Login & access request**
   - User logs in with Google via NextAuth.
   - For non-admin users, if `accessApproved === false`, the app shows an “access request submitted” page; they cannot see Upload/Dashboard/Admin.
   - The admin user (email `silvandreferreira@gmail.com`) is always allowed and sees the Admin tab.

2. **Upload**
   - Form submits XLSX → `/api/files/upload` → parse with `lib/xtbParser.ts` (sheet Open Positions, ETF lots only) → write to DB as `UploadedFile` + `Asset`.
   - Cache for file list is invalidated and reloaded, and the UI switches to the Dashboard tab.

3. **File selection**
   - "Dashboard" button on a file → POST `/api/files/select` → set `isActive` for that file and clear other actives for that user.
   - Cache is updated via `updateFilesInCache`, and the UI switches to the Dashboard tab with loading bar on the button.

4. **File deletion**
   - "Delete" button on a file → POST `/api/files/delete` → delete `Asset` and `UploadedFile` for that user.
   - On the server, the most recent remaining file (by `uploadedAt desc`) is marked active.
   - On the client, dashboard cache for that `fileId` is invalidated and the file list is reloaded.

5. **Dashboard**
   - Data for the active file via GET `/api/dashboard?fileId=...`; result cached by `fileId`.
   - Charts use the cached data, including grouped ETFs via `lib/etfIndexGroups.ts`.

6. **Admin**
   - Admin tab (`AdminPanel`) calls `/api/admin/users` to list users who attempted login, with name, email, `accessApproved`, and timestamps.
   - A toggle per user calls `/api/admin/users/toggle` to approve or revoke access.
   - Sorting options: by most recent request, alphabetical (name/email), approved first, or pending first. The admin user is always shown at the top with status "Admin" and a locked-on toggle.

---

7. **Market drop alerts**
   - `vercel.json` defines six Vercel Cron Jobs (Mon–Fri at 8, 9, 11, 12, 13, 14 UTC) calling GET `/api/cron/market-alerts` with `Authorization: Bearer $CRON_SECRET`. The route only proceeds when the Lisbon hour is 9, 12 or 14, so summer and winter time both work; `AlertRun` (slot `YYYY-MM-DD HH`) guarantees one run per slot. `?force=1` skips both checks for testing.
   - For every user with a `PushSubscription`, `syncWatchlist` (`lib/marketAlerts.ts`) adds the ETFs of the latest upload to `AlertWatch`; enabled tickers are checked once each with `fetchDropFromHigh` (`lib/yahoo.ts`, Yahoo chart `range=1y`, no cache).
   - Only ETFs that newly crossed −10% (`AlertWatch.alertedAt` null) are notified; `alertedAt` is set when the push reached at least one device and cleared when the ETF recovers above −8%. Users with newly dropping ETFs get a Web Push (`lib/push.ts`, `web-push` + VAPID). Expired subscriptions (404/410) are deleted. `public/sw.js` shows the notification and opens the app on tap.
   - UI: `app/components/AlertsPanel.tsx` (tab "Alertas"); APIs `/api/alerts` (GET config, PATCH toggle), `/api/alerts/check`, `/api/push/subscribe` (POST/DELETE), `/api/push/test`.

8. **Stock radar**
   - Three Vercel Cron Jobs (02:00, 03:00, 04:00 UTC daily) call GET `/api/cron/stocks-refresh` (Bearer `CRON_SECRET`). `refreshFundamentals` (`lib/stockData.ts`) fetches Finnhub `/stock/metric?metric=all` for the stalest symbols (> 20h), one request every 1.1 s (free tier: 60/min), until ~270 s; ~200 symbols per run, so the whole index refreshes daily. `compactMetricResponse` (`lib/stockScores.ts`) keeps selected metrics and series (margins converted to %) and derives the 5-year median P/E and consistency metrics.
   - GET `/api/stocks` runs `scoreUniverse` over all rows (percentiles, 10-minute in-memory cache) and returns the radar list.
   - GET `/api/stocks/[symbol]` returns the full score, metrics and series, plus `getStockDetail`: Finnhub profile, recommendations, earnings and insider transactions, and Yahoo 5-year closes for the stock and `^GSPC` (momentum). Cached 24h in `StockDetailCache` (only when every source succeeded).
   - UI: `app/components/StockRadar.tsx` (tab "Ações") and `StockDetail.tsx`.

---

## 6. Relevant configuration

- **Stock radar env var**: `FINNHUB_API_KEY` (free account at finnhub.io).

- **Alerts env vars**: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (https URL of the app), `CRON_SECRET`. Generate VAPID keys with `npx web-push generate-vapid-keys`.

- **Prisma 7**: `prisma.config.ts` at project root with `defineConfig`, `env("DATABASE_URL")`; schema has no `url` in datasource.
- **Next.js**: `experimental.optimizePackageImports: ["recharts"]` to reduce chart bundle size.
- **Layout**: Bootstrap and Bootstrap Icons imported in layout; content in `container`, sticky navbar, footer and main with `min-vh-100` + flex.
