import { describe, expect, it } from "vitest";
import { totalsOf, withLiveQuotes } from "../utils/portfolio";
import { formatPct, formatSigned } from "../utils/format";

const holding = { symbol: "AAPL", qty: 10, avgPrice: 100, investment: 1000, ltp: 100, curValue: 1000, pnl: 0, netChgPct: 0, dayChgPct: 0 };

describe("portfolio helpers", () => {
  it("re-prices holdings from live quotes", () => {
    const [h] = withLiveQuotes([holding], { AAPL: { symbol: "AAPL", price: 110, changePct: 1.5, status: "live" } });
    expect(h).toMatchObject({ ltp: 110, curValue: 1100, pnl: 100, netChgPct: 10, dayChgPct: 1.5 });
  });

  it("ignores unavailable quotes", () => {
    const [h] = withLiveQuotes([holding], { AAPL: { symbol: "AAPL", status: "unavailable" } });
    expect(h.ltp).toBe(100);
  });

  it("totals only priced holdings and counts unpriced ones", () => {
    const t = totalsOf([holding, { ...holding, symbol: "X", curValue: null, investment: 500 }]);
    expect(t).toMatchObject({ investment: 1500, currentValue: 1000, pnl: 0, unpriced: 1 });
  });

  it("formats signed numbers and percentages", () => {
    expect(formatSigned(1.5)).toBe("+1.50");
    expect(formatSigned(-2)).toBe("-2.00");
    expect(formatPct(null)).toBe("—");
    expect(formatPct(-0.256)).toBe("-0.26%");
  });
});
