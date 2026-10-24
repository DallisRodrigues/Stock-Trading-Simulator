const { Server } = require("socket.io");
const { userFromToken, tokenFromCookieHeader } = require("./middleware/auth");
const { normalizeSymbol } = require("./utils/symbols");

const MAX_SUBSCRIPTIONS = 60;
const EMIT_INTERVAL_MS = 250;

function attachRealtime(httpServer, { config, marketData, logger = console, userEvents }) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    serveClient: false,
  });

  io.use(async (socket, next) => {
    try {
      const user = await userFromToken(tokenFromCookieHeader(socket.handshake.headers.cookie), config);
      if (!user) return next(new Error("UNAUTHORIZED"));
      socket.data.userId = String(user._id);
      next();
    } catch (err) {
      logger.error("[ws] auth failed:", err.message);
      next(new Error("UNAVAILABLE"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`u:${socket.data.userId}`);
    socket.emit("market:status", marketData.getStatus());

    socket.on("quotes:subscribe", async (symbols, ack) => {
      if (!Array.isArray(symbols)) return;
      const wanted = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))].slice(0, MAX_SUBSCRIPTIONS);
      for (const room of socket.rooms) {
        if (room.startsWith("q:") && !wanted.includes(room.slice(2))) socket.leave(room);
      }
      wanted.forEach((s) => socket.join(`q:${s}`));
      try {
        const quotes = await marketData.getQuotes(wanted);
        if (typeof ack === "function") ack({ quotes });
      } catch (err) {
        logger.error("[ws] subscribe failed:", err.message);
        if (typeof ack === "function") ack({ quotes: {}, error: "UNAVAILABLE" });
      }
    });
  });

  const pending = new Map();
  let flushTimer = null;
  const flush = () => {
    flushTimer = null;
    for (const [symbol, quote] of pending) io.to(`q:${symbol}`).emit("quote", quote);
    pending.clear();
  };
  const onQuote = (quote) => {
    pending.set(quote.symbol, quote);
    if (!flushTimer) flushTimer = setTimeout(flush, EMIT_INTERVAL_MS);
  };
  const onStatus = (status) => io.emit("market:status", status);
  marketData.events.on("quote", onQuote);
  marketData.events.on("status", onStatus);
  const onNotification = (userId, notification) => io.to(`u:${userId}`).emit("notification", notification);
  const onPortfolio = (userId) => io.to(`u:${userId}`).emit("portfolio:changed");
  userEvents?.on("notification", onNotification);
  userEvents?.on("portfolio", onPortfolio);

  return {
    io,
    close() {
      marketData.events.off("quote", onQuote);
      marketData.events.off("status", onStatus);
      userEvents?.off("notification", onNotification);
      userEvents?.off("portfolio", onPortfolio);
      if (flushTimer) clearTimeout(flushTimer);
      return new Promise((resolve) => io.close(() => resolve()));
    },
  };
}

module.exports = { attachRealtime };
