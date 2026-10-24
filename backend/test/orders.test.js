const { EventEmitter } = require("node:events");
const mongoose = require("mongoose");
const { setupTestApp, signupAgent, orderId, silentLogger } = require("./helpers");
const { ProviderError } = require("../src/services/marketData");
const { OrderModel } = require("../src/models/Order");
const { HoldingModel } = require("../src/models/Holding");
const { runMigrations } = require("../src/db");

function createFakeMarket() {
  const events = new EventEmitter();
  const state = { prices: { AAPL: 100, MSFT: 200 }, prevClose: {}, marketState: "open" };
  const quote = (s) => {
    const p = state.prices[s];
    if (p == null) return { symbol: s, status: "unavailable", reason: "UNKNOWN_SYMBOL" };
    const pc = state.prevClose[s] ?? p;
    return { symbol: s, price: p, prevClose: pc, change: p - pc, changePct: ((p - pc) / pc) * 100, source: "rest", status: "snapshot", marketState: state.marketState, receivedAt: Date.now(), sourceTs: Date.now() };
  };
  return {
    provider: "finnhub",
    events,
    state,
    getQuotes: async (symbols) => Object.fromEntries(symbols.map((s) => [s, quote(s)])),
    getTradeQuote: async (s) => {
      const q = quote(s);
      if (q.status === "unavailable") throw new ProviderError("UNKNOWN_SYMBOL", "No price is currently available for this symbol.");
      return q;
    },
    symbolExists: async (s) => s in state.prices,
    getStatus: () => ({ provider: "finnhub" }),
    history: () => [],
    search: async () => [],
    company: {},
    setPrice(s, p) {
      state.prices[s] = p;
      events.emit("quote", quote(s));
    },
  };
}

let ctx;
let market;
let engine;
beforeAll(async () => {
  market = createFakeMarket();
  ctx = await setupTestApp({ marketData: market });
  engine = ctx.app.locals.engine;
});
afterAll(async () => {
  await engine.stop();
  await ctx.teardown();
});
beforeEach(async () => {
  await ctx.reset();
  Object.assign(market.state, { prices: { AAPL: 100, MSFT: 200 }, prevClose: {}, marketState: "open" });
});

const place = (agent, body) => agent.post("/api/orders").send({ clientOrderId: orderId(), ...body });
const funds = async (agent) => (await agent.get("/api/funds")).body;
const sweep = () => engine.sweep();

describe("limit orders", () => {
  it("reserves cash, waits, then fills at the market price when the limit is reached", async () => {
    const { agent } = await signupAgent(ctx.app);
    const res = await place(agent, { symbol: "AAPL", side: "BUY", type: "LIMIT", price: 95, qty: 10, note: "buy the dip" });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ status: "OPEN", type: "LIMIT", triggerPrice: 95, reserved: 950, validity: "DAY", note: "buy the dip" });
    expect(await funds(agent)).toMatchObject({ cash: 99050, reserved: 950 });

    await sweep();
    expect((await agent.get("/api/orders?status=open")).body.orders).toHaveLength(1);

    market.state.prices.AAPL = 94;
    await sweep();
    const executed = (await agent.get("/api/orders")).body.orders;
    expect(executed[0]).toMatchObject({ status: "EXECUTED", price: 94, value: 940, type: "LIMIT" });
    expect(await funds(agent)).toMatchObject({ cash: 99060, reserved: 0 });
    const holdings = (await agent.get("/api/holdings")).body.items;
    expect(holdings[0]).toMatchObject({ symbol: "AAPL", qty: 10, avgPrice: 94 });
    const notes = (await agent.get("/api/notifications")).body;
    expect(notes.unread).toBe(1);
    expect(notes.notifications[0]).toMatchObject({ type: "ORDER_FILLED", title: "LIMIT buy filled: 10 AAPL" });
  });

  it("fills a marketable limit order immediately", async () => {
    const { agent } = await signupAgent(ctx.app);
    const res = await place(agent, { symbol: "AAPL", side: "BUY", type: "LIMIT", price: 110, qty: 2 });
    expect(res.body.order).toMatchObject({ status: "EXECUTED", price: 100 });
    expect(await funds(agent)).toMatchObject({ cash: 99800, reserved: 0 });
  });

  it("fills from streamed quote events, not only the sweep", async () => {
    const { agent } = await signupAgent(ctx.app);
    await place(agent, { symbol: "MSFT", side: "BUY", type: "LIMIT", price: 190, qty: 1 });
    await engine.refreshWatched();
    engine.start();
    market.setPrice("MSFT", 189);
    await vi.waitFor(async () => expect((await agent.get("/api/orders")).body.orders[0]?.status).toBe("EXECUTED"));
    await engine.stop();
  });

  it("never fills while the market is closed", async () => {
    const { agent } = await signupAgent(ctx.app);
    await place(agent, { symbol: "AAPL", side: "BUY", type: "LIMIT", price: 95, qty: 1 });
    market.state.marketState = "closed";
    market.state.prices.AAPL = 90;
    await sweep();
    expect((await agent.get("/api/orders?status=open")).body.orders).toHaveLength(1);
  });

  it("fills exactly once under concurrent evaluations", async () => {
    const { agent } = await signupAgent(ctx.app);
    await place(agent, { symbol: "AAPL", side: "BUY", type: "LIMIT", price: 95, qty: 10 });
    market.state.prices.AAPL = 90;
    await Promise.all([sweep(), sweep(), sweep()]);
    const executed = (await agent.get("/api/orders")).body.orders;
    expect(executed).toHaveLength(1);
    expect(await funds(agent)).toMatchObject({ cash: 99100, reserved: 0 });
    expect((await agent.get("/api/holdings")).body.items[0].qty).toBe(10);
  });
});

