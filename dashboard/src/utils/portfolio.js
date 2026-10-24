const round2 = (n) => Math.round(n * 100) / 100;

export function withLiveQuotes(items, quotes) {
  return items.map((h) => {
    const q = quotes[h.symbol];
    if (!q || q.status === "unavailable" || !(q.price > 0)) return h;
    const curValue = round2(q.price * h.qty);
    return {
      ...h,
      ltp: q.price,
      curValue,
      pnl: round2(curValue - h.investment),
      netChgPct: h.investment > 0 ? round2(((curValue - h.investment) / h.investment) * 100) : null,
      dayChgPct: q.changePct ?? h.dayChgPct,
      quote: q,
    };
  });
}

export function totalsOf(items) {
  const priced = items.filter((i) => i.curValue != null);
  const investment = round2(items.reduce((s, i) => s + i.investment, 0));
  const pricedInvestment = priced.reduce((s, i) => s + i.investment, 0);
  const currentValue = round2(priced.reduce((s, i) => s + i.curValue, 0));
  const pnl = round2(currentValue - pricedInvestment);
  return { investment, currentValue, pnl, pnlPct: pricedInvestment > 0 ? (pnl / pricedInvestment) * 100 : null, unpriced: items.length - priced.length };
}
