const { HoldingModel } = require("../models/Holding");
const { OrderModel } = require("../models/Order");
const { fromCents } = require("../utils/money");

const round2 = (n) => Math.round(n * 100) / 100;

function startOfTradingDay(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const nyAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMs = nyAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - offsetMs);
}

function quoteFields(q) {
  const priced = q && q.status !== "unavailable" && q.price > 0;
  return {
    ltp: priced ? q.price : null,
    dayChgPct: priced ? q.changePct ?? null : null,
    dayChange: priced ? q.change ?? null : null,
    quoteStatus: q?.status || "unavailable",
    quoteTime: priced ? q.sourceTs || q.receivedAt : null,
  };
}

function createPortfolioService({ marketData }) {
  async function holdings(userId) {
    const docs = await HoldingModel.find({ user: userId, qty: { $gt: 0 } }).sort({ symbol: 1 });
    const quotes = await marketData.getQuotes(docs.map((d) => d.symbol));
    let investment = 0;
    let currentValue = 0;
    let unpriced = 0;

    const items = docs.map((d) => {
      const cost = fromCents(d.costCents);
      const q = quoteFields(quotes[d.symbol]);
      investment += cost;
      const curValue = q.ltp != null ? round2(q.ltp * d.qty) : null;
      if (curValue == null) unpriced += 1;
      else currentValue += curValue;
      return {
        symbol: d.symbol,
        qty: d.qty,
        reservedQty: d.reservedQty || 0,
        avgPrice: round2(cost / d.qty),
        investment: cost,
        curValue,
        pnl: curValue != null ? round2(curValue - cost) : null,
        netChgPct: curValue != null && cost > 0 ? round2(((curValue - cost) / cost) * 100) : null,
        ...q,
      };
    });

    const pricedInvestment = items.filter((i) => i.curValue != null).reduce((s, i) => s + i.investment, 0);
    const pnl = round2(currentValue - pricedInvestment);
    return {
      items,
      totals: {
        investment: round2(investment),
        currentValue: round2(currentValue),
        pnl,
        pnlPct: pricedInvestment > 0 ? round2((pnl / pricedInvestment) * 100) : null,
        unpricedCount: unpriced,
      },
    };
  }

  async function positions(userId, now = new Date()) {
    const orders = await OrderModel.find({ user: userId, status: "EXECUTED", filledAt: { $gte: startOfTradingDay(now) } });
    const bySymbol = new Map();
    for (const o of orders) {
      const p = bySymbol.get(o.symbol) || { symbol: o.symbol, buyQty: 0, sellQty: 0, buyValue: 0, sellValue: 0, realized: 0 };
      if (o.side === "BUY") {
        p.buyQty += o.qty;
        p.buyValue += o.valueCents;
      } else {
        p.sellQty += o.qty;
        p.sellValue += o.valueCents;
        p.realized += o.realizedPnlCents || 0;
      }
      bySymbol.set(o.symbol, p);
    }
    const quotes = await marketData.getQuotes([...bySymbol.keys()]);
    return [...bySymbol.values()]
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map((p) => {
        const q = quoteFields(quotes[p.symbol]);
        const netQty = p.buyQty - p.sellQty;
        const buyValue = fromCents(p.buyValue);
        const sellValue = fromCents(p.sellValue);
        const avgBuy = p.buyQty ? buyValue / p.buyQty : 0;
        const heldFromToday = Math.max(netQty, 0);
        return {
          product: "SIM",
          symbol: p.symbol,
          buyQty: p.buyQty,
          sellQty: p.sellQty,
          netQty,
          avgBuyPrice: p.buyQty ? round2(buyValue / p.buyQty) : null,
          avgSellPrice: p.sellQty ? round2(sellValue / p.sellQty) : null,
          pnl:
            heldFromToday === 0 || q.ltp != null
              ? round2(fromCents(p.realized) + (heldFromToday ? (q.ltp - avgBuy) * heldFromToday : 0))
              : null,
          ...q,
        };
      });
  }

  return { holdings, positions };
}

module.exports = { createPortfolioService, startOfTradingDay };
