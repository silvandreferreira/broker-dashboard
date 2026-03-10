# Technologies and stack (technical)

Stack and tools used in **Broker Dashboard**.

---

## 1. Runtime and framework

| Technology | Version | Use |
|------------|---------|-----|
| **Node.js** | (runtime) | Project and script execution. |
| **Next.js** | 16.1.6 | React framework: App Router, SSR, API Routes, build optimisations. |
| **React** | 19.2.3 | User interface (components, state, hooks). |
| **TypeScript** | ^5 | Static typing across the project. |

---

## 2. Authentication

| Technology | Version | Use |
|------------|---------|-----|
| **NextAuth.js** | ^4.24.13 | Authentication (Google OAuth), session, route protection. |
| **@next-auth/prisma-adapter** | ^1.0.7 | Persistence of users, accounts, and sessions in the DB via Prisma. |

Central config in `lib/auth.ts` (`authOptions`); API route at `app/api/auth/[...nextauth]/route.ts`. All API routes that depend on the user use `getServerSession(authOptions)`.

---

## 3. Database and ORM

| Technology | Version | Use |
|------------|---------|-----|
| **PostgreSQL** | (external) | Database (users, files, assets). |
| **Prisma** | ^7.4.2 | ORM: schema, migrations, typed client. |
| **@prisma/adapter-pg** | ^7.4.2 | Prisma adapter for PostgreSQL (driver `pg`). |
| **pg** | ^8.13.1 | Node.js driver for PostgreSQL. |

- **Prisma 7**: datasource without `url` in schema; configuration in `prisma.config.ts` with `defineConfig` and `env("DATABASE_URL")`.
- **Generator**: `prisma-client`, output in `prisma/generated/prisma/client`.
- Shared client in `lib/prisma.ts` (import of generated client).

---

## 4. UI and styling

| Technology | Version | Use |
|------------|---------|-----|
| **Bootstrap** | ^5.3.8 | Layout and components (navbar, cards, tabs, buttons, forms, alerts). |
| **Bootstrap Icons** | ^1.13.1 | Icons (minified: `bootstrap-icons.min.css`). |

Global import in `app/layout.tsx`: `bootstrap.min.css` and `bootstrap-icons/font/bootstrap-icons.min.css`. Bootstrap JavaScript is not used (navbar collapse is controlled by React state).

---

## 5. Charts and dashboard data

| Technology | Version | Use |
|------------|---------|-----|
| **Recharts** | ^3.8.0 | Charts (Pie, Bar, Line) in the Dashboard component. |

Loaded on demand via `next/dynamic` (lazy load) in `DashboardCharts`; bundle optimisation with `experimental.optimizePackageImports: ["recharts"]` in `next.config.ts`.

---

## 6. File parsing

| Technology | Version | Use |
|------------|---------|-----|
| **xlsx** | ^0.18.5 | Reading XLSX files on upload (sheet "OPEN POSITION", columns and "Open time"). |

Used only in API route `app/api/files/upload/route.ts` (server).

---

## 7. Development tools

| Technology | Use |
|------------|-----|
| **ESLint** | Linting (eslint-config-next). |
| **Tailwind CSS** | ^4 (dev) — present in the project; main UI is Bootstrap. |
| **PostCSS** | CSS pipeline (Next.js / Tailwind). |

---

## 8. Configuration and environment

| File / concept | Use |
|----------------|-----|
| **.env** | Variables: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. |
| **prisma.config.ts** | Prisma 7 configuration (datasource, schema, migrations). |
| **next.config.ts** | Next.js configuration (e.g. `experimental.optimizePackageImports`). |

---

## Stack summary

```
Frontend:     Next.js 16 (App Router) + React 19 + TypeScript + Bootstrap 5 + Bootstrap Icons + Recharts
Backend:      Next.js API Routes + NextAuth + Prisma 7 + PostgreSQL
Upload/Parse: xlsx (XLSX)
Auth:         NextAuth (Google OAuth) + Prisma Adapter
```
