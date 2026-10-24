const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const { requireAuth } = require("./middleware/auth");
const { originCheck } = require("./middleware/originCheck");
const { notFoundHandler, errorHandler } = require("./middleware/errors");
const { authRoutes } = require("./routes/auth");
const { tradingRoutes } = require("./routes/trading");
const { watchlistRoutes, watchlistsRoutes, createWatchlistService } = require("./routes/watchlist");
const { marketRoutes } = require("./routes/market");
const { createTradingService } = require("./services/trading");
const { createPortfolioService } = require("./services/portfolio");
const { createCompanyDataService } = require("./services/companyData");
const { createAnalyticsService } = require("./services/analytics");
const { createSnapshotService } = require("./services/snapshots");
const { createNotificationService } = require("./services/notifications");
const { createAlertService } = require("./services/alerts");
const { createOrderEngine } = require("./services/orderEngine");
const { createGuestService } = require("./services/guest");
const { alertRoutes, notificationRoutes } = require("./routes/alerts");
const { EventEmitter } = require("node:events");

function createApp({ config, marketData, symbolTracker, logger = console, userEvents = new EventEmitter() }) {
  const app = express();
  const onSymbolsChanged = () => symbolTracker?.schedule();
  const portfolio = createPortfolioService({ marketData });
  const snapshots = createSnapshotService({ portfolio, marketData });
  const companyData = createCompanyDataService({ marketData, logger });
  const analytics = createAnalyticsService({ portfolio, companyData, snapshots });
  const notifications = createNotificationService({ userEvents });
  const onPortfolioChanged = (userId) => {
    onSymbolsChanged();
    userEvents.emit("portfolio", String(userId));
    snapshots.record(userId).catch((err) => logger.error("[snapshots] record failed:", err.message));
  };
  const trading = createTradingService({ marketData, notifications, onPortfolioChanged });
  const alerts = createAlertService({ marketData, notifications });
  const engine = createOrderEngine({ marketData, trading, alerts, logger });
  const onWatchedChanged = () => {
    engine.touch();
    onSymbolsChanged();
  };
  const guests = createGuestService({ config, trading, alerts, marketData, logger });
  app.locals.engine = engine;
  app.locals.guests = guests;

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy > 0 ? config.trustProxy : false);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "img-src": ["'self'", "data:", "https:"],
          "connect-src": ["'self'", ...config.corsOrigins],
          "upgrade-insecure-requests": config.isProduction && config.trustProxy > 0 ? [] : null,
        },
      },
      strictTransportSecurity: config.isProduction && config.trustProxy > 0,
    })
  );
  app.use(compression());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "20kb" }));
  app.use(cookieParser());
  app.use(originCheck(config.corsOrigins));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: config.apiRateLimit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } },
    })
  );

  app.get("/api/health", (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? "ok" : "degraded", db: dbUp ? "up" : "down", market: marketData.getStatus() });
  });

  const auth = requireAuth(config);
  app.use("/api/auth", authRoutes({ config, guests, onWatchlistChanged: onSymbolsChanged }));
  app.use("/api/market", auth, marketRoutes({ marketData, companyData }));
  app.get("/api/portfolio/analytics", auth, async (req, res) => {
    res.json(await analytics.compute(req.user._id));
  });
  const watchlists = createWatchlistService({ marketData, onWatchlistChanged: onSymbolsChanged });
  app.use("/api/watchlists", auth, watchlistsRoutes({ service: watchlists }));
  app.use("/api/watchlist", auth, watchlistRoutes({ service: watchlists, marketData }));
  app.use("/api/alerts", auth, alertRoutes({ alerts, onAlertsChanged: onWatchedChanged }));
  app.use("/api/notifications", auth, notificationRoutes({ notifications }));
  app.use("/api", auth, tradingRoutes({ trading, portfolio, onOrdersChanged: onWatchedChanged }));

  if (config.serveStatic) mountStatic(app, logger);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}

function mountStatic(app, logger) {
  const root = path.join(__dirname, "..", "..");
  const landing = process.env.STATIC_LANDING_DIR || path.join(root, "frontend", "dist");
  const dashboard = process.env.STATIC_DASHBOARD_DIR || path.join(root, "dashboard", "dist");
  for (const dir of [landing, dashboard]) {
    if (!fs.existsSync(path.join(dir, "index.html"))) logger.warn(`[static] ${dir}/index.html not found — run "npm run build:single" first`);
  }
  const assets = { maxAge: "7d", index: false, redirect: false };
  app.use("/app", express.static(dashboard, assets));
  app.get(["/app", "/app/{*splat}"], (_req, res) => res.sendFile(path.join(dashboard, "index.html")));
  app.use(express.static(landing, assets));
  app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => res.sendFile(path.join(landing, "index.html")));
}

module.exports = { createApp };