describe("stop orders", () => {
  it("stop-loss reserves shares, blocks double-selling them, and sells when the price falls", async () => {
    const { agent } = await signupAgent(ctx.app);
    await place(agent, { symbol: "AAPL", side: "BUY", qty: 10 });
    const stop = await place(agent, { symbol: "AAPL", side: "SELL", type: "STOP", price: 90, qty: 10, validity: "GTC" });
    expect(stop.body.order).toMatchObject({ status: "OPEN", validity: "GTC" });

    const sellReserved = await place(agent, { symbol: "AAPL", side: "SELL", qty: 1 });
    expect(sellReserved.status).toBe(422);
    expect(sellReserved.body.error.message).toMatch(/reserved by open sell orders/);
    const second = await place(agent, { symbol: "AAPL", side: "SELL", type: "LIMIT", price: 120, qty: 1 });
    expect(second.status).toBe(422);

    market.state.prices.AAPL = 89.5;
    await sweep();
    const filled = (await agent.get("/api/orders")).body.orders[0];
    expect(filled).toMatchObject({ side: "SELL", type: "STOP", status: "EXECUTED", price: 89.5, realizedPnl: -105 });
    expect((await agent.get("/api/holdings")).body.items).toHaveLength(0);
    expect((await funds(agent)).cash).toBe(100000 - 1000 + 895);
  });

  it("stop buy reserves a 5% buffer and rejects (releasing it) if the fill would exceed available cash", async () => {
    const { agent } = await signupAgent(ctx.app);
    const res = await place(agent, { symbol: "AAPL", side: "BUY", type: "STOP", price: 105, qty: 900 });
    expect(res.body.order.reserved).toBe(99225);
    expect(await funds(agent)).toMatchObject({ cash: 775, reserved: 99225 });

    market.state.prices.AAPL = 112;
    await sweep();
    const closed = (await agent.get("/api/orders?status=closed")).body.orders;
    expect(closed[0]).toMatchObject({ status: "REJECTED", statusReason: "Not enough virtual cash for this order." });
    expect(await funds(agent)).toMatchObject({ cash: 100000, reserved: 0 });
    expect((await agent.get("/api/notifications")).body.notifications[0].type).toBe("ORDER_REJECTED");
  });

  it("stop buy uses its buffer when the fill is above the trigger", async () => {
    const { agent } = await signupAgent(ctx.app);
    await place(agent, { symbol: "AAPL", side: "BUY", type: "STOP", price: 105, qty: 10 });
    market.state.prices.AAPL = 108;
    await sweep();
    expect((await agent.get("/api/orders")).body.orders[0]).toMatchObject({ status: "EXECUTED", price: 108 });
    expect(await funds(agent)).toMatchObject({ cash: 100000 - 1080, reserved: 0 });
  });
});

