const { UserModel } = require("../models/User");
const { HoldingModel } = require("../models/Holding");
const { OrderModel } = require("../models/Order");
const { toCents, fromCents } = require("../utils/money");
const { nextMarketClose } = require("../utils/time");
const { ApiError, unprocessable, conflict, notFound } = require("../utils/errors");

const MAX_CASH_CENTS = toCents(10_000_000);
const MAX_OPEN_ORDERS = 50;
const GTC_DAYS = 90;
const STOP_BUY_BUFFER = 1.05;

function serializeOrder(o) {
  return {
    id: String(o._id),
    symbol: o.symbol,
    side: o.side,
    type: o.type || "MARKET",
    qty: o.qty,
    triggerPrice: o.triggerPriceCents ? fromCents(o.triggerPriceCents) : null,
    validity: o.type && o.type !== "MARKET" ? o.validity : null,
    expiresAt: o.expiresAt || null,
    reserved: fromCents(o.reservedCents || 0),
    price: fromCents(o.priceCents),
    value: fromCents(o.valueCents),
    realizedPnl: fromCents(o.realizedPnlCents || 0),
    status: o.status,
    statusReason: o.statusReason || null,
    priceSource: o.priceSource || null,
    priceTimestamp: o.priceTimestamp || null,
    filledAt: o.filledAt || null,
    createdAt: o.createdAt,
    note: o.note || "",
  };
}

function isTriggered(order, price) {
  const trigger = fromCents(order.triggerPriceCents);
  if (order.type === "LIMIT") return order.side === "BUY" ? price <= trigger : price >= trigger;
  if (order.type === "STOP") return order.side === "BUY" ? price >= trigger : price <= trigger;
  return false;
}

