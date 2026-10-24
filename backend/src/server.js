const http = require("node:http");
const mongoose = require("mongoose");
const { loadEnvFile, loadConfig } = require("./config");
const { connectDb, runMigrations } = require("./db");
const { createApp } = require("./app");
const { attachRealtime } = require("./realtime");
const { createMarketDataService } = require("./services/marketData");
const { createSymbolTracker } = require("./services/trackedSymbols");
const { EventEmitter } = require("node:events");

async function startServer({ logger = console, env } = {}) {
  if (!env) loadEnvFile();
  const config = loadConfig(env || process.env);
  if (config.isProduction && !config.serveStatic && config.corsOrigins.every((o) => o.includes("localhost"))) {
    logger.warn("[config] NODE_ENV=production with only localhost CORS_ORIGINS: set SERVE_STATIC=on or CORS_ORIGINS to your site's URL.");
  }
  if (config.jwtSecretGenerated) {
    logger.warn("[config] JWT_SECRET not set; using a random development secret (sessions reset on restart).");
  }

  await connectDb(config, logger);
  await runMigrations(logger, { startingCashCents: Math.round(config.startingCash * 100) });

  const marketData = createMarketDataService({
    provider: config.marketData.provider,
    apiKey: config.marketData.finnhubApiKey,
    restCallsPerMinute: config.marketData.restCallsPerMinute,
    stream: config.marketData.stream,
    logger,
  });
  const symbolTracker = createSymbolTracker({ marketData, logger });
  const userEvents = new EventEmitter();
  const app = createApp({ config, marketData, symbolTracker, logger, userEvents });
  const server = http.createServer(app);
  const realtime = attachRealtime(server, { config, marketData, logger, userEvents });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, resolve);
  });
  logger.info(`[api] listening on http://localhost:${config.port} (market data: ${config.marketData.provider})`);

  marketData.start();
  symbolTracker.start();
  app.locals.engine.start();
  const cleanup = () => app.locals.guests.cleanupExpired().catch((err) => logger.error("[guest] cleanup failed:", err.message));
  cleanup();
  const guestTimer = setInterval(cleanup, 30 * 60_000);
  guestTimer.unref();

  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    symbolTracker.stop();
    clearInterval(guestTimer);
    await app.locals.engine.stop();
    marketData.stop();
    await realtime.close();
    await new Promise((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
  }
  return { server, config, close };
}

module.exports = { startServer };
