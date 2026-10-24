import React, { useContext, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, IconButton, Tab, Tabs } from "@mui/material";
import { Close } from "@mui/icons-material";
import { Bar, Line } from "react-chartjs-2";

import api, { errorMessage } from "../api/client";
import QuoteStatus from "./QuoteStatus";
import GeneralContext from "./GeneralContext";
import ChartCard from "./charts/ChartCard";
import RangeBar from "./charts/RangeBar";
import { GroupedBar, LineChart, SignedBar, pctFormat } from "./charts/Charts";
import { useQuotes } from "../context/MarketDataContext";
import { useApiData } from "../hooks/useApiData";
import { axis, barStyle, lineStyle } from "../charts/setup";
import { SERIES } from "../charts/palette";
import { formatCompact, formatMoney, formatPct, formatPrice, formatSigned, formatTime } from "../utils/format";

const MAX_POINTS = 300;
const RETURN_LABELS = { "5D": "5D", MTD: "MTD", "13W": "3M", "26W": "6M", YTD: "YTD", "52W": "1Y" };
const RATINGS = [
  { key: "strongSell", label: "Strong sell", color: "rgb(190, 55, 55)" },
  { key: "sell", label: "Sell", color: "rgb(250, 118, 78)" },
  { key: "hold", label: "Hold", color: "#c9c9c9" },
  { key: "buy", label: "Buy", color: "rgb(130, 205, 120)" },
  { key: "strongBuy", label: "Strong buy", color: "rgb(46, 150, 82)" },
];
const NEEDS_KEY = "Not available with sample data — add FINNHUB_API_KEY to the backend for real company data.";

const monthLabel = (period) => new Date(`${period}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const yearLabel = (period) => period.slice(0, 4);
const quarterLabel = (period) => {
  const d = new Date(`${period}T12:00:00`);
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}`;
};

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

function Overview({ quote, company, holding, onSelect }) {
  const profile = company?.profile?.data;
  const m = company?.metrics?.data;
  const recs = company?.recommendations?.data || [];
  const peers = company?.peers?.data || [];
  const isDemo = company?.provider === "demo";
  const returns = m?.returns ? Object.entries(RETURN_LABELS).filter(([k]) => m.returns[k] != null) : [];

  return (
    <div className="stock-overview">
      <div className="stock-ranges">
        <RangeBar
          label="Day range"
          low={quote?.low}
          high={quote?.high}
          current={quote?.price}
          ticks={[
            { label: "Open", value: quote?.open },
            { label: "Prev. close", value: quote?.prevClose },
          ]}
        />
        <RangeBar label={`52-week range${isDemo ? " (sample)" : ""}`} low={m?.low52} high={m?.high52} current={quote?.price} />
      </div>

      <div className="stat-grid">
        <Stat label="Prev. close" value={formatPrice(quote?.prevClose)} />
        <Stat label="Open" value={formatPrice(quote?.open)} />
        <Stat label="Market cap" value={profile?.marketCap ? `$${formatCompact(profile.marketCap)}` : null} />
        <Stat label="P/E (TTM)" value={m?.peTTM?.toFixed(2)} />
        <Stat label="EPS (TTM)" value={m?.epsTTM != null ? formatMoney(m.epsTTM) : null} />
        <Stat label="Beta" value={m?.beta?.toFixed(2)} />
        <Stat label="Dividend yield" value={m?.dividendYield != null ? `${m.dividendYield.toFixed(2)}%` : null} />
        <Stat label="ROE (TTM)" value={m?.roeTTM != null ? `${m.roeTTM.toFixed(1)}%` : null} />
        <Stat label="Net margin (TTM)" value={m?.netMarginTTM != null ? `${m.netMarginTTM.toFixed(1)}%` : null} />
        <Stat label="Avg. volume (10D)" value={m?.avgVolume10D ? formatCompact(m.avgVolume10D) : null} />
      </div>

      {holding && (
        <div className="position-strip">
          <span>Your position</span>
          <strong>{holding.qty} shares</strong>
          <span>Avg. {formatMoney(holding.avgPrice)}</span>
          <span>Value {formatMoney(quote?.price ? quote.price * holding.qty : holding.curValue)}</span>
          {(() => {
            const pnl = quote?.price ? quote.price * holding.qty - holding.investment : holding.pnl;
            return <span className={pnl < 0 ? "loss-text" : "profit"}>P&L {formatSigned(pnl)}</span>;
          })()}
        </div>
      )}

      <div className="stock-charts">
        <ChartCard
          title="Price returns"
          note="Price change over each period, from Finnhub basic financials."
          empty={!returns.length && (isDemo ? NEEDS_KEY : "No return data available.")}
          height={180}
          table={{ columns: ["Period", "Return"], rows: returns.map(([k, label]) => [label, formatPct(m.returns[k])]) }}
        >
          <SignedBar
            horizontal={false}
            labels={returns.map(([, label]) => label)}
            values={returns.map(([k]) => m.returns[k])}
            format={pctFormat}
            label="Return"
          />
        </ChartCard>

        <ChartCard
          title="Analyst recommendations"
          note="Number of analysts per rating, by month (Finnhub recommendation trends)."
          empty={!recs.length && (isDemo ? NEEDS_KEY : "No analyst coverage reported.")}
          height={180}
          table={{
            columns: ["Month", ...RATINGS.map((r) => r.label)],
            rows: [...recs].reverse().map((r) => [monthLabel(r.period), ...RATINGS.map((x) => r[x.key])]),
          }}
        >
          <GroupedBar
            stacked
            labels={recs.map((r) => monthLabel(r.period))}
            series={RATINGS.map((x) => ({ label: x.label, values: recs.map((r) => r[x.key]), color: x.color }))}
            format={(v) => String(v)}
          />
        </ChartCard>
      </div>

      {peers.length > 0 && (
        <div className="peers">
          <span>Peers</span>
          {peers.map((p) => (
            <button key={p} type="button" className="peer-chip" onClick={() => onSelect(p)}>
              {p}
            </button>
          ))}
        </div>
      )}
      {profile && (
        <p className="analytics-note">
          {[profile.industry, profile.exchange, profile.country, profile.ipo ? `IPO ${profile.ipo}` : null].filter(Boolean).join(" · ")}
          {profile.website && (
            <>
              {" · "}
              <a href={profile.website} target="_blank" rel="noreferrer">
                Website
              </a>
            </>
          )}
          {isDemo && " · Sample company data"}
        </p>
      )}
    </div>
  );
}

