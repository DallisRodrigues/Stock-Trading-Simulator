# Deployment

The app ships as **one Docker image**. A single Node process serves:
- the API
- the Socket.IO price feed
- the landing site at `/`
- the dashboard at `/app`

Everything is on one origin, so no CORS or cross-site cookie setup is needed. The only external services are **MongoDB Atlas** (data) and **Finnhub** (market data).

```
Browser ──► https://your-app.onrender.com ──► container (Express + Socket.IO + built frontends)
                                                   ├──► MongoDB Atlas
                                                   └──► Finnhub (REST + one WebSocket)
```

---

## 0. Before you start

- **Rotate secrets that were ever shared** (in chat, screenshots or commits): the MongoDB password, the Finnhub key and the JWT secret.
- **Check Finnhub's licence.** The free plan is "Personal Use". Showing its prices publicly may need a different plan. Alternatives:
  - deploy with `MARKET_DATA_PROVIDER=demo` (clearly labelled sample prices)
  - keep the URL private
  - confirm the terms with Finnhub
- **Run exactly one instance.** Finnhub allows one WebSocket per API key, and the quote cache is in memory. Never scale this service horizontally.

## 1. Run the container locally (Docker Compose)

```bash
docker compose up -d --build      # app + a local MongoDB
open http://localhost:3002        # landing page → "Try the live demo"
docker compose logs -f app        # follow logs
docker compose down               # stop (data is kept in the mongo-data volume)
docker compose down -v            # stop and delete the local database
```

- **Configuration:** compose reads `FINNHUB_API_KEY` and `JWT_SECRET` from `backend/.env`.
- **Database:** it always uses its own MongoDB container, never the `MONGODB_URI` in `backend/.env`. To point it at Atlas instead, set `COMPOSE_MONGODB_URI`.
- **Port:** change it with `APP_PORT=8080 docker compose up -d`.
- **One stream per key:** don't run `npm run dev` with the same Finnhub key at the same time.

## 2. Set up MongoDB Atlas

1. Create a free M0 cluster.
2. Under **Database Access**, create a user with *Read and write to any database* (or scope it to `zerodha_clone`) and a strong generated password.
3. Under **Network Access**, add `0.0.0.0/0`. Free hosting plans have no fixed outbound IP, so the strong password is what protects the database.
4. Copy the connection string: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/`.

## 3. Deploy on Render (recommended)

Render builds the Dockerfile straight from GitHub, supports WebSockets and reads the included `render.yaml` blueprint.

1. Push the repository to GitHub. See "Pushing to GitHub" in the README.
2. In Render: **New → Blueprint**, then pick the repository. Render reads `render.yaml`.
3. When prompted, fill in `MONGODB_URI` (from step 2) and `FINNHUB_API_KEY`. Render generates `JWT_SECRET` itself.
4. Click **Apply**. The first build takes a few minutes.
5. Open `https://<service>.onrender.com/api/health`. You should see `"status":"ok","db":"up"`.

**Plans:**
- **Free** works for a portfolio demo. The service sleeps after 15 minutes without traffic and takes about a minute to wake. While it sleeps, the live stream and order engine are paused; open orders are checked again when it wakes.
- **Starter** (paid) stays always on, which is better for open limit/stop orders and alerts.

`autoDeployTrigger: checksPass` makes Render deploy only after the GitHub Actions CI passes.

### Environment variables

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Secure cookies; requires `JWT_SECRET` |
| `SERVE_STATIC` | `on` | Serve both frontends from the container |
| `TRUST_PROXY` | `1` | Render puts one proxy in front of the app; needed for correct rate limiting and HTTPS headers |
| `MONGODB_URI` | Atlas connection string | Secret |
| `MONGODB_DB_NAME` | `zerodha_clone` | |
| `JWT_SECRET` | generated | Secret, at least 32 characters |
| `FINNHUB_API_KEY` | your key | Secret; omit (or set `MARKET_DATA_PROVIDER=demo`) to run on sample prices |
| `GUEST_DEMO` | `on` | One-click demo accounts (default on) |
| `PORT` | set by the host | The app listens on whatever `PORT` is |

## 4. Other hosts

The image runs anywhere that runs a container and passes `PORT`. Keep **one instance**, set the same environment variables, and point the health check at `/api/health`.

- **Pull the prebuilt image:** every push to `main` publishes `ghcr.io/<owner>/<repo>:latest` (workflow `docker-publish.yml`). Make the package public in GitHub → Packages, or log the host into GHCR.
- **Railway / Fly.io / Koyeb:** deploy from the repo's Dockerfile, or from the GHCR image.
- **A VPS:**
  1. `docker run -d --restart unless-stopped -p 80:3002 --env-file prod.env ghcr.io/<owner>/<repo>:latest`
  2. Put Caddy or nginx in front for HTTPS, then set `TRUST_PROXY=1`.

## 5. Split frontends (optional)

You can host the two frontends on a static CDN, but the login cookie must stay **same-site**. Use one domain, e.g. `example.com`, `app.example.com` and `api.example.com`.

- Build the landing site with `VITE_API_URL=https://api.example.com VITE_DASHBOARD_URL=https://app.example.com`.
- Build the dashboard with `VITE_API_URL=https://api.example.com VITE_LANDING_URL=https://example.com`.
- Set `CORS_ORIGINS=https://example.com,https://app.example.com` and `SERVE_STATIC=off` on the API.

Hosting on unrelated domains (e.g. `*.vercel.app` + `*.onrender.com`) makes the cookie third-party. Browsers increasingly block those, so prefer the single-container setup.

## 6. CI/CD

| Workflow | Runs | What it does |
|---|---|---|
| `ci.yml` | every push to `main` and every PR | Lint, backend and dashboard tests (throwaway in-memory MongoDB), production builds, Playwright end-to-end tests in Chromium, and a Docker build. No secrets required. |
| `docker-publish.yml` | pushes to `main`, `v*` tags | Builds and pushes the image to GitHub Container Registry. |

## 7. After each deploy

- `/api/health` returns `ok`, with `db: up`.
- The landing page's **Try the live demo** opens the dashboard. The feed badge shows **Live** (US market hours), **Market closed** or **Polling**, never an error.
- From a checkout with the production key in `backend/.env`, `npm run check:finnhub` confirms REST and WebSocket access.
