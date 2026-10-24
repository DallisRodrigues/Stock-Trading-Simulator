const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");
const { setupTestApp, silentLogger } = require("./helpers");
const { createApp } = require("../src/app");
const { loadConfig } = require("../src/config");
const { UserModel } = require("../src/models/User");
const { OrderModel } = require("../src/models/Order");
const { HoldingModel } = require("../src/models/Holding");

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

const appWith = (overrides) =>
  createApp({ config: { ...ctx.config, ...overrides, guest: { ...ctx.config.guest, ...overrides.guest } }, marketData: ctx.marketData, logger: silentLogger });

describe("guest demo accounts", () => {
  it("creates an isolated, pre-filled temporary account and signs it in", async () => {
    const agent = request.agent(ctx.app);
    const res = await agent.post("/api/auth/guest");
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: "Guest Trader", isGuest: true });
    expect(new Date(res.body.user.guestExpiresAt).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    const holdings = (await agent.get("/api/holdings")).body.items.map((h) => h.symbol).sort();
    expect(holdings).toEqual(["AAPL", "AMZN", "META", "MSFT", "NVDA"]);
    const open = (await agent.get("/api/orders?status=open")).body.orders;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ symbol: "AMD", type: "LIMIT", triggerPrice: 152 });
    expect((await agent.get("/api/alerts")).body.alerts[0]).toMatchObject({ symbol: "TSLA", condition: "CHANGE_DOWN" });
    expect((await agent.get("/api/watchlists")).body.lists.map((l) => l.name)).toEqual(["Watchlist 1", "ETFs & dividends"]);

    const other = request.agent(ctx.app);
    await other.post("/api/auth/guest");
    expect((await other.get("/api/auth/me")).body.user.id).not.toBe(res.body.user.id);
  });

  it("deletes the guest and all their data on logout", async () => {
    const agent = request.agent(ctx.app);
    const { user } = (await agent.post("/api/auth/guest")).body;
    await agent.post("/api/auth/logout");
    expect(await UserModel.exists({ _id: user.id })).toBeNull();
    expect(await OrderModel.countDocuments({ user: user.id })).toBe(0);
    expect(await HoldingModel.countDocuments({ user: user.id })).toBe(0);
  });

  it("cleans up expired guests but never regular users", async () => {
    const agent = request.agent(ctx.app);
    const { user } = (await agent.post("/api/auth/guest")).body;
    const real = await request(ctx.app).post("/api/auth/signup").send({ name: "Real User", email: "real@example.com", password: "password123" });
    await UserModel.updateOne({ _id: user.id }, { $set: { guestExpiresAt: new Date(Date.now() - 1000) } });
    expect(await ctx.app.locals.guests.cleanupExpired()).toBe(1);
    expect(await UserModel.exists({ _id: user.id })).toBeNull();
    expect(await UserModel.exists({ _id: real.body.user.id })).not.toBeNull();
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("caps concurrent guests and can be disabled", async () => {
    const capped = appWith({ guest: { maxActive: 1 } });
    expect((await request(capped).post("/api/auth/guest")).status).toBe(201);
    const busy = await request(capped).post("/api/auth/guest");
    expect(busy.status).toBe(503);
    expect(busy.body.error.code).toBe("DEMO_BUSY");
    expect((await request(appWith({ guest: { enabled: false } })).post("/api/auth/guest")).status).toBe(403);
  });
});

