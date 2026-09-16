# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Family Wealth Management System — a ledger-first household finance platform. Django/DRF backend (SQLite), React 19 + TypeScript + Tailwind v4 frontend (Vite), served together on PythonAnywhere in production via Django serving `frontend/dist`.

## Commands

Always use the repo's venv (`.venv`), not a global Python.

**Preferred: use the dev server script** rather than starting servers manually — it manages both backend (port 8000) and frontend (port 5173) with PID files/logs under `.dev-server/` (gitignored):

```powershell
scripts\dev-server.ps1 status    # check before starting — don't double-start
scripts\dev-server.ps1 start
scripts\dev-server.ps1 stop      # always stop when done
scripts\dev-server.ps1 restart
```

Backend: `http://127.0.0.1:8000` (admin at `/admin/`). Frontend: `http://127.0.0.1:5173`, proxies `/api` to the backend (see `frontend/vite.config.ts`).

**Backend (manual, if not using the script):**
```powershell
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver
.\.venv\Scripts\python.exe manage.py test                       # full suite
.\.venv\Scripts\python.exe manage.py test insights.tests.InsightsServiceTests   # single test class
.\.venv\Scripts\python.exe manage.py test insights.tests.InsightsServiceTests.test_name  # single test
```
Python deps: install only inside `.venv`, never globally.

**Frontend:**
```powershell
cd frontend
npm run dev       # vite dev server
npm run build     # tsc -b && vite build — REQUIRED before any deploy, see below
npm run lint
npm run preview
```

**Deploy** (`deploy.sh`, run on PythonAnywhere from repo root): pulls `main`, `pip install`, `migrate`, `collectstatic`. It does **not** run `npm run build`. `frontend_views.py` serves `frontend/dist/index.html` directly, so `frontend/dist` must be rebuilt and committed *before* pushing to `main` — otherwise deploy serves a stale bundle. `frontend/dist` is checked into git (not gitignored).

## Architecture

### Backend: Django apps, ledger-first design

Settings are split: `finance_system/settings/base.py` (shared) + `local.py` (dev, loads `.env`, `DEBUG=True`) / `production.py`. `manage.py` defaults to `local`.

Apps, roughly in dependency order:
- `core` — `Household`, `Member`, `UserProfile` (role/status-gated auth via Google OAuth + `IsApprovedUser`/`IsSuperAdmin` permissions), `IntegrationCredential` (Fernet-encrypted secrets for Gmail/Upstox), `EncryptedTextField`.
- `instruments` — `Account`, `Instrument` (type-level shell for FD/bond/MF/equity/etc.), `Investment` (specific holding under an instrument — only used where an instrument represents a shared type like a mutual fund; FD/bond instruments are identified directly), `*Details` models (FD/Bond/MutualFund), ownership splits (`AccountOwnership`, `InstrumentOwnership`), `AllocationTarget`, `FundHoldingsSnapshot`/`FundHolding`.
- `ledger` — `Transaction` is the immutable source of truth: `save()` raises if `pk` is already set, so transactions can never be edited, only created (and presumably reversed/deleted at the DB layer where needed). Every transaction carries `direction`, `transaction_type`, `classification` (spend/income/internal_transfer/tracking — drives budgeting), and `affects_balance` (for txns recorded against an account that never actually held the money, e.g. payroll-deducted NPS). `Tag` is a free-form many-to-many label, distinct from the single `spend_category`.
- `valuations` — point-in-time valuation snapshots for accounts/instruments; holdings/net-worth are derived by replaying transactions + latest valuations as-of a date, not stored directly.
- `insights` — the analytics layer: holdings, net worth, allocation, XIRR, rebalancing, diversification/overlap, spend analytics, fund performance. Business logic lives in `insights/services.py` (several service classes, one per concern) and `insights/overlap.py`/`allocation_templates.py`; views are thin.
- `alerts` — SIP/RD mandates and missed-installment/premium/coupon detection.
- `ingestion` — the generic CSV import pipeline (`universal_importer.py`) plus source-specific preview/apply flows (Groww, FD advice notes, NPS, EPF passbook, PPF statements, SBI statements) — all follow a **preview-then-apply** pattern (parse and show proposed rows first, apply only on explicit confirmation) with idempotency-key based duplicate protection.
- `gmail_ingestion`, `sms_ingestion`, `upstox_integration` — external data connectors, each with their own OAuth/credential flow and a staged-review workflow (fetched data lands in a "staged" state for user approve/reject/edit before becoming real ledger entries) — mirrors the ingestion preview/apply pattern for live sources.
- `tax`, `expenses`, `insurance`, `networth_tree`, `reports`, `fund_data`, `ai_insights` — supporting domains (tax records/projections, expense categorization, insurance policies/claims, a freeform net-worth tree view, PDF statement export, external fund NAV data, and Gemini-backed fund classification/rebalancing explanations respectively).

All API routes are wired centrally in `finance_system/api_urls.py` under `/api/` — a `DefaultRouter` for CRUD ViewSets plus explicit `path()` entries for action-style endpoints (imports, alerts, staged-review actions, OAuth callbacks, AI endpoints). When adding a new endpoint, register it here. Note the ordering comment there: custom paths like `instruments/bulk-delete/` must be listed *before* `router.urls` or the router's `<pk>` detail route swallows them.

Auth is session-based (Google OAuth via `social-auth-app-django`), gated by `core.permissions.IsApprovedUser` (approved users get read access; write access requires `admin`/`super_admin` role) — this is the default DRF permission class for the whole API.

### Frontend: React + hash routing, no router library

`App.tsx` implements routing itself via `window.location.hash` (`#/route-name`) against a `RouteKey` union — no react-router. Adding a page means: add to `RouteKey`/`VALID_ROUTES`, add a case in `renderPage()`, add a nav entry in `AppLayout`. Legacy route redirects (renamed pages) go in `LEGACY_ROUTE_REDIRECTS`.

State is split across context providers wrapped around the whole app: `AuthProvider` (session/user), `AppProvider` (household-scoped: households/members/accounts/instruments lists — only mounted once authenticated+approved), `ThemeProvider`, `TermsProvider`, `ToastProvider`, `PrivacyProvider`.

API layer: `frontend/src/api/*.ts`, one file per domain, all built on `frontend/src/api/http.ts`. `http.ts` handles CSRF (`ensureCsrfCookie()` fetches `GET /api/csrf/` to seed the `csrftoken` cookie, then every mutating call reads it back and sends `X-CSRFToken`) and `credentials: 'include'` for session cookies on every request. `frontend/src/api.ts` is a deprecated stub — don't add to it.

Almost every page/component takes `householdId` and pre-loaded option lists (`memberOptions`, `accountOptions`, `instrumentOptions`, `canDelete`) as props from `App.tsx`/`AppContext` rather than fetching them itself.

## Cross-cutting notes

- **CSRF/CORS are hardcoded to port 5173** in `settings/local.py` (`CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`). If Vite falls back to another port (5173 already in use), writes will fail with silent CSRF 403s — kill whatever's holding 5173 rather than letting Vite pick a different port.
- Never put real secrets in `.env.example` — only blank/fake placeholders. Real values go in `.env` (gitignored).
- Don't set `overflow-x: hidden` on `html`/`body` in frontend CSS — it breaks Chrome wheel/keyboard scroll. Use `overflow-x: clip` on a wrapper div instead.
- `db.sqlite3*` backup files and `backup/` in the repo root are local dev artifacts, not fixtures — don't treat them as canonical schema/data references.
