# Requirements and features (product)

Documentation of **Broker Dashboard** functionality and requirements, organised by product/area.

---

## 1. Authentication and access control

| Requirement | Description |
|-------------|-------------|
| **Google login** | Users sign in via Google account (OAuth). |
| **Session** | After login, the session is maintained; API routes validate the session for data access. |
| **Logout** | "Sign out" option in the menu; on sign out, local cache is cleared so data is not exposed to the next user. |
| **Route protection** | File list, upload, file selection, and dashboard are only available to authenticated users. |
| **Access request** | On first login, non-admin users see a message like “Hello [NAME], your access request has been submitted…” and cannot use the app until approved. |
| **Admin user** | The admin (hard-coded email `silvandreferreira@gmail.com`) is always allowed and sees an extra **Admin** tab. |

---

## 2. File upload (XLSX)

| Requirement | Description |
|-------------|-------------|
| **Format** | Only **XLSX** files (export from XTB broker). |
| **Sheet and columns** | XTB report exported from xStation 5 → History → Export (Excel). Reads sheet **"Open Positions"**; columns used: Ticker, Instrument/Position, Category, Type, Volume, Value, Open price, Open time (UTC), Gross Profit. Only lot rows (Type = BUY/SELL) are read; per-ticker summary rows are used only for category and name. |
| **Investment plans** | Lots are tagged with their Product (**My Trades** or **Investment Plan**, column `Asset.product`). A **"Incluir planos de investimento"** switch on the dashboard (default **on**) includes/excludes plan lots in all figures and charts. The choice is kept in `sessionStorage` for the browser session (survives reloads, not "Limpar cache") and resets to on at logout. Old uploads (no product) count as My Trades. |
| **ETFs only** | Only instruments with Category **ETF** are imported. Stocks, ETCs, etc. are ignored (listed in the upload response as `skippedTickers`). |
| **Values** | Current value = `Value`; profit = `Gross Profit`; invested = `Value − Gross Profit` (always in account currency, even for instruments quoted in USD). |
| **One file per year** | The intended use is one XTB export per year; the user picks which file the dashboard shows. |
| **Year** | The year of each lot is derived from the **"Open time (UTC)"** field. |
| **Persistence** | Data is stored in the database (tables `UploadedFile` and `Asset`). The binary file is **not** stored. |
| **Feedback** | During upload, the button shows a loading state; on error, a message is shown to the user. |
| **Post-upload** | On successful upload, the file list is refreshed and the user is redirected to the Dashboard tab. |

---

## 3. File list and active file

| Requirement | Description |
|-------------|-------------|
| **List** | List of all XLSX files uploaded by the user, with name, upload date, and number of rows (assets). |
| **Active file** | A single file can be marked as **active**; the Dashboard uses only that file’s data. After deleting the active file, the most recently uploaded remaining file becomes active automatically. |
| **"Active" tag** | The currently selected file displays an **"ativo"** badge next to its name. |
| **Dashboard button** | Button per file to make it the active source for the dashboard; when active, it appears as a blue **Dashboard** button with bar-chart icon. |
| **Button behaviour** | On click: button shows loading (progress bar that fills the button), is disabled to prevent double clicks, and on completion opens the Dashboard tab automatically. |
| **Delete file** | Each file has a **Delete** button that removes the file and all related data from the database (only that user’s data). |
| **Mobile layout** | On small screens: file name (truncated with "..."), active tag, date/rows, and buttons stacked in a column; name with visual limit and ellipsis; even left/right margins. |

---

## 4. Dashboard (views and charts)

| Requirement | Description |
|-------------|-------------|
| **Data source** | All values and charts are based on the selected **active file**, **ETFs only** (assets with category `ETF`). Files uploaded with the old parser (no category) show a message asking to re-upload. |
| **Summary** | Block with: Number of ETFs (distinct tickers), Total units, Total Invested, Total ACC, Total €€, Profit %. |
| **Total ACC** | Defined as **Total €€ − Total Invested** (current value minus capital invested). |
| **Charts** | (a) Percentage by index (ETFs grouped); (b) % profit by purchase year (current profit of lots bought in each year); (d) Invested vs profit by year; (e) Accumulated invested vs portfolio value at each year end (ACC = gap between lines; from `/api/dashboard/history`, Yahoo prices); (f) Units per ETF table (name, ticker, units, invested, value, profit), sorted by value. |
| **Grouped ETFs** | "Percentage by index (ETFs grouped)" chart: ETFs tracking the same index (e.g. SXR8 + VUAA → S&P 500) are grouped; mapping configurable in code (e.g. S&P 500, MSCI World, All-World, MSCI Europe (IMAE), Emerging Markets (IS3N, EIMI), US Tech). |
| **Portfolio evolution (monthly / yearly)** | Estimated with **Yahoo Finance** daily closes (in EUR). Monthly chart for the report's year (value vs invested, monthly return %) and yearly return chart from the first lot's year. Gain (€) = value_end − value_start − contributions. Return (%) = **time-weighted return** chained daily: r_day = (V_day − V_prev − C_day) / (V_prev + C_day), period return = Π(1 + r_day) − 1, so the timing/size of contributions does not distort it. Values may differ slightly from XTB (price time / exchange) — accepted. Only lots still open in the report are included. A table view is available. |
| **Yearly files** | The year of a file is the year of its report date ("Data as of report generated"). |
| **No active file** | If no file is selected, the Dashboard shows a message asking the user to choose a file in the Upload XLSX tab. |

