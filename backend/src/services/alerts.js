const { AlertModel } = require("../models/Alert");
const { unprocessable, notFound } = require("../utils/errors");

const MAX_ACTIVE = 50;
const DESCRIBE = {
  ABOVE: (v) => `price rises to $${v.toFixed(2)} or above`,
  BELOW: (v) => `price falls to $${v.toFixed(2)} or below`,
  CHANGE_UP: (v) => `day change reaches +${v}% or more`,
  CHANGE_DOWN: (v) => `day change reaches -${v}% or worse`,
};

function isMet(alert, quote) {
  if (!quote || !(quote.price > 0)) return null;
  switch (alert.condition) {
    case "ABOVE":
      return quote.price >= alert.value;
    case "BELOW":
      return quote.price <= alert.value;
    case "CHANGE_UP":
      return quote.changePct == null ? null : quote.changePct >= alert.value;
    case "CHANGE_DOWN":
      return quote.changePct == null ? null : quote.changePct <= -alert.value;
    default:
      return null;
  }
}

const serialize = (a) => ({
  id: String(a._id),
  symbol: a.symbol,
  condition: a.condition,
  value: a.value,
  description: DESCRIBE[a.condition](a.value),
  status: a.status,
  note: a.note || "",
  triggeredAt: a.triggeredAt || null,
  triggerPrice: a.triggerPrice ?? null,
  createdAt: a.createdAt,
});

function createAlertService({ marketData, notifications, onAlertsChanged = () => {}, now = () => Date.now() }) {
  async function create(userId, { symbol, condition, value, note = "" }) {
    if ((await AlertModel.countDocuments({ user: userId, status: "ACTIVE" })) >= MAX_ACTIVE) {
      throw unprocessable("TOO_MANY_ALERTS", `You can have at most ${MAX_ACTIVE} active alerts.`);
    }
    const quote = await marketData.getTradeQuote(symbol);
    const draft = { condition, value };
    if (isMet(draft, quote)) {
      throw unprocessable("ALREADY_MET", `${symbol} already meets this condition (${DESCRIBE[condition](value)}). Choose a different level.`);
    }
    const alert = await AlertModel.create({ user: userId, symbol, condition, value, note });
    onAlertsChanged();
    return serialize(alert);
  }

  async function list(userId) {
    const alerts = await AlertModel.find({ user: userId, status: { $in: ["ACTIVE", "TRIGGERED"] } })
      .sort({ status: 1, createdAt: -1 })
      .limit(100);
    return alerts.map(serialize);
  }

  async function remove(userId, id) {
    const res = await AlertModel.updateOne({ _id: id, user: userId, status: { $ne: "CANCELLED" } }, { $set: { status: "CANCELLED" } });
    if (res.matchedCount !== 1) throw notFound("Alert not found.");
    onAlertsChanged();
  }

  async function evaluate(symbol, quote) {
    const alerts = await AlertModel.find({ status: "ACTIVE", symbol });
    let fired = 0;
    for (const a of alerts) {
      if (!isMet(a, quote)) continue;
      const claimed = await AlertModel.findOneAndUpdate(
        { _id: a._id, status: "ACTIVE" },
        { $set: { status: "TRIGGERED", triggeredAt: new Date(now()), triggerPrice: quote.price } },
        { new: true }
      );
      if (!claimed) continue;
      fired += 1;
      await notifications.notify(claimed.user, {
        type: "ALERT",
        title: `${symbol} alert: ${DESCRIBE[claimed.condition](claimed.value)}`,
        body: `${symbol} is at $${quote.price.toFixed(2)}${quote.changePct != null ? ` (${quote.changePct > 0 ? "+" : ""}${quote.changePct.toFixed(2)}% today)` : ""}.${claimed.note ? ` Note: ${claimed.note}` : ""}`,
        data: { alertId: String(claimed._id), symbol },
      });
    }
    if (fired) onAlertsChanged();
    return fired;
  }

  return { create, list, remove, evaluate };
}

module.exports = { createAlertService, isMet };
