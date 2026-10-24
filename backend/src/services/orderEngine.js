const { OrderModel } = require("../models/Order");
const { AlertModel } = require("../models/Alert");

function createOrderEngine({ marketData, trading, alerts, logger = console, throttleMs = 1000, sweepMs = 15_000 }) {
  let watched = new Set();
  const lastRun = new Map();
  const chains = new Map();
  let sweepTimer = null;
  let started = false;

  async function refreshWatched() {
    const [orderSyms, alertSyms] = await Promise.all([OrderModel.distinct("symbol", { status: "OPEN" }), AlertModel.distinct("symbol", { status: "ACTIVE" })]);
    watched = new Set([...orderSyms, ...alertSyms]);
    return [...watched];
  }

  async function evaluateSymbol(symbol, quote) {
    const open = await OrderModel.find({ status: "OPEN", symbol }).sort({ createdAt: 1 });
    for (const order of open) {
      try {
        await trading.tryFill(order, quote);
      } catch (err) {
        logger.error(`[engine] fill ${order._id} failed:`, err.message);
      }
    }
    await alerts.evaluate(symbol, quote);
  }

  function schedule(symbol, quote) {
    const prev = chains.get(symbol) || Promise.resolve();
    const next = prev
      .then(() => evaluateSymbol(symbol, quote))
      .catch((err) => logger.error(`[engine] ${symbol}:`, err.message))
      .finally(() => {
        if (chains.get(symbol) === next) chains.delete(symbol);
      });
    chains.set(symbol, next);
    return next;
  }

  const onQuote = (quote) => {
    if (!watched.has(quote.symbol)) return;
    const t = Date.now();
    if (t - (lastRun.get(quote.symbol) || 0) < throttleMs) return;
    lastRun.set(quote.symbol, t);
    schedule(quote.symbol, quote);
  };

  async function sweep() {
    await trading.expireDue();
    const symbols = await refreshWatched();
    if (!symbols.length) return;
    const quotes = await marketData.getQuotes(symbols);
    await Promise.all(symbols.filter((s) => quotes[s]?.price > 0).map((s) => schedule(s, quotes[s])));
  }

  return {
    sweep,
    refreshWatched,
    touch: () => refreshWatched().catch((err) => logger.error("[engine] refresh failed:", err.message)),
    watchedSymbols: () => [...watched],
    start() {
      if (started) return;
      started = true;
      marketData.events.on("quote", onQuote);
      sweepTimer = setInterval(() => sweep().catch((err) => logger.error("[engine] sweep failed:", err.message)), sweepMs);
      sweepTimer.unref?.();
      sweep().catch((err) => logger.error("[engine] sweep failed:", err.message));
    },
    async stop() {
      started = false;
      marketData.events.off("quote", onQuote);
      if (sweepTimer) clearInterval(sweepTimer);
      await Promise.allSettled([...chains.values()]);
    },
  };
}

module.exports = { createOrderEngine };
