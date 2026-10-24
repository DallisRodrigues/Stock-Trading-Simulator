const mongoose = require("mongoose");
const { setupTestApp, signupAgent, orderId, silentLogger } = require("./helpers");
const { PortfolioSnapshotModel } = require("../src/models/PortfolioSnapshot");
const { CompanyDataModel } = require("../src/models/CompanyData");
const { createCompanyDataService } = require("../src/services/companyData");
const { normalizeMetrics, normalizeProfile, normalizeNews, normalizeRecommendations } = require("../src/services/marketData/finnhubRest");

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

const buy = (agent, symbol, qty) => agent.post("/api/orders").send({ symbol, side: "BUY", qty, clientOrderId: orderId() });
const sell = (agent, symbol, qty) => agent.post("/api/orders").send({ symbol, side: "SELL", qty, clientOrderId: orderId() });

describe("portfolio analytics", () => {
  it("computes totals, allocation, day P&L, risk and activity from real holdings", async () => {
    const { agent } = await signupAgent(ctx.app);
    await buy(agent, "AAPL", 10);
    await buy(agent, "MSFT", 5);
    await buy(agent, "KO", 50);
    await sell(agent, "AAPL", 2);

    const res = await agent.get("/api/portfolio/analytics");
    expect(res.status).toBe(200);
    const a = res.body;
    expect(a.provider).toBe("demo");
    expect(a.totals).toMatchObject({
      cash: 100000 - 1900 - 2050 - 3100 + 380,
      holdingsValue: 1520 + 2050 + 3100,
      invested: 1520 + 2050 + 3100,
      unrealizedPnl: 0,
      realizedPnl: 0,
    });
    expect(a.totals.accountValue).toBe(100000);
    expect(a.totals.dayPnl).toBeCloseTo(14.4 - 12 + 10, 2);

    const weights = Object.fromEntries(a.holdings.map((h) => [h.symbol, h.weight]));
    expect(weights.KO).toBeCloseTo((3100 / 6670) * 100, 1);
    expect(a.holdings.find((h) => h.symbol === "AAPL")).toMatchObject({ sector: "Technology", name: "Apple Inc", qty: 8 });
    expect(a.sectorAllocation).toEqual([
      { sector: "Technology", value: 3570 },
      { sector: "Beverages", value: 3100 },
    ]);
    expect(a.risk.holdingsCount).toBe(3);
    expect(a.risk.largestPosition.symbol).toBe("KO");
    const w = [1520, 2050, 3100].map((v) => v / 6670);
    expect(a.risk.effectiveHoldings).toBeCloseTo(1 / w.reduce((s, x) => s + x * x, 0), 1);
    expect(a.risk.weightedBeta).toBeNull();

    expect(a.activity).toHaveLength(1);
    expect(a.activity[0]).toMatchObject({ buyValue: 7050, sellValue: 380, orders: 4 });
    expect(a.realizedSeries).toHaveLength(1);
    expect(a.history.length).toBeGreaterThanOrEqual(2);
    expect(a.history.at(-1)).toMatchObject({ accountValue: 100000, invested: 6670, priceSource: "demo" });
    expect(a.history.every((h) => h.priceSource === "demo")).toBe(true);
  });

  it("records snapshots on changes but throttles unchanged repeats", async () => {
    const { agent, user } = await signupAgent(ctx.app);
    const uid = new mongoose.Types.ObjectId(user.id);
    await agent.get("/api/portfolio/analytics");
    await agent.get("/api/portfolio/analytics");
    expect(await PortfolioSnapshotModel.countDocuments({ user: uid })).toBe(1);

    await buy(agent, "AAPL", 1);
    await vi.waitFor(async () => expect(await PortfolioSnapshotModel.countDocuments({ user: uid })).toBe(2));
    await agent.post("/api/funds/deposit").send({ amount: 100 });
    await vi.waitFor(async () => expect(await PortfolioSnapshotModel.countDocuments({ user: uid })).toBe(3));
    await agent.get("/api/portfolio/analytics");
    expect(await PortfolioSnapshotModel.countDocuments({ user: uid })).toBe(3);
  });

  it("returns an empty but well-formed result for a new account", async () => {
    const { agent } = await signupAgent(ctx.app);
    const a = (await agent.get("/api/portfolio/analytics")).body;
    expect(a.holdings).toEqual([]);
    expect(a.totals).toMatchObject({ accountValue: 100000, cashPct: 100, dayPnl: null });
    expect(a.risk.effectiveHoldings).toBeNull();
  });

  it("is scoped to the logged-in user", async () => {
    const alice = await signupAgent(ctx.app);
    const bob = await signupAgent(ctx.app);
    await buy(alice.agent, "AAPL", 3);
    const b = (await bob.agent.get("/api/portfolio/analytics")).body;
    expect(b.holdings).toEqual([]);
    expect((await request401()).status).toBe(401);
  });
});

const request401 = () => require("supertest")(ctx.app).get("/api/portfolio/analytics");

describe("company data endpoints (demo provider)", () => {
  it("serves profile, sample metrics and peers, labelled with the provider", async () => {
    const { agent } = await signupAgent(ctx.app);
    const res = await agent.get("/api/market/company/aapl");
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("demo");
    expect(res.body.profile.data).toMatchObject({ name: "Apple Inc", industry: "Technology" });
    expect(res.body.metrics.data).toMatchObject({ high52: 228, low52: 152 });
    expect(res.body.peers.data).toEqual(expect.arrayContaining(["MSFT", "IBM", "ORCL"]));
    const news = await agent.get("/api/market/news/AAPL");
    expect(news.body).toMatchObject({ symbol: "AAPL", data: [] });
    expect((await agent.get("/api/market/company/not a symbol")).status).toBe(400);
  });
});

