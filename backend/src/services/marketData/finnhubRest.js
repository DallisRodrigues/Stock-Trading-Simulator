const BASE_URL = "https://finnhub.io/api/v1";

class ProviderError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function createRateBudget({ perMinute, now = Date.now }) {
  const calls = [];
  let blockedUntil = 0;
  const prune = () => {
    const cutoff = now() - 60_000;
    while (calls.length && calls[0] <= cutoff) calls.shift();
  };
  return {
    tryTake() {
      prune();
      if (now() < blockedUntil || calls.length >= perMinute) return false;
      calls.push(now());
      return true;
    },
    remaining() {
      prune();
      return now() < blockedUntil ? 0 : Math.max(0, perMinute - calls.length);
    },
    block(ms) {
      blockedUntil = Math.max(blockedUntil, now() + ms);
    },
  };
}

function createFinnhubRest({ apiKey, fetchImpl = globalThis.fetch, callsPerMinute = 50, now = Date.now, timeoutMs = 8000 }) {
  const budget = createRateBudget({ perMinute: callsPerMinute, now });
  const inFlight = new Map();

  async function request(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const key = `${path}?${qs}`;
    if (inFlight.has(key)) return inFlight.get(key);

    if (!budget.tryTake()) {
      throw new ProviderError("BUDGET_EXHAUSTED", "Market data request budget exhausted; try again shortly.");
    }

    const p = (async () => {
      let res;
      try {
        res = await fetchImpl(`${BASE_URL}${path}${qs ? `?${qs}` : ""}`, {
          headers: { "X-Finnhub-Token": apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new ProviderError("PROVIDER_ERROR", `Market data provider unreachable (${err.name}).`);
      }
      if (res.status === 429) {
        budget.block(60_000);
        throw new ProviderError("RATE_LIMITED", "Market data provider rate limit reached.", 429);
      }
      if (res.status === 401 || res.status === 403) {
        throw new ProviderError("AUTH_FAILED", "Market data provider rejected the API key or plan.", res.status);
      }
      if (!res.ok) {
        throw new ProviderError("PROVIDER_ERROR", `Market data provider returned HTTP ${res.status}.`, res.status);
      }
      return res.json();
    })();

    inFlight.set(key, p);
    try {
      return await p;
    } finally {
      inFlight.delete(key);
    }
  }

  return {
    budget,

    async getQuote(symbol) {
      const q = await request("/quote", { symbol });
      return normalizeQuote(q);
    },

    async search(query) {
      const body = await request("/search", { q: query, exchange: "US" });
      return normalizeSearch(body);
    },

    async marketStatus() {
      const s = await request("/stock/market-status", { exchange: "US" });
      return {
        isOpen: Boolean(s?.isOpen),
        session: s?.session ?? null,
        holiday: s?.holiday ?? null,
        timezone: s?.timezone ?? "America/New_York",
        sourceTs: typeof s?.t === "number" ? s.t * 1000 : null,
      };
    },

    async profile(symbol) {
      return normalizeProfile(await request("/stock/profile2", { symbol }));
    },
    async metrics(symbol) {
      return normalizeMetrics(await request("/stock/metric", { symbol, metric: "all" }));
    },
    async recommendations(symbol) {
      return normalizeRecommendations(await request("/stock/recommendation", { symbol }));
    },
    async peers(symbol) {
      const list = await request("/stock/peers", { symbol });
      return Array.isArray(list) ? list.filter((s) => typeof s === "string" && s !== symbol).slice(0, 10) : [];
    },
    async news(symbol, { from, to }) {
      return normalizeNews(await request("/company-news", { symbol, from, to }));
    },
  };
}

const finite = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);

function normalizeProfile(p) {
  if (!p || typeof p !== "object" || !p.ticker) return null;
  return {
    name: String(p.name || p.ticker),
    industry: p.finnhubIndustry || null,
    exchange: p.exchange || null,
    country: p.country || null,
    currency: p.currency || null,
    ipo: p.ipo || null,
    marketCap: finite(p.marketCapitalization) != null ? finite(p.marketCapitalization) * 1e6 : null,
    sharesOutstanding: finite(p.shareOutstanding) != null ? finite(p.shareOutstanding) * 1e6 : null,
    logo: typeof p.logo === "string" && p.logo.startsWith("https://") ? p.logo : null,
    website: typeof p.weburl === "string" && /^https?:\/\//.test(p.weburl) ? p.weburl : null,
  };
}

const METRIC_FIELDS = {
  high52: "52WeekHigh",
  high52Date: "52WeekHighDate",
  low52: "52WeekLow",
  low52Date: "52WeekLowDate",
  beta: "beta",
  peTTM: "peTTM",
  epsTTM: "epsTTM",
  dividendYield: "dividendYieldIndicatedAnnual",
  roeTTM: "roeTTM",
  netMarginTTM: "netProfitMarginTTM",
  avgVolume10D: "10DayAverageTradingVolume",
};
const RETURN_FIELDS = {
  "5D": "5DayPriceReturnDaily",
  MTD: "monthToDatePriceReturnDaily",
  "13W": "13WeekPriceReturnDaily",
  "26W": "26WeekPriceReturnDaily",
  "52W": "52WeekPriceReturnDaily",
  YTD: "yearToDatePriceReturnDaily",
};
const SERIES_FIELDS = { eps: "eps", netMargin: "netMargin", grossMargin: "grossMargin", operatingMargin: "operatingMargin", roe: "roe" };

function normalizeMetrics(body) {
  const m = body?.metric;
  if (!m || typeof m !== "object") return null;
  const out = { returns: {}, annual: {}, quarterly: {} };
  for (const [key, src] of Object.entries(METRIC_FIELDS)) {
    out[key] = key.endsWith("Date") ? (typeof m[src] === "string" ? m[src] : null) : finite(m[src]);
  }
  if (out.avgVolume10D != null) out.avgVolume10D *= 1e6;
  for (const [key, src] of Object.entries(RETURN_FIELDS)) out.returns[key] = finite(m[src]);
  const series = (list, limit) =>
    (Array.isArray(list) ? list : [])
      .filter((p) => typeof p?.period === "string" && finite(p.v) != null)
      .slice(0, limit)
      .map((p) => ({ period: p.period, v: Number(p.v) }))
      .reverse();
  for (const [key, src] of Object.entries(SERIES_FIELDS)) {
    out.annual[key] = series(body.series?.annual?.[src], 10);
    out.quarterly[key] = series(body.series?.quarterly?.[src], 12);
  }
  return out;
}

function normalizeRecommendations(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => typeof r?.period === "string")
    .slice(0, 6)
    .map((r) => ({
      period: r.period,
      strongBuy: finite(r.strongBuy) || 0,
      buy: finite(r.buy) || 0,
      hold: finite(r.hold) || 0,
      sell: finite(r.sell) || 0,
      strongSell: finite(r.strongSell) || 0,
    }))
    .reverse();
}

function normalizeNews(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((n) => n?.headline && typeof n.url === "string" && /^https?:\/\//.test(n.url))
    .sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
    .slice(0, 12)
    .map((n) => ({
      id: String(n.id ?? n.url),
      headline: String(n.headline).slice(0, 300),
      summary: String(n.summary || "").slice(0, 500),
      source: n.source || null,
      url: n.url,
      datetime: finite(n.datetime) ? Number(n.datetime) * 1000 : null,
    }));
}

function normalizeQuote(q) {
  if (!q || typeof q !== "object") return null;
  const price = Number(q.c);
  if (!Number.isFinite(price) || price <= 0) return null;
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  return {
    price,
    prevClose: num(q.pc),
    open: num(q.o),
    high: num(q.h),
    low: num(q.l),
    sourceTs: Number.isFinite(Number(q.t)) && Number(q.t) > 0 ? Number(q.t) * 1000 : null,
  };
}

function normalizeSearch(body) {
  const results = Array.isArray(body?.result) ? body.result : [];
  return results
    .filter((r) => typeof r.symbol === "string" && ["Common Stock", "ETP", "ADR"].includes(r.type))
    .slice(0, 15)
    .map((r) => ({ symbol: r.symbol, description: r.description || "", type: r.type }));
}

module.exports = {
  createFinnhubRest,
  createRateBudget,
  normalizeQuote,
  normalizeSearch,
  normalizeProfile,
  normalizeMetrics,
  normalizeRecommendations,
  normalizeNews,
  ProviderError,
};
