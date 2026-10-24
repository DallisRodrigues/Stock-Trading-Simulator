import React, { useContext, useMemo } from "react";
import { Link } from "react-router-dom";

import ChartCard from "./charts/ChartCard";
import { AllocationDoughnut, GroupedBar } from "./charts/Charts";
import { SERIES, foldOther } from "../charts/palette";
import GeneralContext from "./GeneralContext";
import QuoteStatus from "./QuoteStatus";
import { useApiData } from "../hooks/useApiData";
import { useQuotes } from "../context/MarketDataContext";
import { formatPct, formatPrice, formatSigned } from "../utils/format";
import { totalsOf, withLiveQuotes } from "../utils/portfolio";
import PageSkeleton from "./PageSkeleton";

const Holdings = () => {
  const { portfolioVersion } = useContext(GeneralContext);
  const { data, error, loading } = useApiData("/holdings", portfolioVersion);
  const serverItems = useMemo(() => data?.items || [], [data]);
  const quotes = useQuotes(serverItems.map((h) => h.symbol));
  const items = useMemo(() => withLiveQuotes(serverItems, quotes), [serverItems, quotes]);
  const totals = totalsOf(items);

  const bySymbol = [...items].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const allocation = foldOther(
    items.filter((h) => h.curValue != null),
    { key: (h) => h.symbol, value: (h) => h.curValue }
  );

  if (loading && !data) return <PageSkeleton label="Loading holdings" chart />;
  if (error && !data) return <p className="page-status error">{error}</p>;

  if (!items.length) {
    return (
      <div className="orders">
        <div className="no-orders">
          <p>You don't have any holdings yet</p>
          <p className="hint">Hover a stock in your watchlist and press Buy to place a simulated order.</p>
          <Link to="/" className="btn">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <h3 className="title">Holdings ({items.length})</h3>

      <div className="order-table">
        <table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Qty.</th>
              <th>Avg. cost</th>
              <th>LTP</th>
              <th>Cur. val</th>
              <th>P&L</th>
              <th>Net chg.</th>
              <th>Day chg.</th>
            </tr>
          </thead>
          <tbody>
            {items.map((stock) => {
              const profClass = stock.pnl == null ? "" : stock.pnl >= 0 ? "profit" : "loss";
              const dayClass = stock.dayChgPct == null ? "" : stock.dayChgPct < 0 ? "loss" : "profit";
              return (
                <tr key={stock.symbol}>
                  <td>
                    {stock.symbol} <QuoteStatus quote={stock.quote || { status: stock.quoteStatus }} hideLive />
                  </td>
                  <td>{stock.qty}</td>
                  <td>{formatPrice(stock.avgPrice)}</td>
                  <td>{formatPrice(stock.ltp)}</td>
                  <td>{formatPrice(stock.curValue)}</td>
                  <td className={profClass}>{formatSigned(stock.pnl)}</td>
                  <td className={profClass}>{formatPct(stock.netChgPct)}</td>
                  <td className={dayClass}>{formatPct(stock.dayChgPct)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row">
        <div className="col">
          <h5>{formatPrice(totals.investment)}</h5>
          <p>Total investment (USD)</p>
        </div>
        <div className="col">
          <h5>{formatPrice(totals.currentValue)}</h5>
          <p>Current value{totals.unpriced ? ` (${totals.unpriced} unpriced)` : ""}</p>
        </div>
        <div className="col">
          <h5 className={totals.pnl < 0 ? "loss-text" : ""}>
            {formatSigned(totals.pnl)} ({formatPct(totals.pnlPct)})
          </h5>
          <p>P&L</p>
        </div>
      </div>
      <div className="holdings-charts">
        <ChartCard
          title="Invested vs current value"
          note="Cost basis compared with live market value, per holding."
          table={{ columns: ["Holding", "Invested", "Current value"], rows: bySymbol.map((h) => [h.symbol, formatPrice(h.investment), formatPrice(h.curValue)]) }}
        >
          <GroupedBar
            labels={bySymbol.map((h) => h.symbol)}
            series={[
              { label: "Invested", values: bySymbol.map((h) => h.investment), color: SERIES[0] },
              { label: "Current value", values: bySymbol.map((h) => h.curValue), color: SERIES[1] },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Allocation"
          note="Share of holdings value."
          empty={!allocation.length && "No priced holdings."}
          table={{
            columns: ["Holding", "Value", "Share"],
            rows: allocation.map((a) => [a.label, formatPrice(a.value), `${((a.value / totals.currentValue) * 100).toFixed(1)}%`]),
          }}
        >
          <AllocationDoughnut items={allocation} />
        </ChartCard>
      </div>
      <p className="chart-note">
        More charts — sectors, returns, history and activity — are on the <Link to="/analytics">Analytics</Link> page.
      </p>
    </>
  );
};

export default Holdings;
