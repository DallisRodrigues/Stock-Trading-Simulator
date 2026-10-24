# Zerodha Clone — MERN Paper-Trading Platform
Live link:https://zerodha-clone-f098.onrender.com

A full-stack stock-trading **simulator** inspired by Zerodha's Kite:

- **Landing site** (`frontend/`): marketing pages plus signup and login.
- **Trading dashboard** (`dashboard/`): watchlist, simulated buy/sell orders, holdings, intraday positions, virtual funds, portfolio analytics and stock research.
- **REST + WebSocket API** (`backend/`): Express 5, MongoDB/Mongoose, JWT cookie sessions, and Socket.IO.
- **Market data**: live US-equity prices from **Finnhub's free plan**, with a WebSocket trade stream and REST quotes.

> **Simulation only.** All cash is virtual. Orders fill instantly at the backend's latest quote and are never sent to a broker or exchange. When no Finnhub key is configured, the app runs on fixed **sample prices**, and every price is labelled "Sample data".

---

## Highlights

- **Try the demo with one click.** Visitors get an isolated, temporary account with a sample portfolio (holdings, an open limit order, an alert and two watchlists). It's deleted after 24 hours or on logout.
- **Market, limit and stop orders.** A server-side matching engine fills resting orders when live prices cross the order price, and reserves the needed cash or shares while the order is open.
  - Day orders expire at the 4 pm New York close; good-till-cancelled (GTC) orders last 90 days.
  - Open orders never fill while the market is closed.
  - A fill can't happen twice: claiming an order to fill it is an atomic update.
