const { createFinnhubRest, normalizeQuote, normalizeSearch, createRateBudget } = require("../src/services/marketData/finnhubRest");
const { createFinnhubStream } = require("../src/services/marketData/finnhubStream");
const { QuoteStore } = require("../src/services/marketData/quoteStore");
const { createMarketDataService } = require("../src/services/marketData");
const { silentLogger } = require("./helpers");

class FakeWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = {};
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  emit(type, ev = {}) {
    (this.listeners[type] || []).forEach((fn) => fn(ev));
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  open() {
    this.readyState = 1;
    this.emit("open");
  }
  message(obj) {
    this.emit("message", { data: typeof obj === "string" ? obj : JSON.stringify(obj) });
  }
  close(code = 1006) {
    this.readyState = 3;
    this.emit("close", { code });
  }
}

const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe("Finnhub REST normalization", () => {
  it("normalizes a quote and converts seconds to ms", () => {
    expect(normalizeQuote({ c: 261.74, d: 1.1, dp: 0.42, h: 263.3, l: 260.68, o: 261.07, pc: 260.64, t: 1582641000 })).toEqual({
      price: 261.74,
      prevClose: 260.64,
      open: 261.07,
      high: 263.3,
      low: 260.68,
      sourceTs: 1582641000000,
    });
  });

  it("treats all-zero responses (unknown symbol) as no data", () => {
    expect(normalizeQuote({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 })).toBeNull();
    expect(normalizeQuote(null)).toBeNull();
    expect(normalizeQuote({ c: "abc" })).toBeNull();
  });

  it("keeps only tradable US security types in search results", () => {
    const out = normalizeSearch({
      result: [
        { symbol: "AAPL", description: "APPLE INC", type: "Common Stock" },
        { symbol: "SPY", description: "SPDR S&P 500", type: "ETP" },
        { symbol: "AAPL230120C", description: "option", type: "Option" },
      ],
    });
    expect(out.map((r) => r.symbol)).toEqual(["AAPL", "SPY"]);
    expect(normalizeSearch({})).toEqual([]);
  });
});