describe("cancel, expiry and validation", () => {
  it("cancels open orders, releasing reservations; only the owner can cancel", async () => {
    const alice = await signupAgent(ctx.app);
    const bob = await signupAgent(ctx.app);
    const { order } = (await place(alice.agent, { symbol: "AAPL", side: "BUY", type: "LIMIT", price: 50, qty: 10 })).body;
    expect((await bob.agent.delete(`/api/orders/${order.id}`)).status).toBe(404);
    const res = await alice.agent.delete(`/api/orders/${order.id}`);
    expect(res.body.order).toMatchObject({ status: "CANCELLED" });
    expect(await funds(alice.agent)).toMatchObject({ cash: 100000, reserved: 0 });
    expect((await alice.agent.delete(`/api/orders/${order.id}`)).status).toBe(409);
    expect((await alice.agent.delete("/api/orders/not-an-id")).status).toBe(400);
  });

  it("expires due orders and releases reserved shares", async () => {
    const { agent } = await signupAgent(ctx.app);
    await place(agent, { symbol: "AAPL", side: "BUY", qty: 5 });
    const { order } = (await place(agent, { symbol: "AAPL", side: "SELL", type: "LIMIT", price: 150, qty: 5 })).body;
    await OrderModel.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await sweep();
    expect((await agent.get("/api/orders?status=closed")).body.orders[0]).toMatchObject({ status: "EXPIRED" });
    const h = await HoldingModel.findOne({ symbol: "AAPL" });
    expect(h.reservedQty).toBe(0);
    expect((await place(agent, { symbol: "AAPL", side: "SELL", qty: 5 })).status).toBe(201);
  });

  it("day orders expire at the next 4pm New York close", async () => {
    const { agent } = await signupAgent(ctx.app);
    const { order } = (await place(agent, { symbol: "AAPL", side: "BUY", type: "LIMIT", price: 50, qty: 1 })).body;
    const exp = new Date(order.expiresAt);
    const ny = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(exp);
    expect(ny).toBe("16:00");
    expect(exp.getTime()).toBeGreaterThan(Date.now());
  });

  it("validates conditional orders", async () => {
    const { agent } = await signupAgent(ctx.app);
    expect((await place(agent, { symbol: "AAPL", side: "BUY", type: "LIMIT", qty: 1 })).status).toBe(400);
    expect((await place(agent, { symbol: "AAPL", side: "BUY", type: "LIMIT", price: 1.005, qty: 1 })).status).toBe(400);
    expect((await place(agent, { symbol: "AAPL", side: "BUY", type: "TRAILING", price: 1, qty: 1 })).status).toBe(400);
    expect((await place(agent, { symbol: "AAPL", side: "BUY", type: "LIMIT", price: 50, qty: 1, validity: "IOC" })).status).toBe(400);
    expect((await place(agent, { symbol: "AAPL", side: "BUY", type: "LIMIT", price: 20000, qty: 10 })).status).toBe(422);
    const ok = await place(agent, { symbol: "AAPL", side: "BUY", type: "LIMIT", price: 20000, qty: 1 });
    expect(ok.body.order).toMatchObject({ status: "EXECUTED", price: 100 });
    expect(await funds(agent)).toMatchObject({ cash: 99900, reserved: 0 });
  });

  it("stores trade journal notes on the owner's orders only", async () => {
    const alice = await signupAgent(ctx.app);
    const bob = await signupAgent(ctx.app);
    const { order } = (await place(alice.agent, { symbol: "AAPL", side: "BUY", qty: 1 })).body;
    const res = await alice.agent.patch(`/api/orders/${order.id}/note`).send({ note: "Earnings momentum" });
    expect(res.body.order.note).toBe("Earnings momentum");
    expect((await bob.agent.patch(`/api/orders/${order.id}/note`).send({ note: "x" })).status).toBe(404);
    expect((await alice.agent.patch(`/api/orders/${order.id}/note`).send({ note: "x".repeat(281) })).status).toBe(400);
  });
});