- **Price alerts and notifications.** Above/below-price and day-change alerts are checked on the server. Fills, expiries, rejections and triggered alerts are pushed instantly over Socket.IO to a notification bell.
- **Quality of life:**
  - up to 5 named watchlists (Kite-style numbered tabs), with drag-and-drop or keyboard reordering
  - trade-journal notes on orders
  - a **Ctrl/⌘+K command palette**
  - performance vs the S&P 500 (a time-weighted return, so deposits aren't counted as gains)
  - dark mode
  - CSV export
- **Deployable as one service.** The API can also serve both frontends from one origin. A Dockerfile, `compose.yaml`, a Render blueprint (`render.yaml`), GitHub Actions CI with image publishing, and [DEPLOYMENT.md](DEPLOYMENT.md) are included.

## Analytics & charts

All charts are built from real data the app has. Nothing is simulated, and there is no back-filled price history.

| Where | What |
|---|---|
| **Dashboard home** | Watchlist heatmap (tiles coloured by today's % change), top gainers and losers |
| **Watchlist** | "Today's change" bar chart for every watched symbol |
| **Holdings** | Invested vs current value per holding; allocation doughnut |
| **Analytics page** | KPIs (account value, today's / unrealized / realized P&L, diversification as the effective number of positions, value-weighted beta) · allocation by holding (with or without cash) · sector exposure · P&L by holding · invested vs current · stock returns over 5D / MTD / 3M / 6M / YTD / 1Y · account-value history · cumulative realized P&L · 30-day trading activity |
| **Stock detail** (Analytics button on any watchlist row, a heatmap tile, a mover or a holding) | **Overview:** profile and logo; day range and 52-week range bars; P/E, EPS, beta, dividend yield, ROE, net margin, average volume; your position; price returns; monthly analyst recommendations; clickable peers. **Chart:** prices received this session. **Fundamentals:** annual or quarterly EPS; gross, operating and net margins. **News:** the last 7 days of company news. |
| **Orders** | Executed / Open / Cancelled-expired tabs; cancel open orders; journal notes; filter by side and symbol; CSV export |
| **Alerts** | Active alerts with live prices, plus triggered history |

Every chart card has a **Chart / Table** toggle, so values never depend on hover or colour alone. Every chart also states its data source.

Account-value history comes from snapshots the app records after every order or funds transfer, and at most every 10 minutes otherwise. Snapshots are kept for 180 days. The history therefore starts when you start using the app.

Company data comes from Finnhub's profile, metrics, recommendation, peers and company-news endpoints. It's cached in MongoDB (profile and peers for 7 days, metrics and recommendations for 24 hours, news for 1 hour). A single analytics request may make at most 6 provider calls per data type, so page views stay inside the 60 calls/min budget.

In demo mode, the sector and 52-week-range values are sample data and are labelled as such. Period returns, fundamentals, recommendations and news show "needs FINNHUB_API_KEY" instead of invented values.

## Architecture

```
 Browser (landing :5173)        Browser (dashboard :5174)
        │  fetch (cookies)              │  axios (cookies)     │ Socket.IO (cookie auth)
        └──────────────┬────────────────┴──────────────────────┘
                       ▼
            Express API + Socket.IO  (:3002)
            ├─ /api/auth       signup · login · logout · me · session
            ├─ /api/watchlist  per-user symbols (max 50)
            ├─ /api/orders     simulated market orders (idempotent)
            ├─ /api/holdings   /api/positions   /api/funds
            ├─ /api/market     quotes · search · status · session history · company · news
            ├─ /api/portfolio/analytics
            ├─ /api/watchlists  named lists (≤5 × 50 symbols)
            ├─ /api/alerts · /api/notifications
            ├─ order engine     fills LIMIT/STOP orders + checks alerts on every quote (throttled) and a 15 s sweep
            ├─ /app, /          built dashboard + landing site when SERVE_STATIC=on
            └─ market data service
                 ├─ ONE Finnhub WebSocket (≤ 50 symbols, backoff + jitter, idle detection)
                 ├─ Finnhub REST /quote, /search, /stock/market-status (rate-budgeted)
                 └─ bounded in-memory quote cache → Socket.IO rooms per symbol
                       │
                       ▼
                 MongoDB (users · holdings · orders)
```

- The Finnhub key **never leaves the backend**. Browsers get normalized quotes over Socket.IO and never connect to Finnhub themselves.
- Quotes carry an explicit `status`, which the UI displays as a label:

  | Status | Meaning |
  |---|---|
  | `live` | streamed trades |
  | `snapshot` | REST quote |
  | `closed` | market closed; last price |
  | `stale` | not refreshed recently |
  | `demo` | sample data |
  | `unavailable` | no price available |

- Change and % change are computed only when Finnhub provides a previous close. They are never invented.

## Market data: Finnhub free plan

The following was checked on 2026-10-23 against https://finnhub.io/pricing and https://finnhub.io/docs/api:

| Capability | Free plan | How the app uses it |
|---|---|---|
| REST rate limit | 60 calls/min (+ 30/s cap; HTTP 429 when exceeded) | Client-side budget of 50/min, request de-duplication, caching, back-off after 429 |
| WebSocket trades (US stocks) | Available, **50 symbols**, **1 connection per API key** | One upstream connection. It subscribes to SPY, QQQ, then held symbols, then watchlist symbols, capped at 50. The rest fall back to REST polling. |
| `/quote` | Available (`c`, `d`, `dp`, `h`, `l`, `o`, `pc`, `t`) | Initial and refresh snapshots; previous close for change % |
| `/search`, `/stock/market-status` | Available | Watchlist symbol search; market open/closed label |
| `/stock/profile2`, `/stock/metric`, `/stock/recommendation`, `/stock/peers`, `/company-news` | Available (each verified with a free key) | Sector exposure, key stats, 52-week range, period returns, EPS and margin history, analyst trends, peers, news |
| Candles (OHLCV), tick history | **Premium** | **Not used.** The Analytics chart only plots prices the server actually received this session and says so. |
| License | "Personal Use. Terms apply" | Fine for a local demo. Check Finnhub's terms before any public or commercial deployment. |

Webhooks and the `X-Finnhub-Secret` header aren't needed and aren't used.

**Verify your key** with one quote call, one market-status call and a 15-second stream test. The key itself is never printed.

```bash
npm run check:finnhub
```

## Quick start

Prerequisites: **Node.js ≥ 22** (tested on 24) and either MongoDB Community (`mongod`) installed locally or a MongoDB Atlas URI.

```bash
# 1. Install everything (root tools + backend + frontend + dashboard)
npm run install:all

# 2. Configure the backend
cp backend/.env.example backend/.env      # then edit: MONGODB_URI, JWT_SECRET, FINNHUB_API_KEY
#    (frontend/.env.example and dashboard/.env.example are optional; defaults match the ports below)

# 3a. Run against the MONGODB_URI in backend/.env
npm run dev
# 3b. …or run against a private local mongod (data in backend/.mongo-data), ignoring MONGODB_URI
npm run dev:local
```

Open http://localhost:5173 and sign up. You land on the dashboard at http://localhost:5174 with $100,000 of virtual cash and a starter watchlist.

| Service | URL |
|---|---|
| Landing site | http://localhost:5173 |
| Dashboard | http://localhost:5174 |
| API health | http://localhost:3002/api/health |

The database starts empty and there's nothing to seed: each signup creates its own user, watchlist and cash balance. Data is stored in the `zerodha_clone` database, which you can change with `MONGODB_DB_NAME`.

### Run with Docker

```bash
docker compose up -d --build   # app + local MongoDB on http://localhost:3002
```

Compose reads your Finnhub key and JWT secret from `backend/.env`, but always uses its own local MongoDB container. See [DEPLOYMENT.md](DEPLOYMENT.md) for deploying to Render or any other container host.

## Pushing to GitHub

`.env` files, `node_modules`, build output, test reports and local database files are all git-ignored.

```bash
git add -A
git status                     # confirm no .env or node_modules is listed
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

After pushing, GitHub Actions runs the CI workflow and publishes the Docker image to `ghcr.io/<you>/<repo>`.

## Scripts (repository root)

| Command | What it does |
|---|---|
| `npm run dev` / `npm run dev:local` | API + landing + dashboard with hot reload |
| `npm run build:single` / `npm run start:single` | Build both frontends for one origin (`/` and `/app`), then serve everything from the API |
| `npm run build` | Production builds of `frontend/` and `dashboard/` |
| `npm test` | Backend tests (Vitest + Supertest + in-memory MongoDB) and dashboard tests (Vitest + Testing Library) |
| `npm run test:e2e` | Playwright + Chromium end-to-end suite against production builds (see below) |
| `npm run lint` | Oxlint for both frontends |
| `npm run check:finnhub` | Live check of the configured Finnhub key |

Run `npx playwright install chromium` once before the first e2e run.

### How the tests stay isolated

- Backend tests and the e2e API server run on **`mongodb-memory-server`**, a throwaway database that never touches `MONGODB_URI`. They use the system `mongod` when one is on `PATH`; otherwise the package downloads a binary.
- E2E uses the **demo** market data provider, so results are deterministic and need no API key. It runs on separate ports (3102/5183/5184), so it doesn't clash with dev servers.
- The Finnhub REST and WebSocket adapters are tested against a fake `fetch` and a fake WebSocket. Those tests cover normalization, rate limiting, 429/401 handling, reconnect backoff and jitter, idle detection, and the subscription cap.

## Configuration

`backend/.env` holds all variables, documented in [`backend/.env.example`](backend/.env.example):

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | yes | `MONGO_URL` (the original variable name) is still accepted |
| `JWT_SECRET` | production | ≥ 32 chars; in development a random one is generated per run |
| `FINNHUB_API_KEY` | for real data | Backend only. Without it, prices are labelled sample data. |
| `MARKET_DATA_PROVIDER` | no | `finnhub` or `demo` |
| `TRUST_PROXY` | production | Number of proxy hops in front of the app (usually `1`), so rate limits see real client IPs |
| `SERVE_STATIC` | no | `on` to serve the built frontends from the API |
| `GUEST_DEMO`, `GUEST_TTL_HOURS`, `MAX_GUEST_ACCOUNTS` | no | One-click demo accounts (on, 24 h, at most 300 at once) |
| `COOKIE_SAMESITE` | no | `lax` by default; see DEPLOYMENT.md |
| `FINNHUB_STREAM` | no | `off` disables the WebSocket (REST polling only). Finnhub allows one WebSocket per key, so use `off` for any second instance. |
| `PORT`, `MONGODB_DB_NAME`, `CORS_ORIGINS`, `STARTING_CASH`, `AUTH_RATE_LIMIT`, `API_RATE_LIMIT`, `JWT_EXPIRES_IN` | no | Defaults are documented in `.env.example` |

The frontends only read the public variables `VITE_API_URL`, `VITE_DASHBOARD_URL` and `VITE_LANDING_URL`.

## Security notes

- **Passwords:** hashed with bcrypt (cost 12). Login errors are generic and take constant time whether or not the email exists.
- **Sessions:** a JWT in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). Logout bumps a per-user token version, so stolen tokens stop working.
- **Request protection:**
  - CORS allows only the configured origins.
  - State-changing requests from any other `Origin` are rejected (CSRF defence in depth).
  - Helmet sets security headers.
  - Login and signup are rate-limited, as is the API overall.
- **Input handling:** every request body and query string is parsed by a zod schema into primitive types before it reaches MongoDB (NoSQL-injection defence). JSON bodies are capped at 20 kB.
- **Data ownership:** every portfolio query is scoped to the authenticated user ID. A client-supplied user ID or price is never trusted, because orders are priced on the server.
- **Money:** stored in integer cents. Cash and holding updates use conditional atomic writes, so concurrent orders can't overdraw cash or oversell shares. Orders are idempotent through a client-generated `clientOrderId`.

## Known limitations

- **Order fills:** limit and stop orders fill at the first price that crosses the order price (full quantity, no partial fills or slippage). STOP buys reserve 5% above the trigger and are rejected if the fill price exceeds that and your available cash.
- **Trading calendar:** day orders expire at the next 4 pm New York close; weekends and holidays are not skipped. Fills are blocked while Finnhub reports the market closed.
- **Benchmark history:** performance vs SPY starts at your first recorded snapshot; there's no back-filled price history on the free plan.

- **Simulated execution:** orders always fill completely at the latest available price. There are no limit orders, order book, slippage or brokerage fees. Orders placed while the market is closed fill at the last price and are labelled as simulated.
- **No transactions:** MongoDB multi-document transactions need a replica set, so consistency relies on conditional updates plus compensation. A process crash in the middle of an order can leave one `PENDING` order record, which is hidden from the UI.
- **No historical charts:** the free plan has no candles, so charts only show the current session's prices.
- **Single instance:** the quote cache and the single upstream WebSocket live in one backend process. Scaling to several instances would need a shared cache and leader election for the Finnhub connection.
- **Landing copy:** the landing site reproduces Zerodha's marketing copy, which describes Indian brokerage pricing. The simulator itself trades US stocks in USD with no fees. The footer states that the project isn't affiliated with Zerodha.

## Project structure

```
backend/      Express API (CommonJS)
  index.js           entry point → src/server.js
  src/config.js      env loading + validation
  src/app.js         middleware + route wiring (exported for tests)
  src/realtime.js    Socket.IO fan-out
  src/models/        User (named watchlists) · Holding · Order · Alert · Notification · CompanyData (cache) · PortfolioSnapshot
  src/routes/        auth · trading · watchlist(s) · market · alerts/notifications
  src/services/      trading · orderEngine · alerts · notifications · guest · portfolio · analytics · snapshots · companyData · trackedSymbols
                     marketData/{finnhubRest,finnhubStream,quoteStore,demoProvider}
  scripts/           local-db · e2e-server · memory-mongo · check-finnhub
  test/              API, market data and Socket.IO tests
frontend/     Landing site (React 19, Vite, Bootstrap 5)
dashboard/    Trading dashboard (React 19, Vite, MUI, Chart.js, Socket.IO client)
  src/charts/          validated palette + Chart.js defaults
  src/components/charts/  ChartCard (chart/table toggle), wrappers, RangeBar, Heatmap
e2e/          Playwright specs
```
