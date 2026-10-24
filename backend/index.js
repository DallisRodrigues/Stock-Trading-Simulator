const { startServer } = require("./src/server");

startServer()
  .then(({ close }) => {
    const shutdown = (signal) => {
      console.info(`[api] ${signal} received, shutting down`);
      close()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  })
  .catch((err) => {
    console.error(err.code === "CONFIG_INVALID" ? err.message : `[api] failed to start: ${err.message}`);
    process.exit(1);
  });

process.on("unhandledRejection", (err) => console.error("[api] unhandled rejection:", err));