describe("price alerts and notifications", () => {
  it("creates, triggers once, notifies and can be read/removed", async () => {
    const { agent } = await signupAgent(ctx.app);
    const met = await agent.post("/api/alerts").send({ symbol: "AAPL", condition: "ABOVE", value: 95 });
    expect(met.status).toBe(422);
    expect(met.body.error.code).toBe("ALREADY_MET");

    const created = await agent.post("/api/alerts").send({ symbol: "AAPL", condition: "ABOVE", value: 105, note: "breakout" });
    expect(created.status).toBe(201);
    expect(created.body.alert).toMatchObject({ status: "ACTIVE", description: "price rises to $105.00 or above" });
    await agent.post("/api/alerts").send({ symbol: "AAPL", condition: "CHANGE_DOWN", value: 5 });

    market.state.prices.AAPL = 106;
    await sweep();
    await sweep();
    const alerts = (await agent.get("/api/alerts")).body.alerts;
    expect(alerts.find((a) => a.condition === "ABOVE")).toMatchObject({ status: "TRIGGERED", triggerPrice: 106 });
    expect(alerts.find((a) => a.condition === "CHANGE_DOWN").status).toBe("ACTIVE");

    const notes = (await agent.get("/api/notifications")).body;
    expect(notes.notifications.filter((n) => n.type === "ALERT")).toHaveLength(1);
    expect(notes.notifications[0].body).toContain("Note: breakout");
    await agent.post("/api/notifications/read");
    expect((await agent.get("/api/notifications")).body.unread).toBe(0);

    const id = alerts.find((a) => a.condition === "CHANGE_DOWN").id;
    expect((await agent.delete(`/api/alerts/${id}`)).status).toBe(204);
    expect((await agent.get("/api/alerts")).body.alerts.some((a) => a.id === id)).toBe(false);
  });

  it("evaluates percent-change alerts against the previous close", async () => {
    const { agent } = await signupAgent(ctx.app);
    market.state.prevClose.MSFT = 200;
    await agent.post("/api/alerts").send({ symbol: "MSFT", condition: "CHANGE_DOWN", value: 3 });
    market.state.prices.MSFT = 195;
    await sweep();
    expect((await agent.get("/api/alerts")).body.alerts[0].status).toBe("ACTIVE");
    market.state.prices.MSFT = 193;
    await sweep();
    expect((await agent.get("/api/alerts")).body.alerts[0].status).toBe("TRIGGERED");
  });

  it("validates alerts and keeps them private", async () => {
    const alice = await signupAgent(ctx.app);
    const bob = await signupAgent(ctx.app);
    expect((await alice.agent.post("/api/alerts").send({ symbol: "AAPL", condition: "SIDEWAYS", value: 1 })).status).toBe(400);
    expect((await alice.agent.post("/api/alerts").send({ symbol: "AAPL", condition: "CHANGE_UP", value: 150 })).status).toBe(400);
    expect((await alice.agent.post("/api/alerts").send({ symbol: "ZZZZ", condition: "ABOVE", value: 1 })).status).toBe(422);
    const { alert } = (await alice.agent.post("/api/alerts").send({ symbol: "AAPL", condition: "BELOW", value: 50 })).body;
    expect((await bob.agent.get("/api/alerts")).body.alerts).toHaveLength(0);
    expect((await bob.agent.delete(`/api/alerts/${alert.id}`)).status).toBe(404);
  });
});

describe("migrations", () => {
  it("backfills filledAt for executed orders from before fill timestamps existed", async () => {
    const { user } = await signupAgent(ctx.app);
    const created = new Date("2026-01-02T15:00:00Z");
    await OrderModel.collection.insertOne({
      user: new mongoose.Types.ObjectId(user.id),
      symbol: "AAPL",
      side: "BUY",
      qty: 1,
      priceCents: 100,
      valueCents: 100,
      status: "EXECUTED",
      clientOrderId: "legacy-order-1",
      createdAt: created,
    });
    await runMigrations(silentLogger);
    const doc = await OrderModel.findOne({ clientOrderId: "legacy-order-1" }).lean();
    expect(doc.filledAt).toEqual(created);
  });
});

describe("account value with open orders", () => {
  it("counts reserved cash in account value and snapshots", async () => {
    const { agent } = await signupAgent(ctx.app);
    await place(agent, { symbol: "AAPL", side: "BUY", type: "LIMIT", price: 50, qty: 100 });
    const a = (await agent.get("/api/portfolio/analytics")).body;
    expect(a.totals).toMatchObject({ cash: 95000, reservedCash: 5000, accountValue: 100000, cashPct: 100 });
    expect(a.history.at(-1).accountValue).toBe(100000);
  });
});

describe("performance vs benchmark", () => {
  it("rebases portfolio and SPY returns and ignores deposits as performance", async () => {
    market.state.prices.SPY = 500;
    const { agent } = await signupAgent(ctx.app);
    await place(agent, { symbol: "AAPL", side: "BUY", qty: 100 });
    await vi.waitFor(async () => expect((await agent.get("/api/portfolio/analytics")).body.performance.length).toBeGreaterThanOrEqual(1));

    market.state.prices.AAPL = 110;
    market.state.prices.SPY = 510;
    await agent.post("/api/funds/deposit").send({ amount: 50000 });
    await vi.waitFor(async () => {
      const perf = (await agent.get("/api/portfolio/analytics")).body.performance;
      expect(perf.at(-1)).toMatchObject({ portfolioPct: 1, benchmarkPct: 2 });
    });
    const perf = (await agent.get("/api/portfolio/analytics")).body.performance;
    expect(perf[0]).toMatchObject({ portfolioPct: 0, benchmarkPct: 0 });
  });
});