function SessionChart({ symbol, quote }) {
  const [points, setPoints] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api
      .get(`/market/history/${encodeURIComponent(symbol)}`, { signal: controller.signal })
      .then((res) => setPoints(res.data.points))
      .catch((err) => {
        const msg = errorMessage(err);
        if (msg) setError(msg);
      });
    return () => controller.abort();
  }, [symbol]);

  const loaded = points !== null;
  useEffect(() => {
    if (!loaded || !quote?.price) return;
    const t = quote.sourceTs || quote.receivedAt;
    setPoints((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.t >= t) return prev;
      return [...prev, { t, p: quote.price }].slice(-MAX_POINTS);
    });
  }, [quote, loaded]);

  const data = useMemo(
    () => ({
      labels: (points || []).map((p) => new Date(p.t).toLocaleTimeString("en-US")),
      datasets: [{ label: symbol, data: (points || []).map((p) => p.p), borderColor: SERIES[0], backgroundColor: "rgba(42, 120, 214, 0.08)", fill: true, ...lineStyle }],
    }),
    [points, symbol]
  );

  if (error) return <p className="order-error">{error}</p>;
  if (!points) return <p className="analytics-empty">Loading…</p>;
  return (
    <>
      {points.length < 2 ? (
        <p className="analytics-empty">
          Not enough price updates yet. This chart only plots prices received since the server started — historical candles are not available on
          the free market data plan.
        </p>
      ) : (
        <div style={{ height: 260 }}>
          <Line
            data={data}
            options={{
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${formatMoney(ctx.parsed.y)}` } } },
              scales: { x: axis({ grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } }), y: axis() },
            }}
          />
        </div>
      )}
      <p className="analytics-note">
        {quote?.status === "demo"
          ? "Sample data: these are fixed demo prices, not market data."
          : "Session prices received by the server (trades and quote snapshots). Not historical candles."}
      </p>
    </>
  );
}

function Fundamentals({ company }) {
  const [freq, setFreq] = useState("annual");
  const m = company?.metrics?.data;
  const isDemo = company?.provider === "demo";
  const series = m?.[freq] || {};
  const eps = series.eps || [];
  const fmtPeriod = freq === "annual" ? yearLabel : quarterLabel;
  const marginKeys = [
    { key: "grossMargin", label: "Gross margin" },
    { key: "operatingMargin", label: "Operating margin" },
    { key: "netMargin", label: "Net margin" },
  ].filter((k) => series[k.key]?.length);
  const marginPeriods = marginKeys.length ? series[marginKeys[0].key].map((p) => p.period) : [];
  const valueAt = (key, period) => series[key]?.find((p) => p.period === period)?.v ?? null;
  const pct = (v) => (v == null ? null : Math.round(v * 10000) / 100);

  const toggle = (
    <div className="segmented" role="group" aria-label="Reporting frequency">
      {["annual", "quarterly"].map((f) => (
        <button key={f} type="button" aria-pressed={freq === f} onClick={() => setFreq(f)}>
          {f === "annual" ? "Annual" : "Quarterly"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="stock-charts single">
      <ChartCard
        title="Earnings per share"
        note="Reported EPS from Finnhub basic financials."
        actions={toggle}
        empty={!eps.length && (isDemo ? NEEDS_KEY : "No EPS history available.")}
        height={200}
        table={{ columns: ["Period", "EPS"], rows: [...eps].reverse().map((p) => [fmtPeriod(p.period), formatMoney(p.v)]) }}
      >
        <Bar
          data={{ labels: eps.map((p) => fmtPeriod(p.period)), datasets: [{ label: "EPS", data: eps.map((p) => p.v), backgroundColor: SERIES[0], ...barStyle }] }}
          options={{
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` EPS ${formatMoney(ctx.parsed.y)}` } } },
            scales: { x: axis({ grid: { display: false } }), y: axis({ ticks: { callback: (v) => formatMoney(v) } }) },
          }}
        />
      </ChartCard>
      <ChartCard
        title="Profit margins"
        note="Gross, operating and net margin (% of revenue) — one shared percentage axis."
        empty={!marginKeys.length && (isDemo ? NEEDS_KEY : "No margin history available.")}
        height={200}
        table={{
          columns: ["Period", ...marginKeys.map((k) => k.label)],
          rows: [...marginPeriods].reverse().map((p) => [fmtPeriod(p), ...marginKeys.map((k) => formatPct(pct(valueAt(k.key, p))).replace("+", ""))]),
        }}
      >
        <LineChart
          labels={marginPeriods.map(fmtPeriod)}
          series={marginKeys.map((k, i) => ({ label: k.label, values: marginPeriods.map((p) => pct(valueAt(k.key, p))), color: SERIES[i] }))}
          format={(v) => `${Number(v).toFixed(0)}%`}
        />
      </ChartCard>
    </div>
  );
}

function News({ symbol }) {
  const { data, error, loading } = useApiData(`/market/news/${encodeURIComponent(symbol)}`);
  if (loading && !data) return <p className="analytics-empty">Loading news…</p>;
  if (error && !data) return <p className="order-error">{error}</p>;
  const items = data?.data || [];
  if (!items.length) {
    return <p className="analytics-empty">{data?.provider === "demo" ? NEEDS_KEY : "No company news in the last 7 days."}</p>;
  }
  return (
    <ul className="news-list">
      {items.map((n) => (
        <li key={n.id}>
          <a href={n.url} target="_blank" rel="noreferrer">
            {n.headline}
          </a>
          <p className="news-meta">
            {n.source} · {formatTime(n.datetime)}
          </p>
          {n.summary && <p className="news-summary">{n.summary}</p>}
        </li>
      ))}
    </ul>
  );
}

const AnalyticsWindow = ({ symbol: initialSymbol, onClose }) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [tab, setTab] = useState(0);
  const quote = useQuotes([symbol])[symbol];
  const company = useApiData(`/market/company/${encodeURIComponent(symbol)}`);
  const holdings = useApiData("/holdings");
  const holding = holdings.data?.items.find((h) => h.symbol === symbol);
  const profile = company.data?.profile?.data;
  const { openBuyWindow, openSellWindow, openAlertDialog } = useContext(GeneralContext);
  const act = (fn) => {
    onClose();
    fn(symbol);
  };

  const select = (s) => {
    setSymbol(s);
    setTab(0);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="analytics-title" scroll="paper">
      <DialogTitle id="analytics-title" sx={{ pr: 6, fontWeight: 400, pb: 0 }}>
        <div className="stock-head">
          {profile?.logo && <img src={profile.logo} alt="" className="stock-logo" />}
          <div>
            <div className="stock-name">
              {symbol}
              {profile?.name && profile.name !== symbol && <small>{profile.name}</small>}
            </div>
            <div className="stock-price">
              {formatMoney(quote?.price)}{" "}
              <small className={quote?.changePct < 0 ? "loss-text" : "profit"}>
                {formatSigned(quote?.change)} ({formatPct(quote?.changePct)})
              </small>{" "}
              <QuoteStatus quote={quote} />
            </div>
          </div>
        </div>
        <div className="stock-actions">
          <p className="analytics-meta">Last update {formatTime(quote?.sourceTs || quote?.receivedAt)}</p>
          <div>
            <button type="button" className="buy" onClick={() => act(openBuyWindow)}>
              Buy
            </button>
            <button type="button" className="sell" onClick={() => act(openSellWindow)}>
              Sell
            </button>
            <button type="button" className="action" onClick={() => act(openAlertDialog)}>
              Alert
            </button>
          </div>
        </div>
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
          <Close />
        </IconButton>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} aria-label="Stock detail sections" variant="scrollable" sx={{ minHeight: 40 }}>
          {["Overview", "Chart", "Fundamentals", "News"].map((t) => (
            <Tab key={t} label={t} sx={{ textTransform: "none", minHeight: 40, fontSize: "0.85rem" }} />
          ))}
        </Tabs>
      </DialogTitle>
      <DialogContent dividers>
        {company.error && !company.data && tab !== 1 && <p className="order-error">{company.error}</p>}
        {tab === 0 && (company.data ? <Overview quote={quote} company={company.data} holding={holding} onSelect={select} /> : !company.error && <p className="analytics-empty">Loading company data…</p>)}
        {tab === 1 && <SessionChart key={symbol} symbol={symbol} quote={quote} />}
        {tab === 2 && (company.data ? <Fundamentals company={company.data} /> : !company.error && <p className="analytics-empty">Loading…</p>)}
        {tab === 3 && <News symbol={symbol} />}
      </DialogContent>
    </Dialog>
  );
};

export default AnalyticsWindow;