describe("company data cache", () => {
  const fakeMarket = (overrides = {}) => {
    const calls = { profile: 0 };
    return {
      calls,
      provider: "finnhub",
      company: {
        profile: async (s) => {
          calls.profile += 1;
          if (overrides.fail) {
            const e = new Error("budget");
            e.code = "BUDGET_EXHAUSTED";
            throw e;
          }
          return { name: `${s} Inc`, industry: "Tech" };
        },
      },
    };
  };

  it("reuses fresh cache entries and refetches after the TTL", async () => {
    let t = Date.now();
    const md = fakeMarket();
    const svc = createCompanyDataService({ marketData: md, logger: silentLogger, now: () => t });
    const first = await svc.get("profile", "AAPL");
    const second = await svc.get("profile", "AAPL");
    expect(first.data.name).toBe("AAPL Inc");
    expect(second.source).toBe("finnhub");
    expect(md.calls.profile).toBe(1);
    t += 8 * 24 * 60 * 60_000;
    await svc.get("profile", "AAPL");
    expect(md.calls.profile).toBe(2);
  });

  it("serves stale cache when the provider budget is exhausted", async () => {
    let t = Date.now();
    await createCompanyDataService({ marketData: fakeMarket(), logger: silentLogger, now: () => t }).get("profile", "MSFT");
    t += 8 * 24 * 60 * 60_000;
    const svc = createCompanyDataService({ marketData: fakeMarket({ fail: true }), logger: silentLogger, now: () => t });
    const res = await svc.get("profile", "MSFT");
    expect(res).toMatchObject({ stale: true, error: "BUDGET_EXHAUSTED", data: { name: "MSFT Inc" } });
  });

  it("never presents demo-cached data as real provider data", async () => {
    await CompanyDataModel.create({ symbol: "TSLA", kind: "profile", source: "demo", data: { name: "Sample" }, fetchedAt: new Date() });
    const md = fakeMarket();
    const res = await createCompanyDataService({ marketData: md, logger: silentLogger }).get("profile", "TSLA");
    expect(res.data.name).toBe("TSLA Inc");
    expect(md.calls.profile).toBe(1);
  });

  it("can be restricted to cached data only", async () => {
    const md = fakeMarket();
    const res = await createCompanyDataService({ marketData: md, logger: silentLogger }).get("profile", "NVDA", { allowFetch: false });
    expect(res).toMatchObject({ data: null, pending: true });
    expect(md.calls.profile).toBe(0);
  });
});

describe("Finnhub company normalizers", () => {
  it("normalizes profile units and rejects non-https assets", () => {
    const p = normalizeProfile({ ticker: "AAPL", name: "Apple Inc", finnhubIndustry: "Technology", marketCapitalization: 3000000, shareOutstanding: 15000, logo: "http://x/logo.png", weburl: "https://www.apple.com/" });
    expect(p).toMatchObject({ name: "Apple Inc", industry: "Technology", marketCap: 3e12, sharesOutstanding: 1.5e10, logo: null, website: "https://www.apple.com/" });
    expect(normalizeProfile({})).toBeNull();
  });

  it("keeps the needed metrics and orders series oldest-first", () => {
    const m = normalizeMetrics({
      metric: { "52WeekHigh": 350, "52WeekLow": 240, beta: 1.1, peTTM: 39, "52WeekPriceReturnDaily": 34.7, "10DayAverageTradingVolume": 50.5 },
      series: { annual: { eps: [{ period: "2025-09-27", v: 7.4 }, { period: "2024-09-28", v: 6.1 }, { period: "bad", v: null }] } },
    });
    expect(m).toMatchObject({ high52: 350, low52: 240, beta: 1.1, peTTM: 39, avgVolume10D: 50.5e6 });
    expect(m.returns["52W"]).toBe(34.7);
    expect(m.returns.YTD).toBeNull();
    expect(m.annual.eps).toEqual([
      { period: "2024-09-28", v: 6.1 },
      { period: "2025-09-27", v: 7.4 },
    ]);
    expect(normalizeMetrics({})).toBeNull();
  });

  it("sorts news newest first, converts seconds and drops unsafe links", () => {
    const n = normalizeNews([
      { id: 1, headline: "Old", url: "https://a.example/1", datetime: 100 },
      { id: 2, headline: "New", url: "https://a.example/2", datetime: 200, source: "Wire" },
      { id: 3, headline: "Bad", url: "javascript:alert(1)", datetime: 300 },
    ]);
    expect(n.map((x) => x.headline)).toEqual(["New", "Old"]);
    expect(n[0].datetime).toBe(200000);
  });

  it("orders recommendation periods oldest first", () => {
    const r = normalizeRecommendations([
      { period: "2026-10-01", buy: 20, hold: 14 },
      { period: "2026-09-01", buy: 18, hold: 15 },
    ]);
    expect(r.map((x) => x.period)).toEqual(["2026-09-01", "2026-10-01"]);
    expect(r[0]).toMatchObject({ strongBuy: 0, buy: 18, hold: 15, sell: 0, strongSell: 0 });
  });
});
