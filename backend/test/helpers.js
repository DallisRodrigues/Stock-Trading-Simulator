const mongoose = require("mongoose");
const request = require("supertest");
const { startMemoryMongo } = require("../scripts/memory-mongo");
const { loadConfig } = require("../src/config");
const { createApp } = require("../src/app");
const { createMarketDataService } = require("../src/services/marketData");

const silentLogger = { info() {}, warn() {}, error() {} };

async function setupTestApp({ marketData, env = {} } = {}) {
  const mongo = await startMemoryMongo();
  const config = loadConfig({
    NODE_ENV: "test",
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: "test-secret-test-secret-test-secret-123",
    MARKET_DATA_PROVIDER: "demo",
    AUTH_RATE_LIMIT: "1000",
    ...env,
  });
  await mongoose.connect(config.mongoUri, { dbName: "test" });
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  const md = marketData || createMarketDataService({ provider: "demo", logger: silentLogger });
  const app = createApp({ config, marketData: md, logger: silentLogger });
  return {
    app,
    config,
    marketData: md,
    async reset() {
      await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    },
    async teardown() {
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
}

let counter = 0;
async function signupAgent(app, overrides = {}) {
  counter += 1;
  const agent = request.agent(app);
  const body = { name: "Test User", email: `user${counter}-${Date.now()}@example.com`, password: "password123", ...overrides };
  const res = await agent.post("/api/auth/signup").send(body);
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user, credentials: body };
}

let orderSeq = 0;
const orderId = () => `test-order-${Date.now()}-${++orderSeq}`;

module.exports = { setupTestApp, signupAgent, orderId, silentLogger };