---

## 5. Cache and performance

| Requirement | Description |
|-------------|-------------|
| **Client-side cache** | Each server request (file list and dashboard data per file) is made **only once** per session; data is reused from in-memory cache. |
| **Clear cache** | **"Limpar cache"** option in the menu (navbar) to invalidate the cache and force new server requests when the user expects new data. |
| **Static data** | Loaded data is treated as static until the user clears the cache or performs an invalidating action (e.g. new upload). |

---

## 6. Interface and layout (Finanza)

| Requirement | Description |
|-------------|-------------|
| **Layout** | **Finanza** layout with Bootstrap 5: sticky navbar (Finanza), main content, and footer. |
| **Navbar** | Brand "Finanza", login/logout, "Limpar cache" (when authenticated), and an **Admin** tab visible only for the admin user; collapsible on mobile. |
| **Footer** | Footer with Finanza name and year. |
| **Tabs** | Tabs: **Upload XLSX** (upload form and file list), **Dashboard** (summary and charts), and **Admin** (access management) for admin. |
| **Styling** | Components use Bootstrap 5 classes (container, cards, nav-tabs, buttons, forms, alerts, list-group). Bootstrap Icons for icons. |
| **Responsiveness** | Mobile-friendly behaviour (file list in column, dashboard and delete buttons below, truncated text with "..."). |

---

## 7. Optimisations (Lighthouse / UX)

| Requirement | Description |
|-------------|-------------|
| **Unused JavaScript** | Dashboard (Recharts) is loaded on demand (lazy load) when opening the Dashboard tab; reduces initial JavaScript. |
| **Minified CSS** | Use of minified third-party CSS (Bootstrap, Bootstrap Icons) where available. |
| **Packages** | Recharts import optimisation via Next.js config to reduce bundle size when the Dashboard loads. |

---

## 8. Mobile app (PWA) and updates

| Requirement | Description |
|-------------|-------------|
| **Installable** | Web app manifest (`app/manifest.ts`), icons in `public/icons/` (192, 512, maskable 512, Apple 180), theme colour `#0d6efd`, standalone display. Install via "Add to Home Screen" (iPhone, Safari) or "Install app" (Android, Chrome). |
| **Service worker** | `public/sw.js`: pages network-first with `/offline.html` fallback; hashed static files cache-first; **`/api/*` is never cached** (personal data and login). Registered only in production. |
| **New version banner** | Build id (git SHA) baked into the bundle and exposed at `/api/version`; when a newer deploy is live, a banner offers to reload (checked on focus, visibility and every 5 min). |

## 9. Market drop alerts (push notifications)

| Requirement | Description |
|-------------|-------------|
| **Rule** | Alert when an ETF's current price is **more than 10% below its highest daily close of the last 52 weeks** (in the ETF's own currency, no FX). |
| **Schedule** | Weekdays at **9h, 12h and 14h Lisbon time**. Vercel Hobby crons may fire at any minute within the hour. Each drop is notified **once**, when the ETF first crosses −10%; it can alert again only after recovering to less than 8% below the high (avoids repeats around the threshold). The notification lists each newly dropping ETF and its % below the high. |
| **Watchlist (config)** | "Alertas" tab. Created automatically from the ETFs in the **last uploaded file**; ETFs that appear in later uploads are added switched on; each ETF can be switched off. ETFs no longer in the last file are flagged. |
| **Devices** | Web Push to the installed PWA (iPhone needs iOS 16.4+ and the app added to the Home Screen) or any supporting browser. "Ativar notificações", "Enviar teste" and "Desativar" per device. |
| **Live view** | "Verificar agora" shows price, 52-week high (with date) and % from the high for every watched ETF. |

## 10. Stock radar (S&P 500, inspired by Clareza)

