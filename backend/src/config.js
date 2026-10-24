const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ENV_FILE = path.join(__dirname, "..", ".env");

function loadEnvFile() {
  if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

function parseList(value, fallback) {
  if (!value) return fallback;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const errors = [];

  const mongoUri = env.MONGODB_URI || env.MONGO_URL;
  if (!mongoUri) errors.push("MONGODB_URI is required (MongoDB connection string).");

  let jwtSecret = env.JWT_SECRET;
  let jwtSecretGenerated = false;
  if (!jwtSecret) {
    if (isProduction) {
      errors.push("JWT_SECRET is required in production.");
    } else {
      jwtSecret = crypto.randomBytes(48).toString("hex");
      jwtSecretGenerated = true;
    }
  } else if (jwtSecret.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters long.");
  }

  const cookieSameSite = String(env.COOKIE_SAMESITE || "lax").toLowerCase();
  if (!["lax", "strict", "none"].includes(cookieSameSite)) errors.push('COOKIE_SAMESITE must be "lax", "strict" or "none".');
  if (cookieSameSite === "none" && !isProduction) errors.push("COOKIE_SAMESITE=none requires NODE_ENV=production (Secure cookies).");

  const port = Number(env.PORT || 3002);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push("PORT must be a valid TCP port number.");
  }

  const provider = (env.MARKET_DATA_PROVIDER || (env.FINNHUB_API_KEY ? "finnhub" : "demo")).toLowerCase();
  if (!["finnhub", "demo"].includes(provider)) {
    errors.push('MARKET_DATA_PROVIDER must be "finnhub" or "demo".');
  }
  if (provider === "finnhub" && !env.FINNHUB_API_KEY) {
    errors.push("FINNHUB_API_KEY is required when MARKET_DATA_PROVIDER=finnhub.");
  }

  if (errors.length) {
    const err = new Error(`Invalid configuration:\n  - ${errors.join("\n  - ")}`);
    err.code = "CONFIG_INVALID";
    throw err;
  }

  return {
    nodeEnv,
    isProduction,
    port,
    mongoUri,
    mongoDbName: env.MONGODB_DB_NAME || "zerodha_clone",
    jwtSecret,
    jwtSecretGenerated,
    jwtExpiresIn: env.JWT_EXPIRES_IN || "1d",
    corsOrigins: parseList(env.CORS_ORIGINS, ["http://localhost:5173", "http://localhost:5174"]),
    startingCash: Number(env.STARTING_CASH || 100000),
    authRateLimit: Number(env.AUTH_RATE_LIMIT || 20),
    trustProxy: Number(env.TRUST_PROXY || 0),
    cookieSameSite,
    guest: {
      enabled: !["off", "false", "0"].includes(String(env.GUEST_DEMO || "on").toLowerCase()),
      ttlHours: Number(env.GUEST_TTL_HOURS || 24),
      maxActive: Number(env.MAX_GUEST_ACCOUNTS || 300),
    },
    serveStatic: ["on", "true", "1"].includes(String(env.SERVE_STATIC || "off").toLowerCase()),
    apiRateLimit: Number(env.API_RATE_LIMIT || 600),
    marketData: {
      provider,
      finnhubApiKey: env.FINNHUB_API_KEY || "",
      restCallsPerMinute: Number(env.FINNHUB_REST_CALLS_PER_MINUTE || 50),
      stream: !["off", "false", "0"].includes(String(env.FINNHUB_STREAM || "on").toLowerCase()),
    },
  };
}

module.exports = { loadEnvFile, loadConfig };
