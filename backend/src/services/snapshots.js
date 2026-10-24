const { UserModel } = require("../models/User");
const { PortfolioSnapshotModel } = require("../models/PortfolioSnapshot");
const { toCents } = require("../utils/money");

const MIN_INTERVAL_MS = 10 * 60_000;

const BENCHMARK = "SPY";

function createSnapshotService({ portfolio, marketData, now = () => Date.now() }) {
  async function benchmarkPrice() {
    if (!marketData) return undefined;
    try {
      const q = (await marketData.getQuotes([BENCHMARK]))[BENCHMARK];
      return q?.price > 0 ? q.price : undefined;
    } catch {
      return undefined;
    }
  }

  async function store(userId, { cashCents, investedCents, holdingsValueCents, priceSource, netDepositsCents }) {
    const last = await PortfolioSnapshotModel.findOne({ user: userId }).sort({ t: -1 }).lean();
    const changed = !last || last.cashCents !== cashCents || last.investedCents !== investedCents;
    if (!changed && now() - new Date(last.t).getTime() < MIN_INTERVAL_MS) return false;
    await PortfolioSnapshotModel.create({
      user: userId,
      t: new Date(now()),
      cashCents,
      investedCents,
      holdingsValueCents,
      priceSource,
      netDepositsCents,
      benchmarkPrice: await benchmarkPrice(),
    });
    return true;
  }

  async function recordFrom(userId, cashCents, holdingsRes, netDepositsCents) {
    if (holdingsRes.totals.unpricedCount > 0) return false;
    return store(userId, {
      netDepositsCents,
      cashCents,
      investedCents: toCents(holdingsRes.totals.investment),
      holdingsValueCents: toCents(holdingsRes.totals.currentValue),
      priceSource: holdingsRes.items.some((h) => h.quoteStatus === "demo") ? "demo" : "live",
    });
  }

  async function record(userId) {
    const [user, holdingsRes] = await Promise.all([UserModel.findById(userId).lean(), portfolio.holdings(userId)]);
    if (!user) return false;
    return recordFrom(userId, user.cashCents + (user.reservedCashCents || 0), holdingsRes, user.netDepositsCents);
  }

  return { record, recordFrom };
}

module.exports = { createSnapshotService };
