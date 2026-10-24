const http = require("node:http");
const { io: ioClient } = require("socket.io-client");
const { setupTestApp, signupAgent, silentLogger } = require("./helpers");
const { attachRealtime } = require("../src/realtime");

let ctx;
let server;
let realtime;
let url;

beforeAll(async () => {
  ctx = await setupTestApp();
  server = http.createServer(ctx.app);
  realtime = attachRealtime(server, { config: ctx.config, marketData: ctx.marketData, logger: silentLogger });
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});
afterAll(async () => {
  await realtime.close();
  await new Promise((r) => server.close(r));
  await ctx.teardown();
});

const connect = (cookie) =>
  ioClient(url, { transports: ["websocket"], extraHeaders: cookie ? { cookie } : {}, reconnection: false, forceNew: true });

describe("Socket.IO quotes", () => {
  it("rejects unauthenticated sockets", async () => {
    const socket = connect();
    const err = await new Promise((resolve) => socket.on("connect_error", resolve));
    expect(err.message).toBe("UNAUTHORIZED");
    socket.close();
  });

  it("acknowledges subscriptions with snapshots and pushes updates to subscribed rooms only", async () => {
    const res = await (await signupAgent(ctx.app)).agent.get("/api/auth/me");
    const cookie = res.request.cookies;
    const socket = connect(cookie);
    const status = await new Promise((resolve) => socket.on("market:status", resolve));
    expect(status.provider).toBe("demo");

    const ack = await new Promise((resolve) => socket.emit("quotes:subscribe", ["aapl", "bad symbol!", "MSFT"], resolve));
    expect(Object.keys(ack.quotes).sort()).toEqual(["AAPL", "MSFT"]);

    await new Promise((r) => setTimeout(r, 400));
    const received = [];
    socket.on("quote", (q) => received.push(q.symbol));
    ctx.marketData.events.emit("quote", { symbol: "AAPL", price: 1 });
    ctx.marketData.events.emit("quote", { symbol: "TSLA", price: 1 });
    await new Promise((r) => setTimeout(r, 400));
    expect(received).toEqual(["AAPL"]);
    socket.close();
  });
});