function createTradingService({ marketData, notifications, onPortfolioChanged = () => {}, now = () => Date.now() }) {
  async function buyShares(userId, symbol, qty, priceCents, reservedCents = 0) {
    const cost = priceCents * qty;
    const extra = Math.max(0, cost - reservedCents);
    const filter = { _id: userId, cashCents: { $gte: extra } };
    if (reservedCents) filter.reservedCashCents = { $gte: reservedCents };
    const debited = await UserModel.updateOne(filter, { $inc: { cashCents: reservedCents - cost, reservedCashCents: -reservedCents } });
    if (debited.modifiedCount !== 1) throw unprocessable("INSUFFICIENT_FUNDS", "Not enough virtual cash for this order.");
    try {
      await HoldingModel.updateOne({ user: userId, symbol }, { $inc: { qty, costCents: cost } }, { upsert: true });
    } catch (err) {
      await UserModel.updateOne({ _id: userId }, { $inc: { cashCents: cost - reservedCents, reservedCashCents: reservedCents } });
      throw err;
    }
  }

  async function sellShares(userId, symbol, qty, priceCents, fromReserved = false) {
    let removedCost = null;
    for (let attempt = 0; attempt < 5 && removedCost === null; attempt++) {
      const h = await HoldingModel.findOne({ user: userId, symbol });
      const reserved = h?.reservedQty || 0;
      const available = h ? h.qty - (fromReserved ? 0 : reserved) : 0;
      if (!h || available < qty || (fromReserved && reserved < qty)) {
        throw unprocessable(
          "INSUFFICIENT_QUANTITY",
          reserved && !fromReserved
            ? `Only ${Math.max(0, h.qty - reserved)} share(s) are available; the rest are reserved by open sell orders.`
            : "You cannot sell more shares than you hold."
        );
      }
      const cost = Math.round((h.costCents * qty) / h.qty);
      const res = await HoldingModel.updateOne(
        { _id: h._id, qty: h.qty, costCents: h.costCents, reservedQty: h.reservedQty || 0 },
        { $inc: { qty: -qty, costCents: -cost, reservedQty: fromReserved ? -qty : 0 } }
      );
      if (res.modifiedCount === 1) removedCost = cost;
    }
    if (removedCost === null) throw conflict("CONCURRENT_UPDATE", "Holding changed concurrently; please retry.");
    await UserModel.updateOne({ _id: userId }, { $inc: { cashCents: priceCents * qty } });
    await HoldingModel.deleteOne({ user: userId, symbol, qty: 0, reservedQty: { $in: [0, null] } });
    return removedCost;
  }

  function stampFill(order, quote, priceCents) {
    order.priceCents = priceCents;
    order.valueCents = priceCents * order.qty;
    order.priceSource = quote.source;
    order.priceTimestamp = quote.sourceTs ? new Date(quote.sourceTs) : new Date(quote.receivedAt || now());
    order.filledAt = new Date(now());
  }

  async function claim(userId, fields) {
    try {
      return { order: await OrderModel.create({ user: userId, ...fields }), duplicate: false };
    } catch (err) {
      if (err?.code === 11000) {
        const existing = await OrderModel.findOne({ user: userId, clientOrderId: fields.clientOrderId });
        if (existing) return { order: existing, duplicate: true };
      }
      throw err;
    }
  }

  async function placeMarket(userId, input, quote) {
    const priceCents = toCents(quote.price);
    const { order, duplicate } = await claim(userId, {
      symbol: input.symbol,
      side: input.side,
      type: "MARKET",
      qty: input.qty,
      priceCents: 0,
      valueCents: 0,
      clientOrderId: input.clientOrderId,
      note: input.note || "",
    });
    if (duplicate) return { order, duplicate };
    try {
      if (input.side === "BUY") await buyShares(userId, input.symbol, input.qty, priceCents);
      else order.realizedPnlCents = priceCents * input.qty - (await sellShares(userId, input.symbol, input.qty, priceCents));
    } catch (err) {
      await OrderModel.deleteOne({ _id: order._id });
      throw err;
    }
    stampFill(order, quote, priceCents);
    order.status = "EXECUTED";
    await order.save();
    onPortfolioChanged(userId);
    return { order, duplicate: false };
  }

  async function placeConditional(userId, input) {
    const openCount = await OrderModel.countDocuments({ user: userId, status: "OPEN" });
    if (openCount >= MAX_OPEN_ORDERS) throw unprocessable("TOO_MANY_OPEN_ORDERS", `You can have at most ${MAX_OPEN_ORDERS} open orders.`);

    const triggerCents = toCents(input.price);
    const reserve = input.side === "BUY" ? Math.ceil(triggerCents * input.qty * (input.type === "STOP" ? STOP_BUY_BUFFER : 1)) : 0;
    const expiresAt = input.validity === "GTC" ? new Date(now() + GTC_DAYS * 24 * 60 * 60_000) : nextMarketClose(new Date(now()));

    const { order, duplicate } = await claim(userId, {
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      qty: input.qty,
      triggerPriceCents: triggerCents,
      validity: input.validity,
      expiresAt,
      priceCents: 0,
      valueCents: 0,
      clientOrderId: input.clientOrderId,
      note: input.note || "",
    });
    if (duplicate) return { order, duplicate };

    try {
      if (input.side === "BUY") {
        const res = await UserModel.updateOne(
          { _id: userId, cashCents: { $gte: reserve } },
          { $inc: { cashCents: -reserve, reservedCashCents: reserve } }
        );
        if (res.modifiedCount !== 1) {
          throw unprocessable(
            "INSUFFICIENT_FUNDS",
            input.type === "STOP"
              ? "Not enough virtual cash: stop buys reserve the trigger value plus a 5% buffer."
              : "Not enough virtual cash to reserve for this order."
          );
        }
      } else {
        const res = await HoldingModel.updateOne(
          { user: userId, symbol: input.symbol, $expr: { $gte: [{ $subtract: ["$qty", { $ifNull: ["$reservedQty", 0] }] }, input.qty] } },
          { $inc: { reservedQty: input.qty } }
        );
        if (res.modifiedCount !== 1) {
          throw unprocessable("INSUFFICIENT_QUANTITY", "You don't have enough unreserved shares for this sell order.");
        }
      }
    } catch (err) {
      await OrderModel.deleteOne({ _id: order._id });
      throw err;
    }
    order.reservedCents = reserve;
    order.status = "OPEN";
    await order.save();
    return { order, duplicate: false };
  }

  async function placeOrder(userId, input) {
    const existing = await OrderModel.findOne({ user: userId, clientOrderId: input.clientOrderId });
    if (existing) return { order: serializeOrder(existing), duplicate: true };

    const quote = await marketData.getTradeQuote(input.symbol);
    const type = input.type || "MARKET";
    const { order, duplicate } = type === "MARKET" ? await placeMarket(userId, input, quote) : await placeConditional(userId, { ...input, type });
    if (!duplicate && order.status === "OPEN") {
      const filled = await tryFill(order, quote);
      if (filled) return { order: serializeOrder(filled), duplicate: false };
    }
    return { order: serializeOrder(order), duplicate };
  }

  async function releaseReservation(order) {
    if (order.side === "BUY" && order.reservedCents > 0) {
      await UserModel.updateOne({ _id: order.user }, { $inc: { cashCents: order.reservedCents, reservedCashCents: -order.reservedCents } });
    } else if (order.side === "SELL") {
      await HoldingModel.updateOne({ user: order.user, symbol: order.symbol }, { $inc: { reservedQty: -order.qty } });
      await HoldingModel.deleteOne({ user: order.user, symbol: order.symbol, qty: 0, reservedQty: 0 });
    }
  }

  const canFill = (quote) => quote && quote.status !== "unavailable" && quote.price > 0 && quote.marketState !== "closed";

  async function tryFill(order, quote) {
    if (!canFill(quote) || !isTriggered(order, quote.price)) return null;
    const claimed = await OrderModel.findOneAndUpdate({ _id: order._id, status: "OPEN" }, { $set: { status: "FILLING" } }, { new: true });
    if (!claimed) return null;
    const priceCents = toCents(quote.price);
    try {
      if (claimed.side === "BUY") await buyShares(claimed.user, claimed.symbol, claimed.qty, priceCents, claimed.reservedCents);
      else claimed.realizedPnlCents = priceCents * claimed.qty - (await sellShares(claimed.user, claimed.symbol, claimed.qty, priceCents, true));
    } catch (err) {
      if (!(err instanceof ApiError)) {
        await OrderModel.updateOne({ _id: claimed._id, status: "FILLING" }, { $set: { status: "OPEN" } });
        throw err;
      }
      await releaseReservation(claimed);
      claimed.status = "REJECTED";
      claimed.statusReason = err.message;
      await claimed.save();
      await notifications?.notify(claimed.user, {
        type: "ORDER_REJECTED",
        title: `${claimed.type} ${claimed.side} ${claimed.symbol} rejected`,
        body: err.message,
        data: { orderId: String(claimed._id), symbol: claimed.symbol },
      });
      onPortfolioChanged(claimed.user);
      return claimed;
    }
    stampFill(claimed, quote, priceCents);
    claimed.reservedCents = 0;
    claimed.status = "EXECUTED";
    await claimed.save();
    await notifications?.notify(claimed.user, {
      type: "ORDER_FILLED",
      title: `${claimed.type} ${claimed.side === "BUY" ? "buy" : "sell"} filled: ${claimed.qty} ${claimed.symbol}`,
      body: `Filled at $${fromCents(priceCents).toFixed(2)} (simulated). Trigger was $${fromCents(claimed.triggerPriceCents).toFixed(2)}.`,
      data: { orderId: String(claimed._id), symbol: claimed.symbol },
    });
    onPortfolioChanged(claimed.user);
    return claimed;
  }

  async function cancelOrder(userId, orderId) {
    const order = await OrderModel.findOneAndUpdate(
      { _id: orderId, user: userId, status: "OPEN" },
      { $set: { status: "CANCELLED", statusReason: "Cancelled by you" } },
      { new: true }
    );
    if (!order) {
      const exists = await OrderModel.exists({ _id: orderId, user: userId });
      if (!exists) throw notFound("Order not found.");
      throw conflict("ORDER_NOT_OPEN", "Only open orders can be cancelled.");
    }
    await releaseReservation(order);
    onPortfolioChanged(userId);
    return serializeOrder(order);
  }

  async function expireDue() {
    const due = await OrderModel.find({ status: "OPEN", expiresAt: { $lte: new Date(now()) } }).limit(200);
    let expired = 0;
    for (const o of due) {
      const order = await OrderModel.findOneAndUpdate(
        { _id: o._id, status: "OPEN" },
        { $set: { status: "EXPIRED", statusReason: o.validity === "DAY" ? "Day order expired at market close" : "Order expired" } },
        { new: true }
      );
      if (!order) continue;
      await releaseReservation(order);
      expired += 1;
      await notifications?.notify(order.user, {
        type: "ORDER_EXPIRED",
        title: `${order.type} ${order.side === "BUY" ? "buy" : "sell"} ${order.symbol} expired`,
        body: "The order was not filled before it expired; any reserved cash or shares were released.",
        data: { orderId: String(order._id), symbol: order.symbol },
      });
      onPortfolioChanged(order.user);
    }
    return expired;
  }

  const STATUS_FILTERS = {
    executed: { status: "EXECUTED" },
    open: { status: "OPEN" },
    closed: { status: { $in: ["CANCELLED", "EXPIRED", "REJECTED"] } },
  };

  async function listOrders(userId, { limit = 50, before, status = "executed" } = {}) {
    const filter = { user: userId, ...STATUS_FILTERS[status] };
    if (before) filter.createdAt = { $lt: before };
    const sort = status === "executed" ? { filledAt: -1, createdAt: -1 } : { createdAt: -1 };
    const orders = await OrderModel.find(filter).sort(sort).limit(limit);
    return orders.map(serializeOrder);
  }

  async function setNote(userId, orderId, note) {
    const order = await OrderModel.findOneAndUpdate({ _id: orderId, user: userId }, { $set: { note } }, { new: true });
    if (!order) throw notFound("Order not found.");
    return serializeOrder(order);
  }

  async function changeCash(userId, amount, direction) {
    const cents = toCents(amount);
    if (direction === "deposit") {
      const res = await UserModel.updateOne(
        { _id: userId, cashCents: { $lte: MAX_CASH_CENTS - cents } },
        { $inc: { cashCents: cents, netDepositsCents: cents } }
      );
      if (res.modifiedCount !== 1) throw unprocessable("CASH_LIMIT", "Virtual cash balance cannot exceed $10,000,000.");
    } else {
      const res = await UserModel.updateOne({ _id: userId, cashCents: { $gte: cents } }, { $inc: { cashCents: -cents, netDepositsCents: -cents } });
      if (res.modifiedCount !== 1) throw unprocessable("INSUFFICIENT_FUNDS", "You cannot withdraw more than your available cash.");
    }
    const user = await UserModel.findById(userId);
    onPortfolioChanged(userId);
    return fromCents(user.cashCents);
  }

  return { placeOrder, cancelOrder, tryFill, expireDue, listOrders, setNote, changeCash, isTriggered };
}

module.exports = { createTradingService, serializeOrder, isTriggered };
