const request = require("supertest");
const mongoose = require("mongoose");
const { setupTestApp, signupAgent, orderId } = require("./helpers");
const { UserModel } = require("../src/models/User");

let ctx;

beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await ctx.teardown();
});
beforeEach(async () => {
  await ctx.reset();
});

describe("health and routing", () => {
  it("reports database and market data status", async () => {
    const res = await request(ctx.app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", db: "up", market: { provider: "demo" } });
  });

  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(ctx.app).get("/api/does-not-exist");
    expect([401, 404]).toContain(res.status);
    const res2 = await request(ctx.app).get("/nope");
    expect(res2.status).toBe(404);
    expect(res2.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await request(ctx.app).post("/api/auth/login").set("content-type", "application/json").send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_JSON");
  });

  it("sets security headers and hides x-powered-by", async () => {
    const res = await request(ctx.app).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("authentication", () => {
  it("signs up with hashed password, starting cash and default watchlist", async () => {
    const { agent, user, credentials } = await signupAgent(ctx.app);
    expect(user).toMatchObject({ name: "Test User", cash: 100000 });
    expect(user).not.toHaveProperty("passwordHash");
    const stored = await UserModel.findOne({ email: credentials.email }).select("+passwordHash");
    expect(stored.passwordHash).not.toBe(credentials.password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(stored.watchlists[0].symbols.length).toBeGreaterThan(0);
    expect(stored.netDepositsCents).toBe(10_000_000);
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(credentials.email);
  });

  it("issues an httpOnly SameSite=Lax cookie", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/signup")
      .send({ name: "Cookie Check", email: "cookie@example.com", password: "password123" });
    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toMatch(/^token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("validates signup input", async () => {
    const res = await request(ctx.app).post("/api/auth/signup").send({ name: "A", email: "not-an-email", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(["email", "name", "password"]);
  });

  it("rejects duplicate emails case-insensitively", async () => {
    await signupAgent(ctx.app, { email: "dup@example.com" });
    const res = await request(ctx.app).post("/api/auth/signup").send({ name: "Second", email: "DUP@example.com", password: "password123" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("logs in and rejects wrong credentials with a generic message", async () => {
    const { credentials } = await signupAgent(ctx.app);
    const ok = await request(ctx.app).post("/api/auth/login").send({ email: credentials.email, password: credentials.password });
    expect(ok.status).toBe(200);
    const bad = await request(ctx.app).post("/api/auth/login").send({ email: credentials.email, password: "wrong-password" });
    const unknown = await request(ctx.app).post("/api/auth/login").send({ email: "nobody@example.com", password: "whatever1" });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  it("rejects operator injection in login payloads", async () => {
    const res = await request(ctx.app).post("/api/auth/login").send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it("requires authentication for protected routes", async () => {
    for (const path of ["/api/holdings", "/api/positions", "/api/orders", "/api/funds", "/api/watchlist", "/api/market/status"]) {
      const res = await request(ctx.app).get(path);
      expect(res.status, path).toBe(401);
    }
  });

  it("rejects tampered and foreign-secret tokens", async () => {
    const jwt = require("jsonwebtoken");
    const { user } = await signupAgent(ctx.app);
    const forged = jwt.sign({ sub: user.id, tv: 0 }, "some-other-secret-some-other-secret");
    const res = await request(ctx.app).get("/api/funds").set("Cookie", `token=${forged}`);
    expect(res.status).toBe(401);
  });

  it("revokes existing tokens on logout", async () => {
    const { agent } = await signupAgent(ctx.app);
    const meBefore = await agent.get("/api/auth/me");
    const token = /token=([^;]+)/.exec(meBefore.request.cookies || "")?.[1];
    const logout = await agent.post("/api/auth/logout");
    expect(logout.status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
    if (token) {
      const replay = await request(ctx.app).get("/api/auth/me").set("Cookie", `token=${token}`);
      expect(replay.status).toBe(401);
    }
  });

  it("blocks state-changing requests from foreign origins", async () => {
    const { agent } = await signupAgent(ctx.app);
    const res = await agent.post("/api/funds/deposit").set("Origin", "https://evil.example").send({ amount: 10 });
    expect(res.status).toBe(403);
    const ok = await agent.post("/api/funds/deposit").set("Origin", "http://localhost:5174").send({ amount: 10 });
    expect(ok.status).toBe(200);
  });
});

describe("simulated orders", () => {
  it("buys at the server-side price, ignoring any client price", async () => {
    const { agent } = await signupAgent(ctx.app);
    const res = await agent.post("/api/orders").send({ symbol: "aapl", side: "BUY", qty: 10, price: 0.01, clientOrderId: orderId() });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ symbol: "AAPL", side: "BUY", qty: 10, price: 190, value: 1900, status: "EXECUTED", priceSource: "demo" });

    const funds = await agent.get("/api/funds");
    expect(funds.body).toMatchObject({ cash: 98100, invested: 1900 });
    const holdings = await agent.get("/api/holdings");
    expect(holdings.body.items).toHaveLength(1);
    expect(holdings.body.items[0]).toMatchObject({ symbol: "AAPL", qty: 10, avgPrice: 190, ltp: 190, curValue: 1900, pnl: 0 });
  });

  it("averages cost across buys and realizes P&L on sells", async () => {
    const { agent } = await signupAgent(ctx.app);
    await agent.post("/api/orders").send({ symbol: "MSFT", side: "BUY", qty: 4, clientOrderId: orderId() });
    await agent.post("/api/orders").send({ symbol: "MSFT", side: "BUY", qty: 6, clientOrderId: orderId() });
    const sell = await agent.post("/api/orders").send({ symbol: "MSFT", side: "SELL", qty: 5, clientOrderId: orderId() });
    expect(sell.status).toBe(201);
    expect(sell.body.order.realizedPnl).toBe(0);
    const holdings = await agent.get("/api/holdings");
    expect(holdings.body.items[0]).toMatchObject({ symbol: "MSFT", qty: 5, avgPrice: 410 });

    await agent.post("/api/orders").send({ symbol: "MSFT", side: "SELL", qty: 5, clientOrderId: orderId() });
    const after = await agent.get("/api/holdings");
    expect(after.body.items).toHaveLength(0);
    expect((await agent.get("/api/funds")).body.cash).toBe(100000);
  });

  it("rejects orders beyond available cash and leaves balances untouched", async () => {
    const { agent } = await signupAgent(ctx.app);
    const res = await agent.post("/api/orders").send({ symbol: "NFLX", side: "BUY", qty: 1000, clientOrderId: orderId() });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INSUFFICIENT_FUNDS");
    expect((await agent.get("/api/funds")).body.cash).toBe(100000);
    expect((await agent.get("/api/orders")).body.orders).toHaveLength(0);
  });

  it("rejects selling more than held", async () => {
    const { agent } = await signupAgent(ctx.app);
    await agent.post("/api/orders").send({ symbol: "AMD", side: "BUY", qty: 2, clientOrderId: orderId() });
    const res = await agent.post("/api/orders").send({ symbol: "AMD", side: "SELL", qty: 3, clientOrderId: orderId() });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INSUFFICIENT_QUANTITY");
  });

  it("is idempotent for retried submissions with the same clientOrderId", async () => {
    const { agent } = await signupAgent(ctx.app);
    const id = orderId();
    const body = { symbol: "AAPL", side: "BUY", qty: 1, clientOrderId: id };
    const results = await Promise.all([agent.post("/api/orders").send(body), agent.post("/api/orders").send(body), agent.post("/api/orders").send(body)]);
    const created = results.filter((r) => r.status === 201);
    expect(created).toHaveLength(1);
    expect(new Set(results.map((r) => r.body.order.id)).size).toBe(1);
    expect((await agent.get("/api/funds")).body.cash).toBe(99810);
  });

  it("never overdraws cash under concurrent buys", async () => {
    const { agent } = await signupAgent(ctx.app);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => agent.post("/api/orders").send({ symbol: "NFLX", side: "BUY", qty: 50, clientOrderId: orderId() }))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    const funds = await agent.get("/api/funds");
    expect(funds.body.cash).toBe(7000);
    const holdings = await agent.get("/api/holdings");
    expect(holdings.body.items[0].qty).toBe(150);
  });

  it("never oversells under concurrent sells", async () => {
    const { agent } = await signupAgent(ctx.app);
    await agent.post("/api/orders").send({ symbol: "KO", side: "BUY", qty: 10, clientOrderId: orderId() });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => agent.post("/api/orders").send({ symbol: "KO", side: "SELL", qty: 4, clientOrderId: orderId() }))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    const holdings = await agent.get("/api/holdings");
    expect(holdings.body.items[0].qty).toBe(2);
    expect((await agent.get("/api/funds")).body.cash).toBe(100000 - 62 * 2);
  });

  it("validates order input", async () => {
    const { agent } = await signupAgent(ctx.app);
    const cases = [
      { symbol: "AAPL", side: "BUY", qty: 0 },
      { symbol: "AAPL", side: "BUY", qty: 1.5 },
      { symbol: "AAPL", side: "HOLD", qty: 1 },
      { symbol: "not a symbol!", side: "BUY", qty: 1 },
      { symbol: "AAPL", side: "BUY", qty: "1" },
    ];
    for (const c of cases) {
      const res = await agent.post("/api/orders").send({ ...c, clientOrderId: orderId() });
      expect(res.status, JSON.stringify(c)).toBe(400);
    }
  });

  it("returns 422 for symbols the provider does not know", async () => {
    const { agent } = await signupAgent(ctx.app);
    const res = await agent.post("/api/orders").send({ symbol: "ZZZZ", side: "BUY", qty: 1, clientOrderId: orderId() });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("UNKNOWN_SYMBOL");
  });

  it("lists orders newest first and derives intraday positions", async () => {
    const { agent } = await signupAgent(ctx.app);
    await agent.post("/api/orders").send({ symbol: "AAPL", side: "BUY", qty: 3, clientOrderId: orderId() });
    await agent.post("/api/orders").send({ symbol: "AAPL", side: "SELL", qty: 1, clientOrderId: orderId() });
    const orders = await agent.get("/api/orders");
    expect(orders.body.orders.map((o) => o.side)).toEqual(["SELL", "BUY"]);
    const positions = await agent.get("/api/positions");
    expect(positions.body.positions[0]).toMatchObject({ symbol: "AAPL", buyQty: 3, sellQty: 1, netQty: 2, pnl: 0 });
  });
});

describe("data ownership", () => {
  it("never exposes one user's portfolio to another", async () => {
    const alice = await signupAgent(ctx.app);
    const bob = await signupAgent(ctx.app);
    await alice.agent.post("/api/orders").send({ symbol: "TSLA", side: "BUY", qty: 2, clientOrderId: orderId() });
    expect((await bob.agent.get("/api/holdings")).body.items).toHaveLength(0);
    expect((await bob.agent.get("/api/orders")).body.orders).toHaveLength(0);
    expect((await bob.agent.get("/api/positions")).body.positions).toHaveLength(0);
    const sell = await bob.agent.post("/api/orders").send({ symbol: "TSLA", side: "SELL", qty: 1, clientOrderId: orderId() });
    expect(sell.status).toBe(422);
  });

  it("lets two users reuse the same clientOrderId independently", async () => {
    const alice = await signupAgent(ctx.app);
    const bob = await signupAgent(ctx.app);
    const id = orderId();
    const a = await alice.agent.post("/api/orders").send({ symbol: "AAPL", side: "BUY", qty: 1, clientOrderId: id });
    const b = await bob.agent.post("/api/orders").send({ symbol: "AAPL", side: "BUY", qty: 1, clientOrderId: id });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.order.id).not.toBe(b.body.order.id);
  });
});

describe("funds", () => {
  it("deposits and withdraws virtual cash with validation", async () => {
    const { agent } = await signupAgent(ctx.app);
    expect((await agent.post("/api/funds/deposit").send({ amount: 250.5 })).body.cash).toBe(100250.5);
    expect((await agent.post("/api/funds/withdraw").send({ amount: 0.5 })).body.cash).toBe(100250);
    const over = await agent.post("/api/funds/withdraw").send({ amount: 200000 });
    expect(over.status).toBe(422);
    expect((await agent.post("/api/funds/deposit").send({ amount: -5 })).status).toBe(400);
    expect((await agent.post("/api/funds/deposit").send({ amount: 1.234 })).status).toBe(400);
    expect((await agent.post("/api/funds/deposit").send({ amount: 5_000_000 })).status).toBe(400);
  });
});

describe("watchlist", () => {
  it("adds, deduplicates and removes symbols with quotes", async () => {
    const { agent } = await signupAgent(ctx.app);
    const initial = await agent.get("/api/watchlist");
    expect(initial.body.symbols).toContain("AAPL");
    expect(initial.body.quotes.AAPL).toMatchObject({ symbol: "AAPL", price: 190, status: "demo" });

    const add = await agent.post("/api/watchlist").send({ symbol: "ko" });
    expect(add.status).toBe(201);
    expect(add.body.symbols).toContain("KO");
    const again = await agent.post("/api/watchlist").send({ symbol: "KO" });
    expect(again.status).toBe(200);
    expect(again.body.symbols.filter((s) => s === "KO")).toHaveLength(1);

    const del = await agent.delete("/api/watchlist/KO");
    expect(del.status).toBe(200);
    expect(del.body.symbols).not.toContain("KO");
  });

  it("rejects unknown symbols and enforces the 50-symbol limit", async () => {
    const { agent, user } = await signupAgent(ctx.app);
    expect((await agent.post("/api/watchlist").send({ symbol: "ZZZZ" })).status).toBe(422);
    await UserModel.updateOne(
      { _id: new mongoose.Types.ObjectId(user.id) },
      { $set: { "watchlists.0.symbols": Array.from({ length: 50 }, (_, i) => `SYM${i}`) } }
    );
    const full = await agent.post("/api/watchlist").send({ symbol: "KO" });
    expect(full.status).toBe(422);
    expect(full.body.error.code).toBe("WATCHLIST_FULL");
  });
});

describe("market endpoints", () => {
  it("serves quotes, search and session history", async () => {
    const { agent } = await signupAgent(ctx.app);
    const quotes = await agent.get("/api/market/quotes?symbols=AAPL,zzzz,bad symbol");
    expect(quotes.body.quotes.AAPL.price).toBe(190);
    expect(quotes.body.quotes.ZZZZ).toMatchObject({ status: "unavailable", reason: "UNKNOWN_SYMBOL" });
    const search = await agent.get("/api/market/search?q=micro");
    expect(search.body.results.map((r) => r.symbol)).toContain("MSFT");
    const hist = await agent.get("/api/market/history/AAPL");
    expect(hist.body.points.length).toBeGreaterThan(0);
    expect((await agent.get("/api/market/quotes")).status).toBe(400);
  });
});

describe("auth rate limiting", () => {
  it("throttles repeated login attempts", async () => {
    const { createApp } = require("../src/app");
    const { createMarketDataService } = require("../src/services/marketData");
    const { silentLogger } = require("./helpers");
    const app = createApp({
      config: { ...ctx.config, authRateLimit: 3 },
      marketData: createMarketDataService({ provider: "demo", logger: silentLogger }),
      logger: silentLogger,
    });
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post("/api/auth/login").send({ email: "x@example.com", password: "wrong-pass" });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);
  });
});

describe("session probe", () => {
  it("returns the user when logged in and null otherwise", async () => {
    expect((await request(ctx.app).get("/api/auth/session")).body).toEqual({ user: null });
    const { agent, user } = await signupAgent(ctx.app);
    expect((await agent.get("/api/auth/session")).body.user.id).toBe(user.id);
  });
});
