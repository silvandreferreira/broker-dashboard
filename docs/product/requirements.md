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
| **Sheet and columns** | Reads sheet **"OPEN POSITION"**; columns used: Symbol, Volume, Open price, Market price, Purchase value, Gross P/L. |
| **Year** | The year of each position is derived from the **"Open time"** field. |
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
| **Data source** | All values and charts are based on the selected **active file**. |
| **Summary** | Block with: Total Units (2 decimal places), Total Invested, Total ACC, Total €€, Profit %. |
| **Total ACC** | Defined as **Total €€ − Total Invested** (current value minus capital invested). |
| **Charts** | (a) Percentage by index (ETFs grouped); (b) % profit by year; (c) Investment type (ETFs, stocks, etc.); (d) Invested vs profit by year; (e) Accumulated invested vs ACC by year; (f) Units by ticker. |
| **Grouped ETFs** | "Percentage by index (ETFs grouped)" chart: ETFs tracking the same index (e.g. SXR8 + VUAA → S&P 500) are grouped; mapping configurable in code (e.g. S&P 500, MSCI World, All-World, MSCI Europe, Emerging Markets, US Tech). |
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

## Summary by area

| Area | Main deliverables |
|------|--------------------|
| **Authentication** | Google login, session, logout, access request gating, admin override |
| **Upload** | XLSX, OPEN POSITION sheet, data in DB, no file on disk |
| **Files** | List, active file, Dashboard button with loading and tab switch, delete & auto-select latest after delete |
| **Dashboard** | Summary (incl. Total Units 2 dec.), 6 charts, ETFs grouped by index |
| **Cache** | In-memory cache, single requests, "Limpar cache" option |
| **UI** | Finanza layout (Bootstrap 5), navbar, footer, tabs (incl. Admin), mobile-first |
| **Performance** | Lazy load Dashboard, minified CSS, optimizePackageImports |
