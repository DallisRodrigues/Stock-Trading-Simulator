const { EventEmitter } = require("node:events");
const { QuoteStore } = require("./quoteStore");
const { createFinnhubRest, ProviderError } = require("./finnhubRest");
const { createFinnhubStream } = require("./finnhubStream");
const { createDemoProvider } = require("./demoProvider");

const SNAPSHOT_REFRESH_MS = 30 * 60_000;
const FALLBACK_MAX_AGE_MS = 60_000;
const STALE_AFTER_MS = 3 * 60_000;
const MARKET_STATUS_TTL_MS = 60_000;

function createMarketDataService({
  provider = "demo",
  apiKey,
  restCallsPerMinute = 50,
  stream: enableStream = true,
  logger = console,
  fetchImpl,
  WebSocketImpl,
  now = Date.now,
  pollIntervalMs = 10_000,
  pollPerTick = 3,
  restReserve = 10,
  streamOptions = {},
}) {
  const events = new EventEmitter();
  events.setMaxListeners(50);
  const store = new QuoteStore({ now });
  const isDemo = provider === "demo";
  const source = isDemo ? createDemoProvider() : createFinnhubRest({ apiKey, fetchImpl, callsPerMinute: restCallsPerMinute, now });
  const lastRestAt = new Map();
  let tracked = [];
  let streamed = new Set();
  let pollTimer = null;
  let market = { isOpen: null, session: null, holiday: null, fetchedAt: 0 };
  let lastProviderError = null;

  const stream =
    isDemo || !enableStream
      ? null
      : createFinnhubStream({
          apiKey,
          WebSocketImpl,
          logger,
          now,
          onTrades: (trades) => trades.forEach((t) => store.applyTrade(t.symbol, t)),
          onStatus: () => events.emit("status", getStatus()),
          ...streamOptions,
        });

  function marketState() {
    if (market.isOpen === true) return "open";
    if (market.isOpen === false) return "closed";
    return "unknown";
  }

  function decorate(q) {
    if (!q) return null;
    let status;
    if (q.source === "demo") status = "demo";
    else if (market.isOpen === false) status = "closed";
    else if (stream?.isOpen() && streamed.has(q.symbol)) status = "live";
    else if (now() - q.receivedAt < STALE_AFTER_MS) status = "snapshot";
    else status = "stale";
    return { ...q, status, marketState: marketState() };
  }

  store.on("quote", (q) => events.emit("quote", decorate(q)));

  async function fetchSnapshot(symbol) {
    const snap = await source.getQuote(symbol);
    lastRestAt.set(symbol, now());
    if (!snap) return null;
    lastProviderError = null;
    return store.applySnapshot(symbol, snap, isDemo ? "demo" : "rest");
  }

  function rememberError(err) {
    if (err instanceof ProviderError) {
      if (lastProviderError !== err.code) logger.warn(`[market] ${err.code}: ${err.message}`);
      lastProviderError = err.code;
    } else {
      logger.error("[market] unexpected error", err);
    }
  }

  async function getQuotes(symbols, { maxAgeMs = FALLBACK_MAX_AGE_MS } = {}) {
    const out = {};
    await Promise.all(
      symbols.map(async (symbol) => {
        const cached = store.get(symbol);
        const liveStreamed = stream?.isOpen() && streamed.has(symbol);
        const fresh = cached && (isDemo || liveStreamed || now() - cached.receivedAt < maxAgeMs);
        if (fresh) {
          out[symbol] = decorate(cached);
          return;
        }
        try {
          const q = await fetchSnapshot(symbol);
          out[symbol] = q ? decorate(q) : { symbol, status: "unavailable", reason: "UNKNOWN_SYMBOL" };
        } catch (err) {
          rememberError(err);
          out[symbol] = cached ? decorate(cached) : { symbol, status: "unavailable", reason: err.code || "PROVIDER_ERROR" };
        }
      })
    );
    return out;
  }

  async function getTradeQuote(symbol) {
    const quotes = await getQuotes([symbol], { maxAgeMs: 30_000 });
    const q = quotes[symbol];
    if (!q || q.status === "unavailable" || !(q.price > 0)) {
      throw new ProviderError(q?.reason || "PROVIDER_ERROR", "No price is currently available for this symbol.");
    }
    return q;
  }

  async function symbolExists(symbol) {
    if (store.get(symbol)) return true;
    try {
      return Boolean(await fetchSnapshot(symbol));
    } catch (err) {
      rememberError(err);
      return null;
    }
  }

  async function refreshMarketStatus() {
    if (now() - market.fetchedAt < MARKET_STATUS_TTL_MS) return;
    try {
      const s = await source.marketStatus();
      const changed = s.isOpen !== market.isOpen || s.session !== market.session;
      market = { ...s, fetchedAt: now() };
      if (changed) events.emit("status", getStatus());
    } catch (err) {
      market.fetchedAt = now();
      rememberError(err);
    }
  }

  async function pollTick() {
    if (isDemo) return;
    await refreshMarketStatus();
    const streaming = stream?.isOpen() ?? false;
    const due = tracked
      .filter((s) => {
        const last = lastRestAt.get(s);
        if (!last || !store.get(s)) return true;
        if (now() - last > SNAPSHOT_REFRESH_MS) return true;
        return (!streaming || !streamed.has(s)) && now() - last > FALLBACK_MAX_AGE_MS;
      })
      .sort((a, b) => (lastRestAt.get(a) || 0) - (lastRestAt.get(b) || 0));

    for (const symbol of due.slice(0, pollPerTick)) {
      if (source.budget.remaining() <= restReserve) break;
      try {
        await fetchSnapshot(symbol);
      } catch (err) {
        rememberError(err);
        if (err.code === "RATE_LIMITED" || err.code === "AUTH_FAILED") break;
      }
    }
  }

  function getStatus() {
    return {
      provider,
      marketState: marketState(),
      session: market.session ?? null,
      holiday: market.holiday ?? null,
      stream: stream ? stream.status() : null,
      trackedSymbols: tracked.length,
      streamedSymbols: streamed.size,
      restBudgetRemaining: isDemo ? null : source.budget.remaining(),
      lastProviderError,
    };
  }

  return {
    provider,
    events,
    getQuotes,
    getTradeQuote,
    symbolExists,
    getStatus,
    history: (symbol) => store.history(symbol),
    async search(query) {
      return source.search(query);
    },
    company: {
      profile: (symbol) => source.profile(symbol),
      metrics: (symbol) => source.metrics(symbol),
      recommendations: (symbol) => source.recommendations(symbol),
      peers: (symbol) => source.peers(symbol),
      news: (symbol, range) => source.news(symbol, range),
    },
    async marketStatus() {
      await refreshMarketStatus();
      return getStatus();
    },
    setTrackedSymbols(symbols) {
      tracked = [...new Set(symbols)];
      if (stream) streamed = new Set(stream.setSymbols(tracked));
      if (tracked.length > streamed.size && stream) {
        logger.warn(`[market] ${tracked.length - streamed.size} symbol(s) exceed the 50-symbol stream limit; they use REST polling.`);
      }
    },
    start() {
      if (!isDemo) {
        stream?.start();
        pollTimer = setInterval(() => pollTick().catch((e) => logger.error("[market] poll failed", e)), pollIntervalMs);
        pollTimer.unref?.();
        pollTick().catch((e) => logger.error("[market] poll failed", e));
      }
    },
    stop() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      stream?.stop();
    },
    _pollTick: pollTick,
  };
}

module.exports = { createMarketDataService, ProviderError };