| Requirement | Description |
|-------------|-------------|
| **Universe** | The 503 S&P 500 companies (`lib/sp500.ts`, GICS sector and sub-industry). Separate from the portfolio, which stays ETF-only. |
| **Scores** | Two 0–100 scores, as percentiles against the rest of the S&P 500. **Quality** = Profitability 35% (ROIC, net and gross margin), Growth 25% (3-year revenue and EPS CAGR, TTM revenue growth), Balance sheet 25% (debt/equity, current ratio, interest coverage; not applied to Financials), Consistency 15% (years with EPS growth and with profit, net-margin stability). **Valuation** (100 = cheapest) = P/E vs its own 5-year median 35%, P/E vs sector median 25%, PEG 20%, FCF yield 20%. A score needs at least 2 pillars. Own formula; it does not match Clareza's. |
| **Radar** | "Ações" tab: card per stock with style (Growth if 3Y revenue CAGR ≥ 10%, REIT for Real Estate, otherwise Value), a one-line reading (e.g. "Excelente negócio a um preço atrativo."), Valuation and Quality with labels. Filters Todas/Growth/Value/REIT, Quality level and Valuation level (default: Excelente + Muito barato, with "Ver todas" to clear), search, sort by opportunity/cheapest/quality/market cap. Each card shows the current share price and day change (Yahoo "spark", 20 symbols per request, cached 15 min). |
| **Detail** | Header (country, exchange, market cap, price, 52-week range, tags), both scores with pillars and indicators, momentum vs S&P 500 (1M/3M/1Y/3Y), analyst consensus (buy/hold/sell), EPS actual vs estimate (Bateu/Falhou), annual/quarterly charts (gross and net margin, EPS, P/E, P/B), TTM ratios, insider purchases and sales (12 months). |
| **Not included** | Price targets and revenue by segment (paid on Finnhub), DCF, AI summaries and daily market report. |
| **Disclaimer** | Shown in the tab: a tool to filter ideas, not a buy recommendation. |

## 11. Reinforce (ETF timing signals)

| Requirement | Description |
|-------------|-------------|
| **ETFs** | The ETFs of the last uploaded file (same list as the drop alerts). |
| **Score** | 0–100, higher = better moment to buy more, relative to the ETF's own history: drop from the 52-week high 30% (0% → 0, −20% → 100), distance to the 200-day average 25% (+10% → 0, −10% → 100), 14-day RSI 15% (70 → 0, 30 → 100), position in the 1-year range 10%. For S&P 500 ETFs (SXR8, VUAA, SPYL, CSPX, VUSA) and the S&P 500 IT ETF (QDVE), the index P/E vs its 5-year median 20% (+20% → 0, −20% → 100), computed from the stock radar data (cap-weighted harmonic mean, P/E outside 3–500 ignored). Missing signals are left out and weights renormalised. |
| **Labels** | ≥70 "Boa altura para reforçar", ≥55 "Altura favorável", ≥40 "Neutro", ≥25 "Pouco favorável", otherwise "Caro face ao histórico". |
| **Legend** | A "Como ler a nota" box above the cards explains each label range in plain words. |
| **Card** | Score, label, one-line reading, price, annual management cost (TER, from `lib/etfTer.ts`; add new ETFs there), drop-alert badges; detail with each signal, 1M/3M/1Y returns, index P/E history and a 1-year price vs 200-day average chart. |
| **Disclaimer** | Shows discounts against history; does not predict the future. |

## Summary by area

| Area | Main deliverables |
|------|--------------------|
| **Authentication** | Google login, session, logout, access request gating, admin override |
| **Upload** | XTB XLSX, Open Positions sheet, ETFs only, data in DB, no file on disk |
| **Files** | List, active file, Dashboard button with loading and tab switch, delete & auto-select latest after delete |
| **Dashboard** | Summary (incl. number of ETFs), 6 charts + monthly/yearly evolution, ETFs grouped by index |
| **Cache** | In-memory cache, single requests, "Limpar cache" option |
| **UI** | Finanza layout (Bootstrap 5), navbar, footer, tabs (incl. Admin), mobile-first |
| **Alerts** | Push notifications on weekdays at 9h/12h/14h when an ETF is >10% below its 52-week high; watchlist from the last upload |
| **Stock radar** | S&P 500 quality and valuation scores, radar with filters, detail page with analysts, earnings, insiders and financial history (Finnhub) |
| **Reinforce** | Per-ETF "good moment to buy more" score from price signals and, for S&P 500 ETFs, index valuation |
| **Performance** | Lazy load Dashboard, minified CSS, optimizePackageImports |
