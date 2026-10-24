import React, { useContext } from "react";

import GeneralContext from "./GeneralContext";
import QuoteStatus from "./QuoteStatus";
import { useApiData } from "../hooks/useApiData";
import { useQuotes } from "../context/MarketDataContext";
import { formatPct, formatPrice, formatSigned } from "../utils/format";
import PageSkeleton from "./PageSkeleton";

const Positions = () => {
  const { portfolioVersion } = useContext(GeneralContext);
  const { data, error, loading } = useApiData("/positions", portfolioVersion);
  const positions = data?.positions || [];
  const quotes = useQuotes(positions.map((p) => p.symbol));

  if (loading && !data) return <PageSkeleton label="Loading positions" />;
  if (error && !data) return <p className="page-status error">{error}</p>;

  return (
    <>
      <h3 className="title">Positions ({positions.length})</h3>
      {!positions.length ? (
        <p className="page-status">No trades today. Positions show the simulated orders you place during the current US trading day.</p>
      ) : (
        <div className="order-table">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Instrument</th>
                <th>Net qty.</th>
                <th>Avg. buy</th>
                <th>LTP</th>
                <th>Day P&L</th>
                <th>Chg.</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const q = quotes[p.symbol];
                const ltp = q?.price > 0 ? q.price : p.ltp;
                const avgBuy = p.avgBuyPrice || 0;
                const pnl =
                  p.pnl != null && ltp != null && p.netQty > 0 && p.ltp != null ? p.pnl + (ltp - p.ltp) * p.netQty : p.pnl;
                const chg = q?.changePct ?? p.dayChgPct;
                return (
                  <tr key={p.symbol}>
                    <td>{p.product}</td>
                    <td>
                      {p.symbol} <QuoteStatus quote={q || { status: p.quoteStatus }} hideLive />
                    </td>
                    <td>{p.netQty}</td>
                    <td>{avgBuy ? formatPrice(avgBuy) : "—"}</td>
                    <td>{formatPrice(ltp)}</td>
                    <td className={pnl == null ? "" : pnl >= 0 ? "profit" : "loss"}>{formatSigned(pnl)}</td>
                    <td className={chg == null ? "" : chg < 0 ? "loss" : "profit"}>{formatPct(chg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default Positions;