describe("Finnhub REST client", () => {
  it("sends the key in a header, never in the URL", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ c: 10, pc: 9, t: 1 }));
    const rest = createFinnhubRest({ apiKey: "secret-key", fetchImpl });
    await rest.getQuote("AAPL");
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).not.toContain("secret-key");
    expect(url).toContain("/quote?symbol=AAPL");
    expect(opts.headers["X-Finnhub-Token"]).toBe("secret-key");
  });

  it("deduplicates concurrent identical requests", async () => {
    let resolve;
    const fetchImpl = vi.fn(() => new Promise((r) => (resolve = r)));
    const rest = createFinnhubRest({ apiKey: "k", fetchImpl });
    const a = rest.getQuote("MSFT");
    const b = rest.getQuote("MSFT");
    resolve(jsonResponse({ c: 5, pc: 4, t: 1 }));
    await Promise.all([a, b]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps 429 and 401 to typed errors and backs off after 429", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429));
    const rest = createFinnhubRest({ apiKey: "k", fetchImpl });
    await expect(rest.getQuote("A")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(rest.getQuote("B")).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const rest401 = createFinnhubRest({ apiKey: "k", fetchImpl: async () => jsonResponse({}, 401) });
    await expect(rest401.getQuote("A")).rejects.toMatchObject({ code: "AUTH_FAILED" });
  });

  it("maps network failures to PROVIDER_ERROR without leaking the key", async () => {
    const rest = createFinnhubRest({
      apiKey: "secret-key",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const err = await rest.getQuote("A").catch((e) => e);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toContain("secret-key");
  });

  it("enforces the per-minute budget", () => {
    let t = 0;
    const budget = createRateBudget({ perMinute: 3, now: () => t });
    expect([budget.tryTake(), budget.tryTake(), budget.tryTake(), budget.tryTake()]).toEqual([true, true, true, false]);
    t = 60_001;
    expect(budget.tryTake()).toBe(true);
    expect(budget.remaining()).toBe(2);
  });
});

describe("Finnhub trade stream", () => {
  let timers;
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
    timers = { setTimeout, clearTimeout };
  });
  afterEach(() => vi.useRealTimers());

  const makeStream = (extra = {}) => {
    const onTrades = vi.fn();
    const stream = createFinnhubStream({
      apiKey: "k",
      WebSocketImpl: FakeWebSocket,
      onTrades,
      logger: silentLogger,
      timers,
      random: () => 0.5,
      ...extra,
    });
    return { stream, onTrades };
  };

  it("subscribes on open, respects the symbol cap and diff-updates subscriptions", () => {
    const { stream } = makeStream({ maxSymbols: 2 });
    stream.start();
    const accepted = stream.setSymbols(["AAPL", "MSFT", "TSLA"]);
    expect(accepted).toEqual(["AAPL", "MSFT"]);
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe("wss://ws.finnhub.io?token=k");
    ws.open();
    expect(ws.sent).toEqual([
      { type: "subscribe", symbol: "AAPL" },
      { type: "subscribe", symbol: "MSFT" },
    ]);
    stream.setSymbols(["MSFT", "NVDA"]);
    expect(ws.sent.slice(2)).toEqual([
      { type: "unsubscribe", symbol: "AAPL" },
      { type: "subscribe", symbol: "NVDA" },
    ]);
  });

  it("emits the latest trade per symbol and ignores pings, errors and malformed frames", () => {
    const { stream, onTrades } = makeStream();
    stream.start();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.message({ type: "ping" });
    ws.message("not json{");
    ws.message({ type: "error", msg: "Subscribing to too many symbols" });
    ws.message({ type: "trade", data: [{ s: "AAPL", p: "bad", t: 1 }] });
    expect(onTrades).not.toHaveBeenCalled();
    expect(stream.status().lastError).toMatch(/too many symbols/);

    ws.message({
      type: "trade",
      data: [
        { s: "AAPL", p: 10, t: 1000, v: 5 },
        { s: "AAPL", p: 11, t: 2000, v: 3 },
        { s: "MSFT", p: 20, t: 1500, v: 1 },
      ],
    });
    expect(onTrades).toHaveBeenCalledWith([
      { symbol: "AAPL", price: 11, sourceTs: 2000, volume: 8 },
      { symbol: "MSFT", price: 20, sourceTs: 1500, volume: 1 },
    ]);
  });

  it("reconnects with backoff and resubscribes after a drop", () => {
    const { stream } = makeStream();
    stream.start();
    stream.setSymbols(["AAPL"]);
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].close();
    expect(stream.status().state).toBe("reconnecting");
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].open();
    expect(FakeWebSocket.instances[1].sent).toEqual([{ type: "subscribe", symbol: "AAPL" }]);
    expect(stream.status().reconnectAttempts).toBe(0);
  });

  it("grows the backoff delay on repeated failures and caps it", () => {
    const { stream } = makeStream({ random: () => 1, maxDelayMs: 8000 });
    stream.start();
    const delays = [];
    for (let i = 0; i < 6; i++) {
      FakeWebSocket.instances.at(-1).close();
      delays.push(stream.status().nextRetryInMs);
      vi.advanceTimersByTime(10_000);
    }
    expect(delays).toEqual([1250, 2250, 4250, 8250, 8250, 8250]);
  });

  it("forces a reconnect when the connection goes silent", () => {
    const { stream } = makeStream({ idleTimeoutMs: 5000 });
    stream.start();
    FakeWebSocket.instances[0].open();
    vi.advanceTimersByTime(5001);
    expect(FakeWebSocket.instances[0].readyState).toBe(3);
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("stops cleanly without reconnecting", () => {
    const { stream } = makeStream();
    stream.start();
    FakeWebSocket.instances[0].open();
    stream.stop();
    vi.advanceTimersByTime(120_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(stream.status().state).toBe("stopped");
  });
});

describe("QuoteStore", () => {
  it("computes change only when a previous close is known", () => {
    const store = new QuoteStore({ now: () => 5 });
    const t = store.applyTrade("AAPL", { price: 100, sourceTs: 1 });
    expect(t.change).toBeNull();
    const s = store.applySnapshot("AAPL", { price: 101, prevClose: 100, sourceTs: 2 }, "rest");
    expect(s).toMatchObject({ change: 1, changePct: 1 });
    const t2 = store.applyTrade("AAPL", { price: 99, sourceTs: 3 });
    expect(t2).toMatchObject({ prevClose: 100, change: -1, changePct: -1, source: "stream" });
  });

  it("ignores out-of-order trades and bounds history and symbols", () => {
    const store = new QuoteStore({ maxSymbols: 2, historyLength: 3 });
    store.applyTrade("A", { price: 1, sourceTs: 10 });
    store.applyTrade("A", { price: 2, sourceTs: 5 });
    expect(store.get("A").price).toBe(1);
    for (let i = 0; i < 5; i++) store.applyTrade("A", { price: 10 + i, sourceTs: 20 + i });
    expect(store.history("A")).toHaveLength(3);
    store.applyTrade("B", { price: 1, sourceTs: 1 });
    store.applyTrade("C", { price: 1, sourceTs: 1 });
    expect(store.get("A")).toBeNull();
  });
});

describe("market data service", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

  const quoteFetch = (prices) =>
    vi.fn(async (url) => {
      const sym = new URL(url).searchParams.get("symbol");
      if (url.includes("market-status")) return jsonResponse({ isOpen: true, session: "regular", t: 1 });
      const p = prices[sym];
      return jsonResponse(p ? { c: p, pc: p - 1, o: p, h: p, l: p, t: 100 } : { c: 0, pc: 0, t: 0 });
    });

  it("labels demo quotes as demo", async () => {
    const svc = createMarketDataService({ provider: "demo", logger: silentLogger });
    const q = await svc.getQuotes(["AAPL", "ZZZZ"]);
    expect(q.AAPL.status).toBe("demo");
    expect(q.ZZZZ.status).toBe("unavailable");
  });

  it("caches REST snapshots and marks streamed symbols live", async () => {
    const fetchImpl = quoteFetch({ AAPL: 200 });
    const svc = createMarketDataService({ provider: "finnhub", apiKey: "k", fetchImpl, WebSocketImpl: FakeWebSocket, logger: silentLogger });
    const first = await svc.getQuotes(["AAPL"]);
    expect(first.AAPL).toMatchObject({ price: 200, prevClose: 199, change: 1, status: "snapshot", source: "rest" });
    await svc.getQuotes(["AAPL"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const updates = [];
    svc.events.on("quote", (q) => updates.push(q));
    svc.start();
    svc.setTrackedSymbols(["AAPL"]);
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].message({ type: "trade", data: [{ s: "AAPL", p: 201, t: 200_000, v: 1 }] });
    expect(updates.at(-1)).toMatchObject({ symbol: "AAPL", price: 201, prevClose: 199, change: 2, status: "live", source: "stream" });
    svc.stop();
  });

  it("falls back to cached data when the REST budget is exhausted", async () => {
    let t = 0;
    const fetchImpl = quoteFetch({ AAPL: 200, MSFT: 300 });
    const svc = createMarketDataService({ provider: "finnhub", apiKey: "k", fetchImpl, restCallsPerMinute: 1, now: () => t, logger: silentLogger });
    await svc.getQuotes(["AAPL"]);
    t = 120_000;
    const res = await svc.getQuotes(["AAPL", "MSFT"]);
    const statuses = [res.AAPL.status, res.MSFT.status].sort();
    expect(statuses).toContain("snapshot");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refuses to price trades without a quote", async () => {
    const svc = createMarketDataService({
      provider: "finnhub",
      apiKey: "k",
      fetchImpl: async () => jsonResponse({}, 503),
      logger: silentLogger,
    });
    await expect(svc.getTradeQuote("AAPL")).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});
