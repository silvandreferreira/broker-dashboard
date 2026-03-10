# Architecture and structure (technical)

Project structure, APIs, data models, and main flows.

---

## 1. Folder structure (relevant)

```
broker-dashboard/
├── app/
│   ├── api/                    # API Routes
│   │   ├── auth/[...nextauth]/ route.ts   # NextAuth (Google)
│   │   ├── dashboard/          route.ts   # GET dashboard (summary + charts)
│   │   └── files/
│   │       ├── route.ts        # GET file list + activeFileId
│   │       ├── upload/route.ts # POST upload XLSX → parse → DB
│   │       └── select/route.ts # POST set active file
│   ├── components/             # React components
│   │   ├── DashboardCharts.tsx
│   │   ├── FinanzaFooter.tsx
│   │   └── FinanzaNavbar.tsx
│   ├── contexts/
│   │   └── CacheContext.tsx    # In-memory cache (files + dashboard)
│   ├── layout.tsx
│   ├── page.tsx                # Main page (Upload / Dashboard tabs)
│   └── providers.tsx           # SessionProvider + CacheProvider
├── lib/
│   ├── auth.ts                 # authOptions (NextAuth)
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
| GET | `/api/files` | User's file list + `activeFileId`. |
| POST | `/api/files/upload` | Body: FormData with XLSX file. Parses sheet "OPEN POSITION", persists to `UploadedFile` + `Asset`. |
| POST | `/api/files/select` | Body: `{ fileId }`. Marks a file as active (`isActive`) for the user. |
| GET | `/api/dashboard?fileId=...` | Dashboard data: summary, byCategory, byYear, byType, investedVsProfitByYear, investedAndAccByYear, byTicker, byIndexGroup (grouped ETFs via `lib/etfIndexGroups.ts`). |

---

## 3. Data models (Prisma)

- **User, Account, Session, VerificationToken**: standard NextAuth models (Prisma Adapter).
- **UploadedFile**: `id`, `fileName`, `uploadedAt`, `isActive`, `userId`; relation to `Asset[]`.
- **Asset**: per XLSX position: `ticker`, `name`, `category`, `type`, `quantity`, `avgPrice`, `investedValue`, `currentValue`, `profitLoss`, `year`, `fileId`.

The active file is the single `UploadedFile` with `isActive === true` for that `userId` (logic in select and in queries).

---

## 4. Client cache (CacheContext)

- **State**: `files: FilesResponse | null`, `dashboard: Record<fileId, DashboardData>`.
- **Functions**: `loadFiles()`, `loadDashboard(fileId)`, `getDashboardData(fileId)`, `invalidateFiles()`, `updateFilesInCache()`, `clearCache()`.
- **Behaviour**: first request fetches and stores; subsequent requests are served from cache until `clearCache()` or `invalidateFiles()` (and on logout `clearCache()` is called).
- **Integration**: main page and `DashboardCharts` consume the context; navbar calls `clearCache()` on "Limpar cache".

---

## 5. Main flows

1. **Login**: NextAuth Google → callback → session; UI shows Upload / Dashboard tabs.
2. **Upload**: form submits XLSX → `/api/files/upload` → parse with `xlsx` → write to DB → invalidate files cache → `loadFiles()` → switch to Dashboard tab.
3. **File selection**: "Ver na dashboard" → POST `/api/files/select` → update cache with `updateFilesInCache` → open Dashboard tab; dashboard data from cache or `loadDashboard(fileId)`.
4. **Dashboard**: data for active file via GET `/api/dashboard?fileId=...`; result cached by `fileId`; index chart uses `lib/etfIndexGroups.ts`.

---

## 6. Relevant configuration

- **Prisma 7**: `prisma.config.ts` at project root with `defineConfig`, `env("DATABASE_URL")`; schema has no `url` in datasource.
- **Next.js**: `experimental.optimizePackageImports: ["recharts"]` to reduce chart bundle size.
- **Layout**: Bootstrap and Bootstrap Icons imported in layout; content in `container`, sticky navbar, footer and main with `min-vh-100` + flex.
