import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import GeneralContext from "./GeneralContext";
import ChartCard from "./charts/ChartCard";
import { AllocationDoughnut, GroupedBar, LineChart, SignedBar, pctFormat } from "./charts/Charts";
import { useApiData } from "../hooks/useApiData";
import { BUY, SELL, SERIES, foldOther } from "../charts/palette";
import { formatCompact, formatMoney, formatPct, formatPrice, formatSigned, formatTime } from "../utils/format";
import PageSkeleton from "./PageSkeleton";

const PERIODS = [
  { key: "5D", label: "5D" },
  { key: "MTD", label: "MTD" },
  { key: "13W", label: "3M" },
  { key: "26W", label: "6M" },
  { key: "YTD", label: "YTD" },
  { key: "52W", label: "1Y" },
];

const shortDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const shortDateTime = (t) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const toneClass = (v) => (v == null ? "" : v < 0 ? "loss-text" : "profit");

const Kpi = ({ label, value, sub, tone }) => (
  <div className="kpi">
    <p className="kpi-label">{label}</p>
    <h3 className={tone}>{value}</h3>
    {sub && <p className="kpi-sub">{sub}</p>}
  </div>
);

const Analytics = () => {
  const { portfolioVersion, openAnalytics } = useContext(GeneralContext);
  const [tick, setTick] = useState(0);
  const [period, setPeriod] = useState("52W");
  const [withCash, setWithCash] = useState(false);
  const { data, error, loading } = useApiData("/portfolio/analytics", portfolioVersion * 1000 + tick);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (loading && !data) return <PageSkeleton label="Loading analytics" kpis={6} chart rows={3} />;
  if (error && !data) return <p className="page-status error">{error}</p>;

  const { totals, risk, holdings, sectorAllocation, history, realizedSeries, activity, provider, performance = [] } = data;
  const lastPerf = performance.at(-1);
  const isDemo = provider === "demo";
  const sampleNote = isDemo ? " Prices are sample data (no FINNHUB_API_KEY configured)." : "";
  const byPnl = [...holdings].filter((h) => h.pnl != null).sort((a, b) => b.pnl - a.pnl);
  const bySymbol = [...holdings].sort((a, b) => a.symbol.localeCompare(b.symbol));

  const allocation = [
    ...foldOther(
      holdings.filter((h) => h.curValue != null),
      { key: (h) => h.symbol, value: (h) => h.curValue, max: 7 }
    ),
    ...(withCash && totals.cash + (totals.reservedCash || 0) > 0 ? [{ label: "Cash", value: totals.cash + (totals.reservedCash || 0) }] : []),
  ];
  const allocationTotal = allocation.reduce((s, a) => s + a.value, 0);
  const allPnlZero = byPnl.length > 0 && byPnl.every((h) => h.pnl === 0);
  const sectors = foldOther(sectorAllocation, { key: (s) => s.sector, value: (s) => s.value, max: 7 });

  const withReturns = bySymbol.filter((h) => h.returns?.[period] != null);
  const periodLabel = PERIODS.find((p) => p.key === period).label;

  return (
    <div className="analytics">
      <div className="analytics-head">
        <h3 className="title">Portfolio analytics</h3>
        <p className="analytics-asof">
          Updated {formatTime(data.asOf)}
          {loading ? " · refreshing…" : ""}
        </p>
      </div>

      <div className="kpi-row">
        <Kpi label="Account value" value={formatMoney(totals.accountValue)} sub={`Cash ${formatPct(totals.cashPct).replace("+", "")} of account`} />
        <Kpi
          label="Today's P&L"
          value={formatSigned(totals.dayPnl)}
          sub={totals.dayPnl == null ? "No day change available" : formatPct(totals.dayPnlPct)}
          tone={toneClass(totals.dayPnl)}
        />
        <Kpi label="Unrealized P&L" value={formatSigned(totals.unrealizedPnl)} sub={formatPct(totals.unrealizedPnlPct)} tone={toneClass(totals.unrealizedPnl)} />
        <Kpi label="Realized P&L" value={formatSigned(totals.realizedPnl)} sub="From completed sells" tone={toneClass(totals.realizedPnl)} />
        <Kpi
          label="Diversification"
          value={risk.effectiveHoldings != null ? risk.effectiveHoldings.toFixed(1) : "—"}
          sub={
            risk.largestPosition
              ? `Effective positions · largest ${risk.largestPosition.symbol} ${risk.largestPosition.weight.toFixed(1)}%`
              : "Effective number of positions"
          }
        />
        <Kpi
          label="Portfolio beta"
          value={risk.weightedBeta != null ? risk.weightedBeta.toFixed(2) : "—"}
          sub={risk.weightedBeta != null ? `Value-weighted · covers ${risk.betaCoveragePct?.toFixed(0)}% of holdings` : "Needs Finnhub metrics"}
        />
      </div>

      {!holdings.length && (
        <p className="page-status">
          You have no holdings yet, so most charts are empty. <Link to="/">Buy a stock from your watchlist</Link> to see your allocation and
          P&L here.
        </p>
      )}
      {data.pendingCompanyData > 0 && (
        <p className="page-status">
          Fetching sector and metrics data for {data.pendingCompanyData} holding(s) within the free market-data rate limit — it will appear on the
          next refresh.
        </p>
      )}

      <div className="analytics-grid">
        <ChartCard
          title="Allocation"
          note={`Share of ${withCash ? "account value (holdings + cash)" : "holdings value"} at current market prices.${sampleNote}`}
          empty={!allocation.length && (withCash ? "No holdings or cash to show." : "No priced holdings yet.")}
          actions={
            <div className="segmented" role="group" aria-label="Allocation scope">
              <button type="button" aria-pressed={!withCash} onClick={() => setWithCash(false)}>
                Holdings
              </button>
              <button type="button" aria-pressed={withCash} onClick={() => setWithCash(true)}>
                With cash
              </button>
            </div>
          }
          table={{
            columns: ["Holding", "Value", "Share"],
            rows: allocation.map((a) => [a.label, formatMoney(a.value), `${((a.value / allocationTotal) * 100).toFixed(1)}%`]),
          }}
        >
          <AllocationDoughnut items={allocation} />
        </ChartCard>

        <ChartCard
          title="Sector exposure"
          note={isDemo ? "Sectors from the sample data set." : "Industry classification from Finnhub company profiles."}
          empty={!sectors.length && "Sector data appears once you hold stocks."}
          table={{
            columns: ["Sector", "Value", "Share of holdings"],
            rows: sectors.map((s) => [s.label, formatMoney(s.value), `${((s.value / totals.holdingsValue) * 100).toFixed(1)}%`]),
          }}
        >
          <AllocationDoughnut items={sectors} neutral={["Unclassified"]} />
        </ChartCard>

        <ChartCard
          title="Unrealized P&L by holding"
          note="Current value minus cost basis, per holding."
          empty={(!byPnl.length && "No priced holdings yet.") || (allPnlZero && "No gains or losses yet — every holding is still at its purchase price.")}
          height={Math.max(160, byPnl.length * 32)}
          table={{
            columns: ["Holding", "P&L", "Return"],
            rows: byPnl.map((h) => [h.symbol, formatSigned(h.pnl), formatPct(h.netChgPct)]),
          }}
        >
          <SignedBar labels={byPnl.map((h) => h.symbol)} values={byPnl.map((h) => h.pnl)} label="P&L" />
        </ChartCard>

        <ChartCard
          title="Invested vs current value"
          note="Cost basis compared with today's market value."
          empty={!bySymbol.length && "No holdings yet."}
          table={{
            columns: ["Holding", "Invested", "Current value"],
            rows: bySymbol.map((h) => [h.symbol, formatMoney(h.investment), formatMoney(h.curValue)]),
          }}
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
          className="span-2"
          title={`Stock returns over ${periodLabel}`}
          note={
            isDemo
              ? "Period returns need real Finnhub metrics and are not part of the sample data."
              : "Price return of each holding over the selected period, from Finnhub's basic financials (not your own entry price)."
          }
          empty={!withReturns.length && (isDemo ? "Not available with sample data — add FINNHUB_API_KEY to the backend." : "No return data for your holdings yet.")}
          height={Math.max(160, withReturns.length * 32)}
          actions={
            <div className="segmented" role="group" aria-label="Return period">
              {PERIODS.map((p) => (
                <button key={p.key} type="button" aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          }
          table={{
            columns: ["Holding", `${periodLabel} return`, "52-week low", "52-week high"],
            rows: withReturns.map((h) => [h.symbol, formatPct(h.returns[period]), formatPrice(h.low52), formatPrice(h.high52)]),
          }}
        >
          <SignedBar
            labels={withReturns.map((h) => h.symbol)}
            values={withReturns.map((h) => h.returns[period])}
            format={pctFormat}
            label={`${periodLabel} return`}
          />
        </ChartCard>

        <ChartCard
          className="span-2"
          title="Account value history"
          note="Recorded by this app whenever your portfolio changes (and at most every 10 minutes otherwise). There is no back-filled history before you started using it."
          empty={history.length < 2 && "History builds up as you use the dashboard — come back after a few trades or later today."}
          table={{
            columns: ["Time", "Account value", "Invested", "Cash", "Prices"],
            rows: [...history].reverse().map((h) => [shortDateTime(h.t), formatMoney(h.accountValue), formatMoney(h.invested), formatMoney(h.cash), h.priceSource === "demo" ? "Sample" : "Live"]),
          }}
        >
          <LineChart
            labels={history.map((h) => shortDateTime(h.t))}
            series={[
              { label: "Account value", values: history.map((h) => h.accountValue), color: SERIES[0] },
              { label: "Invested", values: history.map((h) => h.invested), color: SERIES[1] },
            ]}
          />
        </ChartCard>

        <ChartCard
          className="span-2"
          title="Performance vs S&P 500 (SPY)"
          note={`Your time-weighted return (deposits and withdrawals are not counted as gains) vs SPY's price return, both from your first snapshot.${
            isDemo ? " Sample prices do not move, so both lines stay flat in demo mode." : ""
          }`}
          empty={performance.length < 2 && "The comparison appears once at least two snapshots with a SPY price have been recorded."}
          actions={
            lastPerf && (
              <span className="perf-summary">
                You <strong className={toneClass(lastPerf.portfolioPct)}>{formatPct(lastPerf.portfolioPct)}</strong> · SPY{" "}
                <strong className={toneClass(lastPerf.benchmarkPct)}>{formatPct(lastPerf.benchmarkPct)}</strong>
              </span>
            )
          }
          table={{
            columns: ["Time", "Your return", "SPY return", "Difference"],
            rows: [...performance]
              .reverse()
              .map((p) => [shortDateTime(p.t), formatPct(p.portfolioPct), formatPct(p.benchmarkPct), formatPct(Math.round((p.portfolioPct - p.benchmarkPct) * 100) / 100)]),
          }}
        >
          <LineChart
            labels={performance.map((p) => shortDateTime(p.t))}
            series={[
              { label: "Your portfolio", values: performance.map((p) => p.portfolioPct), color: SERIES[0] },
              { label: "S&P 500 (SPY)", values: performance.map((p) => p.benchmarkPct), color: SERIES[1] },
            ]}
            format={pctFormat}
          />
        </ChartCard>

        <ChartCard
          title="Cumulative realized P&L"
          note="Running total of gains and losses locked in by sells."
          empty={!realizedSeries.length && "No sells yet."}
          table={{
            columns: ["Time", "Symbol", "Cumulative P&L"],
            rows: [...realizedSeries].reverse().map((r) => [shortDateTime(r.t), r.symbol, formatSigned(r.value)]),
          }}
        >
          <LineChart labels={realizedSeries.map((r) => shortDateTime(r.t))} series={[{ label: "Realized P&L", values: realizedSeries.map((r) => r.value), color: SERIES[0] }]} stepped />
        </ChartCard>

        <ChartCard
          title="Trading activity (30 days)"
          note="Value of simulated buys and sells per US trading day."
          empty={!activity.length && "No orders in the last 30 days."}
          table={{
            columns: ["Date", "Bought", "Sold", "Orders"],
            rows: [...activity].reverse().map((d) => [d.date, formatMoney(d.buyValue), formatMoney(d.sellValue), d.orders]),
          }}
        >
          <GroupedBar
            labels={activity.map((d) => shortDate(`${d.date}T12:00:00`))}
            series={[
              { label: "Bought", values: activity.map((d) => d.buyValue), color: BUY },
              { label: "Sold", values: activity.map((d) => d.sellValue), color: SELL },
            ]}
            format={formatCompact}
          />
        </ChartCard>
      </div>

      {holdings.length > 0 && (
        <div className="order-table analytics-holdings">
          <table>
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Sector</th>
                <th>Weight</th>
                <th>Day P&L</th>
                <th>Beta</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {bySymbol.map((h) => (
                <tr key={h.symbol}>
                  <td>{h.symbol}</td>
                  <td>{h.sector || "—"}</td>
                  <td>{h.weight != null ? `${h.weight.toFixed(1)}%` : "—"}</td>
                  <td className={h.dayPnl == null ? "" : h.dayPnl < 0 ? "loss" : "profit"}>{formatSigned(h.dayPnl)}</td>
                  <td>{h.beta != null ? h.beta.toFixed(2) : "—"}</td>
                  <td>
                    <button type="button" className="link-button" onClick={() => openAnalytics(h.symbol)}>
                      View {h.symbol}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Analytics;
