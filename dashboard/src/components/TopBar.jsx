import React from "react";

import Menu from "./Menu";
import { useQuotes } from "../context/MarketDataContext";
import { formatPct, formatPrice } from "../utils/format";

const INDICES = [
  { symbol: "SPY", label: "S&P 500 (SPY)", className: "nifty" },
  { symbol: "QQQ", label: "NASDAQ 100 (QQQ)", className: "sensex" },
];

const TopBar = () => {
  const quotes = useQuotes(INDICES.map((i) => i.symbol));

  return (
    <div className="topbar-container">
      <div className="indices-container">
        {INDICES.map(({ symbol, label, className }) => {
          const q = quotes[symbol];
          const down = q?.changePct != null && q.changePct < 0;
          return (
            <div className={className} key={symbol} title={q?.status === "demo" ? "Sample data" : undefined}>
              <p className="index">{label}</p>
              <p className={`index-points ${down ? "down" : "up"}`}>{formatPrice(q?.price)}</p>
              <p className="percent">{formatPct(q?.changePct)}</p>
            </div>
          );
        })}
      </div>

      <Menu />
    </div>
  );
};

export default TopBar;
