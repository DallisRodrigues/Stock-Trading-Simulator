import React, { useContext, useState } from "react";

import api, { errorMessage } from "../api/client";
import GeneralContext from "./GeneralContext";
import { useApiData } from "../hooks/useApiData";
import { useQuotes } from "../context/MarketDataContext";
import { useNotify } from "../context/NotificationContext";
import { formatPct, formatPrice, formatTime } from "../utils/format";
import PageSkeleton from "./PageSkeleton";

const Alerts = () => {
  const { portfolioVersion, openAlertDialog } = useContext(GeneralContext);
  const notify = useNotify();
  const [localVersion, setLocalVersion] = useState(0);
  const [symbol, setSymbol] = useState("");
  const { data, error, loading } = useApiData("/alerts", portfolioVersion * 1000 + localVersion);
  const alerts = data?.alerts || [];
  const active = alerts.filter((a) => a.status === "ACTIVE");
  const triggered = alerts.filter((a) => a.status === "TRIGGERED");
  const quotes = useQuotes(active.map((a) => a.symbol));

  const remove = async (a) => {
    try {
      await api.delete(`/alerts/${a.id}`);
      notify(`Removed ${a.symbol} alert`, "info");
      setLocalVersion((v) => v + 1);
    } catch (err) {
      notify(errorMessage(err), "error");
    }
  };

  const create = (e) => {
    e.preventDefault();
    const s = symbol.trim().toUpperCase();
    if (s) openAlertDialog(s);
    setSymbol("");
  };

  if (loading && !data) return <PageSkeleton label="Loading alerts" />;
  if (error && !data) return <p className="page-status error">{error}</p>;

  return (
    <>
      <div className="orders-toolbar">
        <h3 className="title">Price alerts ({active.length})</h3>
        <form className="inline-form" onSubmit={create}>
          <input className="filter-input" placeholder="Symbol, e.g. AAPL" aria-label="Symbol for new alert" value={symbol} onChange={(e) => setSymbol(e.target.value)} maxLength={10} />
          <button type="submit" className="btn btn-blue" disabled={!symbol.trim()}>
            New alert
          </button>
        </form>
      </div>
      <p className="chart-note">Alerts are checked on the server against live prices, fire once, and arrive in your notifications (bell icon).</p>

      {!active.length ? (
        <p className="page-status">No active alerts. Create one here, from a watchlist row's “More” menu, or from a stock's detail window.</p>
      ) : (
        <div className="order-table orders-list">
          <table>
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Condition</th>
                <th>Now</th>
                <th>Day chg.</th>
                <th>Note</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {active.map((a) => (
                <tr key={a.id}>
                  <td>{a.symbol}</td>
                  <td>Notify when {a.description}</td>
                  <td>{formatPrice(quotes[a.symbol]?.price)}</td>
                  <td>{formatPct(quotes[a.symbol]?.changePct)}</td>
                  <td>{a.note || "—"}</td>
                  <td>{formatTime(a.createdAt)}</td>
                  <td>
                    <button type="button" className="link-button danger" onClick={() => remove(a)} aria-label={`Delete ${a.symbol} alert`}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {triggered.length > 0 && (
        <>
          <h4 className="subtitle">Triggered</h4>
          <div className="order-table orders-list">
            <table>
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Condition</th>
                  <th>Price at trigger</th>
                  <th>Triggered</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {triggered.map((a) => (
                  <tr key={a.id}>
                    <td>{a.symbol}</td>
                    <td>{a.description}</td>
                    <td>{formatPrice(a.triggerPrice)}</td>
                    <td>{formatTime(a.triggeredAt)}</td>
                    <td>
                      <button type="button" className="link-button" onClick={() => remove(a)} aria-label={`Clear ${a.symbol} alert`}>
                        Clear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};

export default Alerts;
