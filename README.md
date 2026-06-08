# Family Wealth Management System (v1)

Ledger-first household wealth platform with Django/DRF backend and React dashboard.

## Implemented Modules

- `core`: household and member master data
- `instruments`: accounts, instruments, ownership
- `ledger`: immutable transactions with idempotency support
- `valuations`: valuation snapshots for accounts/instruments
- `insights`: holdings, net worth, allocation, XIRR APIs
- `alerts`: SIP mandates and missed SIP detection
- `ingestion`: CSV import batch pipeline with duplicate handling
- `tax`: tax records and basic projection entities

## API Endpoints (v1)

- `POST /api/transactions/`
- `GET /api/holdings?household_id=1&as_of=YYYY-MM-DD`
- `GET /api/networth?household_id=1&as_of=YYYY-MM-DD`
- `GET /api/allocation?household_id=1&as_of=YYYY-MM-DD`
- `GET /api/xirr?household_id=1&as_of=YYYY-MM-DD`
- `GET /api/alerts/missed-sip?household_id=1&as_of=YYYY-MM-DD`
- `POST /api/imports/csv`

## Backend Setup

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver
```

Admin: `http://127.0.0.1:8000/admin/`

## Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

Dashboard: `http://127.0.0.1:5173`

The frontend uses Vite proxy to reach Django APIs at `http://127.0.0.1:8000`.

## Verification

```powershell
.\.venv\Scripts\python.exe manage.py test
cd frontend
npm run build
```

Current test coverage includes:
- immutable transaction guard
- backdated holdings recompute
- XIRR with mixed cashflows
- missed SIP detection
- CSV idempotency duplicate protection
