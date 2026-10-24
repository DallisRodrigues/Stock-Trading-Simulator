const mongoose = require("mongoose");
const { setupTestApp, signupAgent, silentLogger } = require("./helpers");
const { UserModel } = require("../src/models/User");
const { runMigrations } = require("../src/db");

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

describe("named watchlists", () => {
  it("starts with one default list and quotes for its symbols", async () => {
    const { agent } = await signupAgent(ctx.app);
    const res = await agent.get("/api/watchlists");
    expect(res.body.lists).toHaveLength(1);
    expect(res.body.lists[0]).toMatchObject({ name: "Watchlist 1" });
    expect(res.body.lists[0].symbols).toContain("AAPL");
    expect(res.body.quotes.AAPL.price).toBe(190);
    expect(res.body).toMatchObject({ max: 50, maxLists: 5 });
  });

  it("creates, renames, reorders, adds/removes symbols and deletes lists", async () => {
    const { agent } = await signupAgent(ctx.app);
    let body = (await agent.post("/api/watchlists").send({ name: "Dividends" })).body;
    const list = body.lists[1];
    expect(list).toMatchObject({ name: "Dividends", symbols: [] });

    body = (await agent.post(`/api/watchlists/${list.id}/symbols`).send({ symbol: "ko" })).body;
    body = (await agent.post(`/api/watchlists/${list.id}/symbols`).send({ symbol: "JPM" })).body;
    expect(body.lists[1].symbols).toEqual(["KO", "JPM"]);
    expect(body.quotes.KO.price).toBe(62);

    expect((await agent.post(`/api/watchlists/${list.id}/symbols`).send({ symbol: "KO" })).status).toBe(200);

    body = (await agent.patch(`/api/watchlists/${list.id}`).send({ name: "Income", symbols: ["JPM", "KO"] })).body;
    expect(body.lists[1]).toMatchObject({ name: "Income", symbols: ["JPM", "KO"] });
    expect((await agent.patch(`/api/watchlists/${list.id}`).send({ symbols: ["JPM", "AAPL"] })).status).toBe(400);

    body = (await agent.delete(`/api/watchlists/${list.id}/symbols/KO`)).body;
    expect(body.lists[1].symbols).toEqual(["JPM"]);

    body = (await agent.delete(`/api/watchlists/${list.id}`)).body;
    expect(body.lists).toHaveLength(1);
    expect((await agent.delete(`/api/watchlists/${body.lists[0].id}`)).status).toBe(422);
  });

  it("limits the number of lists and validates names", async () => {
    const { agent } = await signupAgent(ctx.app);
    for (let i = 2; i <= 5; i++) expect((await agent.post("/api/watchlists").send({ name: `List ${i}` })).status).toBe(201);
    const sixth = await agent.post("/api/watchlists").send({ name: "Too many" });
    expect(sixth.status).toBe(422);
    expect(sixth.body.error.code).toBe("TOO_MANY_WATCHLISTS");
    expect((await agent.post("/api/watchlists").send({ name: "" })).status).toBe(400);
    expect((await agent.post("/api/watchlists").send({ name: "x".repeat(31) })).status).toBe(400);
  });

  it("keeps lists private to their owner", async () => {
    const alice = await signupAgent(ctx.app);
    const bob = await signupAgent(ctx.app);
    const aliceList = (await alice.agent.get("/api/watchlists")).body.lists[0];
    expect((await bob.agent.post(`/api/watchlists/${aliceList.id}/symbols`).send({ symbol: "KO" })).status).toBe(404);
    expect((await bob.agent.patch(`/api/watchlists/${aliceList.id}`).send({ name: "hijack" })).status).toBe(404);
    expect((await bob.agent.delete(`/api/watchlists/${aliceList.id}/symbols/AAPL`)).status).toBe(404);
  });

  it("keeps the legacy /api/watchlist routes working on the first list", async () => {
    const { agent } = await signupAgent(ctx.app);
    await agent.post("/api/watchlist").send({ symbol: "KO" });
    const lists = (await agent.get("/api/watchlists")).body.lists;
    expect(lists[0].symbols).toContain("KO");
  });
});

describe("watchlist + deposit migrations", () => {
  it("converts a legacy single watchlist and backfills net deposits", async () => {
    const id = new mongoose.Types.ObjectId();
    await UserModel.collection.insertOne({
      _id: id,
      name: "Legacy",
      email: "legacy@example.com",
      passwordHash: "x",
      cashCents: 100,
      watchlist: ["AAPL", "MSFT"],
    });
    await runMigrations(silentLogger, { startingCashCents: 10_000_000 });
    const u = await UserModel.collection.findOne({ _id: id });
    expect(u.watchlist).toBeUndefined();
    expect(u.watchlists).toHaveLength(1);
    expect(u.watchlists[0]).toMatchObject({ name: "Watchlist 1", symbols: ["AAPL", "MSFT"] });
    expect(u.netDepositsCents).toBe(10_000_000);
    await runMigrations(silentLogger);
    expect((await UserModel.collection.findOne({ _id: id })).watchlists).toHaveLength(1);
  });

  it("tracks net deposits through transfers", async () => {
    const { agent, user } = await signupAgent(ctx.app);
    await agent.post("/api/funds/deposit").send({ amount: 500 });
    await agent.post("/api/funds/withdraw").send({ amount: 200 });
    const u = await UserModel.findById(user.id);
    expect(u.netDepositsCents).toBe(10_000_000 + 30_000);
  });
});
