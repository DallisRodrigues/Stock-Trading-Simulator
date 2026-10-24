const { UserModel } = require("../models/User");
const { OrderModel } = require("../models/Order");
const { PortfolioSnapshotModel } = require("../models/PortfolioSnapshot");
const { fromCents } = require("../utils/money");

const round2 = (n) => Math.round(n * 100) / 100;
const MAX_COLD_FETCHES = 6;
const nyDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

function createAnalyticsService({ portfolio, companyData, snapshots, now = () => Date.now() }) {
  async function withLimitedFetch(kind, symbols) {
    const out = {};
    let budget = MAX_COLD_FETCHES;
    for (const symbol of symbols) {
      const cachedOnly = await companyData.get(kind, symbol, { allowFetch: false });
      if (cachedOnly.data && !cachedOnly.stale) {
        out[symbol] = cachedOnly;
        continue;
      }
      out[symbol] = budget > 0 ? await companyData.get(kind, symbol) : cachedOnly;
      budget -= 1;
    }
    return out;
  }

  async function compute(userId) {
    const [user, holdingsRes, sells, recentOrders] = await Promise.all([
      UserModel.findById(userId).lean(),
      portfolio.holdings(userId),
      OrderModel.find({ user: userId, status: "EXECUTED", side: "SELL" }).sort({ filledAt: 1 }).select("filledAt realizedPnlCents symbol").lean(),
      OrderModel.find({ user: userId, status: "EXECUTED", filledAt: { $gte: new Date(now() - 30 * 24 * 60 * 60_000) } })
        .select("filledAt side valueCents")
        .lean(),
    ]);
    const cash = fromCents(user.cashCents);
    const reservedCash = fromCents(user.reservedCashCents || 0);
    const items = holdingsRes.items;
    const symbols = items.map((h) => h.symbol);

    const [profiles, metrics] = await Promise.all([withLimitedFetch("profile", symbols), withLimitedFetch("metrics", symbols)]);

    const holdingsValue = holdingsRes.totals.currentValue;
    const accountValue = round2(cash + reservedCash + holdingsValue);

    const holdings = items.map((h) => {
      const m = metrics[h.symbol]?.data;
      const weight = h.curValue != null && holdingsValue > 0 ? h.curValue / holdingsValue : null;
      return {
        symbol: h.symbol,
        name: profiles[h.symbol]?.data?.name || h.symbol,
        sector: profiles[h.symbol]?.data?.industry || null,
        qty: h.qty,
        avgPrice: h.avgPrice,
        ltp: h.ltp,
        investment: h.investment,
        curValue: h.curValue,
        pnl: h.pnl,
        netChgPct: h.netChgPct,
        dayChgPct: h.dayChgPct,
        dayPnl: h.dayChange != null ? round2(h.dayChange * h.qty) : null,
        weight: weight != null ? round2(weight * 100) : null,
        beta: m?.beta ?? null,
        returns: m?.returns ?? null,
        high52: m?.high52 ?? null,
        low52: m?.low52 ?? null,
        quoteStatus: h.quoteStatus,
      };
    });

    const bySector = new Map();
    for (const h of holdings) {
      if (h.curValue == null) continue;
      const key = h.sector || "Unclassified";
      bySector.set(key, round2((bySector.get(key) || 0) + h.curValue));
    }
    const sectorAllocation = [...bySector.entries()].map(([sector, value]) => ({ sector, value })).sort((a, b) => b.value - a.value);

    const weights = holdings.filter((h) => h.weight != null).map((h) => h.weight / 100);
    const hhi = weights.reduce((s, w) => s + w * w, 0);
    const betaHoldings = holdings.filter((h) => h.beta != null && h.weight != null);
    const betaWeight = betaHoldings.reduce((s, h) => s + h.weight, 0);
    const largest = holdings.reduce((best, h) => (h.weight != null && (!best || h.weight > best.weight) ? h : best), null);

    const dayPnlKnown = holdings.filter((h) => h.dayPnl != null);
    const dayPnl = round2(dayPnlKnown.reduce((s, h) => s + h.dayPnl, 0));
    const prevValue = holdingsValue - dayPnl;
    const realized = fromCents(sells.reduce((s, o) => s + (o.realizedPnlCents || 0), 0));
    let running = 0;
    const realizedSeries = sells.slice(-200).map((o) => {
      running += o.realizedPnlCents || 0;
      return { t: o.filledAt, symbol: o.symbol, value: fromCents(running) };
    });

    const byDay = new Map();
    for (const o of recentOrders) {
      const day = nyDate.format(o.filledAt);
      const d = byDay.get(day) || { date: day, buyValue: 0, sellValue: 0, orders: 0 };
      if (o.side === "BUY") d.buyValue += o.valueCents;
      else d.sellValue += o.valueCents;
      d.orders += 1;
      byDay.set(day, d);
    }
    const activity = [...byDay.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, buyValue: fromCents(d.buyValue), sellValue: fromCents(d.sellValue) }));

    await snapshots.recordFrom(userId, user.cashCents + (user.reservedCashCents || 0), holdingsRes, user.netDepositsCents);
    const snapshotDocs = await PortfolioSnapshotModel.find({ user: userId, t: { $gte: new Date(now() - 90 * 24 * 60 * 60_000) } })
      .sort({ t: -1 })
      .limit(500)
      .lean();
    const history = snapshotDocs.reverse().map((s) => ({
      t: s.t,
      accountValue: fromCents(s.cashCents + s.holdingsValueCents),
      invested: fromCents(s.investedCents),
      cash: fromCents(s.cashCents),
      priceSource: s.priceSource,
      netDeposits: s.netDepositsCents != null ? fromCents(s.netDepositsCents) : null,
      benchmarkPrice: s.benchmarkPrice ?? null,
    }));

    const comparable = history.filter((h) => h.netDeposits != null && h.benchmarkPrice > 0);
    const performance = [];
    let growth = 1;
    comparable.forEach((h, i) => {
      if (i > 0) {
        const prev = comparable[i - 1];
        const flow = h.netDeposits - prev.netDeposits;
        if (prev.accountValue > 0) growth *= (h.accountValue - flow) / prev.accountValue;
      }
      performance.push({
        t: h.t,
        portfolioPct: round2((growth - 1) * 100),
        benchmarkPct: round2((h.benchmarkPrice / comparable[0].benchmarkPrice - 1) * 100),
        priceSource: h.priceSource,
      });
    });

    const pending = symbols.filter((s) => !profiles[s]?.data || !metrics[s]?.data).length;

    return {
      asOf: new Date(now()),
      provider: companyData.provider,
      totals: {
        accountValue,
        cash,
        reservedCash,
        cashPct: accountValue > 0 ? round2(((cash + reservedCash) / accountValue) * 100) : null,
        invested: holdingsRes.totals.investment,
        holdingsValue,
        unrealizedPnl: holdingsRes.totals.pnl,
        unrealizedPnlPct: holdingsRes.totals.pnlPct,
        realizedPnl: realized,
        dayPnl: dayPnlKnown.length ? dayPnl : null,
        dayPnlPct: dayPnlKnown.length && prevValue > 0 ? round2((dayPnl / prevValue) * 100) : null,
        unpricedCount: holdingsRes.totals.unpricedCount,
      },
      risk: {
        holdingsCount: holdings.length,
        effectiveHoldings: hhi > 0 ? round2(1 / hhi) : null,
        largestPosition: largest ? { symbol: largest.symbol, weight: largest.weight } : null,
        weightedBeta: betaWeight > 0 ? round2(betaHoldings.reduce((s, h) => s + h.beta * h.weight, 0) / betaWeight) : null,
        betaCoveragePct: holdingsValue > 0 ? round2(betaWeight) : null,
      },
      holdings,
      sectorAllocation,
      realizedSeries,
      activity,
      history,
      performance,
      benchmark: "SPY",
      pendingCompanyData: pending,
    };
  }

  return { compute };
}

module.exports = { createAnalyticsService };
