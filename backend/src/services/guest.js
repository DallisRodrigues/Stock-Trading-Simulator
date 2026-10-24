const crypto = require("node:crypto");
const { UserModel } = require("../models/User");
const { HoldingModel } = require("../models/Holding");
const { OrderModel } = require("../models/Order");
const { AlertModel } = require("../models/Alert");
const { NotificationModel } = require("../models/Notification");
const { PortfolioSnapshotModel } = require("../models/PortfolioSnapshot");
const { toCents } = require("../utils/money");
const { unavailable } = require("../utils/errors");
const { DEFAULT_WATCHLIST } = require("./trackedSymbols");

const STARTER_BUYS = [
  ["AAPL", 15],
  ["MSFT", 8],
  ["NVDA", 20],
  ["AMZN", 10],
  ["META", 4],
];
const SECOND_LIST = { name: "ETFs & dividends", symbols: ["SPY", "QQQ", "KO", "JPM", "WMT"] };

function createGuestService({ config, trading, alerts, marketData, logger = console, now = () => Date.now() }) {
  async function seed(user) {
    const filled = [];
    for (const [symbol, qty] of STARTER_BUYS) {
      try {
        await trading.placeOrder(user._id, { symbol, side: "BUY", type: "MARKET", qty, clientOrderId: `guest-${crypto.randomUUID()}`, note: "Starter portfolio" });
        filled.push(symbol);
      } catch (err) {
        logger.warn(`[guest] could not seed ${symbol}: ${err.message}`);
      }
    }
    try {
      const q = await marketData.getTradeQuote("AMD");
      const limit = Math.floor(q.price * 0.95 * 100) / 100;
      await trading.placeOrder(user._id, { symbol: "AMD", side: "BUY", type: "LIMIT", price: limit, qty: 5, validity: "GTC", clientOrderId: `guest-${crypto.randomUUID()}`, note: "Buy the dip" });
      await alerts.create(user._id, { symbol: "TSLA", condition: "CHANGE_DOWN", value: 3, note: "Big drop on Tesla" });
    } catch (err) {
      logger.warn(`[guest] could not seed open order/alert: ${err.message}`);
    }
    return filled;
  }

  async function create() {
    const active = await UserModel.countDocuments({ isGuest: true, guestExpiresAt: { $gt: new Date(now()) } });
    if (active >= config.guest.maxActive) {
      throw unavailable("DEMO_BUSY", "The demo is very busy right now. Please create a free account instead.");
    }
    const id = crypto.randomBytes(6).toString("hex");
    const user = await UserModel.create({
      name: "Guest Trader",
      email: `guest-${id}@demo.invalid`,
      passwordHash: crypto.randomBytes(32).toString("hex"),
      cashCents: toCents(config.startingCash),
      netDepositsCents: toCents(config.startingCash),
      watchlists: [{ name: "Watchlist 1", symbols: DEFAULT_WATCHLIST }, SECOND_LIST],
      isGuest: true,
      guestExpiresAt: new Date(now() + config.guest.ttlHours * 60 * 60_000),
    });
    await seed(user);
    return UserModel.findById(user._id);
  }

  async function purge(userIds) {
    if (!userIds.length) return 0;
    const filter = { user: { $in: userIds } };
    await Promise.all([
      OrderModel.deleteMany(filter),
      HoldingModel.deleteMany(filter),
      AlertModel.deleteMany(filter),
      NotificationModel.deleteMany(filter),
      PortfolioSnapshotModel.deleteMany(filter),
    ]);
    const res = await UserModel.deleteMany({ _id: { $in: userIds }, isGuest: true });
    return res.deletedCount;
  }

  async function cleanupExpired() {
    const expired = await UserModel.find({ isGuest: true, guestExpiresAt: { $lte: new Date(now()) } }).select("_id").limit(500).lean();
    const removed = await purge(expired.map((u) => u._id));
    if (removed) logger.info(`[guest] removed ${removed} expired demo account(s)`);
    return removed;
  }

  return { create, cleanupExpired, purge };
}

module.exports = { createGuestService };
