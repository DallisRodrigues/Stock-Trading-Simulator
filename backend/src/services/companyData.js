const { CompanyDataModel } = require("../models/CompanyData");

const HOUR = 60 * 60_000;
const TTL_MS = {
  profile: 7 * 24 * HOUR,
  metrics: 24 * HOUR,
  recommendations: 24 * HOUR,
  peers: 7 * 24 * HOUR,
  news: HOUR,
};

const ymd = (d) => d.toISOString().slice(0, 10);

function createCompanyDataService({ marketData, logger = console, now = () => Date.now() }) {
  const provider = marketData.provider === "demo" ? "demo" : "finnhub";
  const inFlight = new Map();

  const wrap = (doc, extra = {}) => ({
    data: doc?.data ?? null,
    source: doc?.source ?? provider,
    fetchedAt: doc?.fetchedAt ?? null,
    stale: false,
    ...extra,
  });

  async function fetchAndStore(kind, symbol) {
    let data;
    if (kind === "news") {
      const to = new Date(now());
      data = await marketData.company.news(symbol, { from: ymd(new Date(to.getTime() - 7 * 24 * HOUR)), to: ymd(to) });
    } else {
      data = await marketData.company[kind](symbol);
    }
    const doc = { symbol, kind, source: provider, data, fetchedAt: new Date(now()) };
    await CompanyDataModel.updateOne({ symbol, kind }, { $set: doc }, { upsert: true });
    return doc;
  }

  async function get(kind, symbol, { allowFetch = true } = {}) {
    const cached = await CompanyDataModel.findOne({ symbol, kind }).lean();
    const usable = cached && cached.source === provider ? cached : null;
    const fresh = usable && now() - new Date(usable.fetchedAt).getTime() < TTL_MS[kind];
    if (fresh) return wrap(usable);
    if (!allowFetch) return wrap(usable, { stale: Boolean(usable), pending: !usable });

    const key = `${kind}:${symbol}`;
    if (!inFlight.has(key)) {
      inFlight.set(
        key,
        fetchAndStore(kind, symbol).finally(() => inFlight.delete(key))
      );
    }
    try {
      return wrap(await inFlight.get(key));
    } catch (err) {
      if (err.code !== "BUDGET_EXHAUSTED") logger.warn(`[company] ${kind} ${symbol}: ${err.code || err.message}`);
      return wrap(usable, { stale: Boolean(usable), error: err.code || "PROVIDER_ERROR" });
    }
  }

  async function overview(symbol) {
    const [profile, metrics, recommendations, peers] = await Promise.all(
      ["profile", "metrics", "recommendations", "peers"].map((k) => get(k, symbol))
    );
    return { symbol, provider, profile, metrics, recommendations, peers };
  }

  return { get, overview, provider };
}

module.exports = { createCompanyDataService, TTL_MS };
