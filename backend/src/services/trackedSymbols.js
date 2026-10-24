const { UserModel } = require("../models/User");
const { HoldingModel } = require("../models/Holding");
const { OrderModel } = require("../models/Order");
const { AlertModel } = require("../models/Alert");

const INDEX_SYMBOLS = ["SPY", "QQQ"];
const DEFAULT_WATCHLIST = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "NFLX", "AMD"];

function createSymbolTracker({ marketData, logger = console, debounceMs = 1500, refreshMs = 5 * 60_000 }) {
  let timer = null;
  let interval = null;

  async function recompute() {
    const [held, open, alerting, watched] = await Promise.all([
      HoldingModel.distinct("symbol", { qty: { $gt: 0 } }),
      OrderModel.distinct("symbol", { status: "OPEN" }),
      AlertModel.distinct("symbol", { status: "ACTIVE" }),
      UserModel.distinct("watchlists.symbols"),
    ]);
    const symbols = [...new Set([...INDEX_SYMBOLS, ...open.sort(), ...alerting.sort(), ...held.sort(), ...watched.sort()])];
    marketData.setTrackedSymbols(symbols);
    return symbols;
  }

  const safeRecompute = () => recompute().catch((err) => logger.error("[market] could not refresh tracked symbols:", err.message));

  return {
    recompute,
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        safeRecompute();
      }, debounceMs);
      timer.unref?.();
    },
    start() {
      safeRecompute();
      interval = setInterval(safeRecompute, refreshMs);
      interval.unref?.();
    },
    stop() {
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
    },
  };
}

module.exports = { createSymbolTracker, INDEX_SYMBOLS, DEFAULT_WATCHLIST };