describe("deployment configuration", () => {
  it("validates cookie SameSite settings", () => {
    const base = { MONGODB_URI: "x", JWT_SECRET: "y".repeat(40) };
    expect(() => loadConfig({ ...base, COOKIE_SAMESITE: "bogus" })).toThrow(/COOKIE_SAMESITE/);
    expect(() => loadConfig({ ...base, COOKIE_SAMESITE: "none" })).toThrow(/requires NODE_ENV=production/);
    expect(loadConfig({ ...base, COOKIE_SAMESITE: "none", NODE_ENV: "production" }).cookieSameSite).toBe("none");
    expect(loadConfig({ ...base, TRUST_PROXY: "1" }).trustProxy).toBe(1);
  });

  it("marks cookies Secure in production", async () => {
    const prod = appWith({ isProduction: true });
    const res = await request(prod).post("/api/auth/signup").send({ name: "Prod User", email: "prod@example.com", password: "password123" });
    expect(res.headers["set-cookie"][0]).toMatch(/Secure/);
  });

  it("rate-limits by the real client IP behind a trusted proxy", async () => {
    const proxied = appWith({ trustProxy: 1, authRateLimit: 2 });
    const attempt = (ip) => request(proxied).post("/api/auth/login").set("X-Forwarded-For", ip).send({ email: "x@example.com", password: "nope-nope" });
    expect((await attempt("1.1.1.1")).status).toBe(401);
    expect((await attempt("1.1.1.1")).status).toBe(401);
    expect((await attempt("1.1.1.1")).status).toBe(429);
    expect((await attempt("2.2.2.2")).status).toBe(401);
  });

  it("serves both SPAs from one origin in single-service mode", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zc-static-"));
    const landing = path.join(dir, "landing");
    const dashboard = path.join(dir, "dashboard");
    fs.mkdirSync(landing);
    fs.mkdirSync(dashboard);
    fs.writeFileSync(path.join(landing, "index.html"), "<html>landing</html>");
    fs.writeFileSync(path.join(dashboard, "index.html"), "<html>dashboard</html>");
    fs.writeFileSync(path.join(dashboard, "logo.svg"), "<svg/>");
    process.env.STATIC_LANDING_DIR = landing;
    process.env.STATIC_DASHBOARD_DIR = dashboard;
    try {
      const app = appWith({ serveStatic: true });
      expect((await request(app).get("/")).text).toContain("landing");
      expect((await request(app).get("/pricing")).text).toContain("landing");
      expect((await request(app).get("/app")).text).toContain("dashboard");
      expect((await request(app).get("/app/orders")).text).toContain("dashboard");
      expect((await request(app).get("/app/logo.svg")).status).toBe(200);
      const api404 = await request(app).get("/api/nope");
      expect([401, 404]).toContain(api404.status);
      expect(api404.headers["content-type"]).toMatch(/json/);
      expect((await request(app).get("/api/health")).body.status).toBe("ok");
    } finally {
      delete process.env.STATIC_LANDING_DIR;
      delete process.env.STATIC_DASHBOARD_DIR;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("origin check", () => {
  it("allows same-origin writes (single-service deploy) but still blocks foreign origins", async () => {
    const agent = request.agent(ctx.app);
    await agent.post("/api/auth/signup").send({ name: "Origin Test", email: "origin@example.com", password: "password123" });
    const same = await agent.post("/api/funds/deposit").set("Host", "trade.example.com").set("Origin", "https://trade.example.com").send({ amount: 1 });
    expect(same.status).toBe(200);
    const foreign = await agent.post("/api/funds/deposit").set("Host", "trade.example.com").set("Origin", "https://evil.example").send({ amount: 1 });
    expect(foreign.status).toBe(403);
  });
});

describe("production HTTP behaviour", () => {
  it("compresses large responses", async () => {
    const agent = request.agent(ctx.app);
    await agent.post("/api/auth/guest");
    const wl = await agent.get("/api/watchlists").set("Accept-Encoding", "gzip");
    expect(wl.headers["content-encoding"]).toBe("gzip");
  });

  it("only forces HTTPS when deployed behind a TLS proxy", async () => {
    const local = await request(appWith({ isProduction: true, trustProxy: 0 })).get("/api/health");
    expect(local.headers["content-security-policy"]).not.toMatch(/upgrade-insecure-requests/);
    expect(local.headers["strict-transport-security"]).toBeUndefined();
    const hosted = await request(appWith({ isProduction: true, trustProxy: 1 })).get("/api/health");
    expect(hosted.headers["content-security-policy"]).toMatch(/upgrade-insecure-requests/);
    expect(hosted.headers["strict-transport-security"]).toMatch(/max-age/);
  });
});
