import React, { useContext, useState } from "react";
import { Link } from "react-router-dom";

import api, { errorMessage } from "../api/client";
import GeneralContext from "./GeneralContext";
import { useApiData } from "../hooks/useApiData";
import { useNotify } from "../context/NotificationContext";
import { formatMoney, formatPrice, formatTime } from "../utils/format";
import PageSkeleton from "./PageSkeleton";

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function ordersToCsv(orders) {
  const header = ["Time (UTC)", "Side", "Type", "Symbol", "Qty", "Fill price (USD)", "Value (USD)", "Realized P&L (USD)", "Price source", "Note"];
  const rows = orders.map((o) => [
    new Date(o.filledAt || o.createdAt).toISOString(),
    o.side,
    o.type || "MARKET",
    o.symbol,
    o.qty,
    o.price,
    o.value,
    o.realizedPnl,
    o.priceSource,
    o.note || "",
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

function downloadCsv(orders) {
  const blob = new Blob([ordersToCsv(orders)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const TABS = [
  { key: "executed", label: "Executed" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Cancelled / expired" },
];

const SideBadge = ({ side }) => <span className={`side-badge ${side === "BUY" ? "side-buy" : "side-sell"}`}>{side}</span>;
const typeLabel = (o) => (o.type && o.type !== "MARKET" ? `${o.type === "LIMIT" ? "Limit" : "Stop"} @ ${formatPrice(o.triggerPrice)}` : "Market");

const NoteCell = ({ order, onSaved }) => {
  const notify = useNotify();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(order.note || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/orders/${order.id}/note`, { note: value.trim() });
      setEditing(false);
      onSaved();
    } catch (err) {
      notify(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button type="button" className="link-button note-button" onClick={() => setEditing(true)} aria-label={`${order.note ? "Edit" : "Add"} note for ${order.symbol} order`}>
        {order.note ? <span className="note-text">{order.note}</span> : "+ Note"}
      </button>
    );
  }
  return (
    <form
      className="note-edit"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input autoFocus maxLength={280} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Journal note" onKeyDown={(e) => e.key === "Escape" && setEditing(false)} />
      <button type="submit" className="link-button" disabled={saving}>
        Save
      </button>
    </form>
  );
};

const Orders = () => {
  const [tab, setTab] = useState("executed");
  const [side, setSide] = useState("ALL");
  const [symbol, setSymbol] = useState("ALL");
  const [cancelling, setCancelling] = useState(null);
  const [localVersion, setLocalVersion] = useState(0);
  const { portfolioVersion, portfolioChanged } = useContext(GeneralContext);
  const notify = useNotify();
  const version = portfolioVersion * 1000 + localVersion;
  const { data, error, loading } = useApiData(`/orders?status=${tab}`, version);
  const openCount = useApiData("/orders?status=open", version).data?.orders.length || 0;
  const allOrders = data?.orders || [];
  const symbols = [...new Set(allOrders.map((o) => o.symbol))].sort();
  const orders = allOrders.filter((o) => (side === "ALL" || o.side === side) && (symbol === "ALL" || o.symbol === symbol));

  const cancel = async (o) => {
    setCancelling(o.id);
    try {
      await api.delete(`/orders/${o.id}`);
      notify(`Cancelled ${typeLabel(o).toLowerCase()} ${o.side.toLowerCase()} ${o.symbol}`, "info");
      portfolioChanged();
    } catch (err) {
      notify(errorMessage(err), "error");
    } finally {
      setCancelling(null);
    }
  };

  const tabs = (
    <div className="segmented" role="tablist" aria-label="Order status">
      {TABS.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
          {t.label}
          {t.key === "open" && openCount > 0 ? ` (${openCount})` : ""}
        </button>
      ))}
    </div>
  );

  if (loading && !data) return <PageSkeleton label="Loading orders" />;
  if (error && !data) return <p className="page-status error">{error}</p>;

  if (!allOrders.length && tab === "executed" && !openCount) {
    return (
      <div className="orders">
        <div className="no-orders">
          <p>You haven't placed any orders yet</p>
          <Link to={"/"} className="btn">
            Get started
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="orders-toolbar">
        <h3 className="title">Orders ({orders.length})</h3>
        {tabs}
        <div className="segmented" role="group" aria-label="Filter by side">
          {["ALL", "BUY", "SELL"].map((s) => (
            <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)}>
              {s === "ALL" ? "All" : s === "BUY" ? "Buys" : "Sells"}
            </button>
          ))}
        </div>
        <select className="filter-select" aria-label="Filter by symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          <option value="ALL">All symbols</option>
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {tab === "executed" && (
          <button type="button" className="btn btn-grey" onClick={() => downloadCsv(orders)} disabled={!orders.length}>
            Export CSV
          </button>
        )}
      </div>

      <p className="chart-note orders-disclaimer">
        All orders are simulated against the server's latest quotes — nothing is sent to a broker or exchange.
      </p>

      {!orders.length && (
        <p className="page-status">
          {allOrders.length
            ? "No orders match these filters."
            : tab === "open"
              ? "No open orders. Choose Limit or Stop in the order window to place one."
              : tab === "closed"
                ? "No cancelled, expired or rejected orders."
                : "No executed orders yet."}
        </p>
      )}

      {orders.length > 0 && tab === "open" && (
        <div className="order-table orders-list">
          <table>
            <thead>
              <tr>
                <th>Placed</th>
                <th>Side</th>
                <th>Instrument</th>
                <th>Qty.</th>
                <th>Order</th>
                <th>Reserved</th>
                <th>Expires</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{formatTime(o.createdAt)}</td>
                  <td>
                    <SideBadge side={o.side} />
                  </td>
                  <td>{o.symbol}</td>
                  <td>{o.qty}</td>
                  <td>{typeLabel(o)}</td>
                  <td>{o.side === "BUY" ? formatMoney(o.reserved) : `${o.qty} sh`}</td>
                  <td>{o.validity === "GTC" ? `GTC · ${formatTime(o.expiresAt)}` : `Day · ${formatTime(o.expiresAt)}`}</td>
                  <td>
                    <button type="button" className="link-button danger" disabled={cancelling === o.id} onClick={() => cancel(o)} aria-label={`Cancel ${o.side} ${o.symbol} order`}>
                      {cancelling === o.id ? "Cancelling…" : "Cancel"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {orders.length > 0 && tab !== "open" && (
        <div className="order-table orders-list">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Side</th>
                <th>Instrument</th>
                <th>Qty.</th>
                <th>Order</th>
                {tab === "executed" ? (
                  <>
                    <th>Fill price</th>
                    <th>Value</th>
                    <th>Journal</th>
                  </>
                ) : (
                  <th>Status</th>
                )}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{formatTime(o.filledAt || o.createdAt)}</td>
                  <td>
                    <SideBadge side={o.side} />
                  </td>
                  <td>{o.symbol}</td>
                  <td>{o.qty}</td>
                  <td
                    title={
                      tab === "executed"
                        ? `Simulated fill priced from ${o.priceSource === "demo" ? "sample data" : `Finnhub (${o.priceSource})`}`
                        : undefined
                    }
                  >
                    {typeLabel(o)}
                    {tab === "executed" && o.priceSource === "demo" ? " · sample" : ""}
                  </td>
                  {tab === "executed" ? (
                    <>
                      <td>{formatPrice(o.price)}</td>
                      <td>{formatPrice(o.value)}</td>
                      <td className="note-cell">
                        <NoteCell order={o} onSaved={() => setLocalVersion((v) => v + 1)} />
                      </td>
                    </>
                  ) : (
                    <td title={o.statusReason || undefined}>
                      {o.status.charAt(0) + o.status.slice(1).toLowerCase()}
                      {o.statusReason ? ` — ${o.statusReason}` : ""}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default Orders;
