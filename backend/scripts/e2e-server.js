const { startMemoryMongo } = require("./memory-mongo");

(async () => {
  const mongo = await startMemoryMongo();
  const { startServer } = require("../src/server");
  const { close } = await startServer({
    env: {
      NODE_ENV: "test",
      PORT: process.env.PORT || "3102",
      MONGODB_URI: mongo.getUri(),
      MONGODB_DB_NAME: "e2e",
      JWT_SECRET: "e2e-only-secret-e2e-only-secret-e2e-only",
      MARKET_DATA_PROVIDER: "demo",
      AUTH_RATE_LIMIT: "1000",
      SERVE_STATIC: process.env.SERVE_STATIC || "off",
      CORS_ORIGINS: process.env.CORS_ORIGINS || "http://localhost:5183,http://localhost:5184",
    },
  });
  const shutdown = async () => {
    await close().catch(() => {});
    await mongo.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})().catch((err) => {
  console.error("[e2e-server] failed:", err);
  process.exit(1);
});
