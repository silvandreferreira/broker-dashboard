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
| POST | `/api/files/upload` | Body: FormData with XLSX file. Parses sheet "OPEN POSITION", persists to `UploadedFile` + `Asset`; only allowed for approved users or admin. |
| POST | `/api/files/select` | Body: `{ fileId }`. Marks a file as active (`isActive`) for the user; only allowed for approved users or admin. |
| POST | `/api/files/delete` | Body: `{ fileId }`. Deletes the file and its assets, then marks the most recently uploaded remaining file as active (if any). |
| GET | `/api/dashboard?fileId=...` | Dashboard data: summary, byCategory, byYear, byType, investedVsProfitByYear, investedAndAccByYear, byTicker, byIndexGroup (grouped ETFs via `lib/etfIndexGroups.ts`); only for approved users or admin. |
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
- **Asset**: per XLSX position: `ticker`, `name`, `category`, `type`, `quantity`, `avgPrice`, `investedValue`, `currentValue`, `profitLoss`, `year`, `fileId`.

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
   - Form submits XLSX → `/api/files/upload` → parse with `xlsx` (sheet OPEN POSITION) → write to DB as `UploadedFile` + `Asset`.
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

## 6. Relevant configuration

- **Prisma 7**: `prisma.config.ts` at project root with `defineConfig`, `env("DATABASE_URL")`; schema has no `url` in datasource.
- **Next.js**: `experimental.optimizePackageImports: ["recharts"]` to reduce chart bundle size.
- **Layout**: Bootstrap and Bootstrap Icons imported in layout; content in `container`, sticky navbar, footer and main with `min-vh-100` + flex.
