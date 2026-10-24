import React, { useContext, useMemo } from "react";

import GeneralContext from "./GeneralContext";
import { useAuth } from "../context/AuthContext";
import { useQuotes } from "../context/MarketDataContext";
import { useApiData } from "../hooks/useApiData";
import { totalsOf, withLiveQuotes } from "../utils/portfolio";
import { formatCompact, formatPct, formatPrice } from "../utils/format";
import Heatmap from "./charts/Heatmap";

const Summary = () => {
  const { user } = useAuth();
  const { portfolioVersion, openAnalytics } = useContext(GeneralContext);
  const watchlist = useApiData("/watchlists", portfolioVersion);
  const watchSymbols = useMemo(() => [...new Set((watchlist.data?.lists || []).flatMap((l) => l.symbols))], [watchlist.data]);
  const watchQuotes = useQuotes(watchSymbols);
  const movers = watchSymbols.filter((s) => watchQuotes[s]?.changePct != null).sort((a, b) => watchQuotes[b].changePct - watchQuotes[a].changePct);
  const gainers = movers.filter((s) => watchQuotes[s].changePct > 0).slice(0, 3);
  const losers = movers.filter((s) => watchQuotes[s].changePct < 0).reverse().slice(0, 3);
  const funds = useApiData("/funds", portfolioVersion);
  const holdings = useApiData("/holdings", portfolioVersion);
  const serverItems = useMemo(() => holdings.data?.items || [], [holdings.data]);
  const quotes = useQuotes(serverItems.map((h) => h.symbol));
  const items = useMemo(() => withLiveQuotes(serverItems, quotes), [serverItems, quotes]);
  const totals = totalsOf(items);
  const firstName = user?.name?.split(" ")[0] || "there";

  return (
    <>
      <div className="username">
        <h6>Hi, {firstName}!</h6>
        <hr className="divider" />
      </div>

      {(funds.error || holdings.error) && <p className="page-status error">{funds.error || holdings.error}</p>}

      <div className="section">
        <span>
          <p>Equity</p>
        </span>

        <div className="data">
          <div className="first">
            <h3>{funds.data ? formatCompact(funds.data.cash) : "—"}</h3>
            <p>Cash available (USD)</p>
          </div>
          <hr />

          <div className="second">
            <p>
              Invested <span>{funds.data ? formatCompact(funds.data.invested) : "—"}</span>{" "}
            </p>
            <p>
              Account value <span>{funds.data && holdings.data ? formatCompact(funds.data.cash + (funds.data.reserved || 0) + totals.currentValue) : "—"}</span>{" "}
            </p>
          </div>
        </div>
        <hr className="divider" />
      </div>

      <div className="section">
        <span>
          <p>Holdings ({items.length})</p>
        </span>

        <div className="data">
          <div className="first">
            <h3 className={totals.pnl < 0 ? "loss-text" : "profit"}>
              {holdings.data ? formatCompact(totals.pnl) : "—"} <small className={totals.pnl < 0 ? "loss-text" : ""}>{formatPct(totals.pnlPct)}</small>{" "}
            </h3>
            <p>P&L</p>
          </div>
          <hr />

          <div className="second">
            <p>
              Current Value <span>{holdings.data ? formatCompact(totals.currentValue) : "—"}</span>{" "}
            </p>
            <p>
              Investment <span>{holdings.data ? formatCompact(totals.investment) : "—"}</span>{" "}
            </p>
          </div>
        </div>
        <hr className="divider" />
      </div>
      <div className="section">
        <span>
          <p>Market overview</p>
        </span>
        {!watchSymbols.length ? (
          <p className="page-status">Add stocks to your watchlist to see today's market moves here.</p>
        ) : (
          <div className="market-overview">
            <Heatmap symbols={watchSymbols} quotes={watchQuotes} onSelect={openAnalytics} />
            <div className="movers">
              {[
                ["Top gainers", gainers, "No gainers in your watchlist today."],
                ["Top losers", losers, "No losers in your watchlist today."],
              ].map(([title, list, emptyText]) => (
                <div key={title}>
                  <p className="movers-title">{title}</p>
                  {list.length ? (
                    <ul>
                      {list.map((s) => (
                        <li key={s}>
                          <button type="button" className="link-button" onClick={() => openAnalytics(s)}>
                            {s}
                          </button>
                          <span>{formatPrice(watchQuotes[s].price)}</span>
                          <span className={watchQuotes[s].changePct < 0 ? "loss-text" : "profit"}>{formatPct(watchQuotes[s].changePct)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="page-status">{emptyText}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="chart-note">Tiles are coloured by today's change (red = down, green = up, capped at ±3%); click a tile for details.</p>
      </div>
    </>
  );
};

export default Summary;
