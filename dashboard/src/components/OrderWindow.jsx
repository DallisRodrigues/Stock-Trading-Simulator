import React, { useContext, useEffect, useRef, useState } from "react";

import api, { errorMessage, newClientOrderId } from "../api/client";
import GeneralContext from "./GeneralContext";
import QuoteStatus from "./QuoteStatus";
import { useQuotes } from "../context/MarketDataContext";
import { useNotify } from "../context/NotificationContext";
import { formatMoney, formatPrice } from "../utils/format";

import "./OrderWindow.css";

const TYPES = [
  { key: "MARKET", label: "Market" },
  { key: "LIMIT", label: "Limit" },
  { key: "STOP", label: "Stop" },
];
const STOP_BUY_BUFFER = 1.05;

const HINTS = {
  MARKET: { BUY: "Fills now at the latest price.", SELL: "Fills now at the latest price." },
  LIMIT: { BUY: "Fills when the price drops to your limit or lower.", SELL: "Fills when the price rises to your limit or higher." },
  STOP: { BUY: "Buys once the price rises to the trigger (breakout).", SELL: "Sells once the price falls to the trigger (stop-loss)." },
};

const OrderWindow = ({ symbol, side }) => {
  const { closeOrderWindow, portfolioChanged } = useContext(GeneralContext);
  const notify = useNotify();
  const quote = useQuotes([symbol])[symbol];
  const [type, setType] = useState("MARKET");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [validity, setValidity] = useState("DAY");
  const [note, setNote] = useState("");
  const [account, setAccount] = useState({ cash: null, held: null });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const clientOrderId = useRef(newClientOrderId());
  const qtyInput = useRef(null);
  const isBuy = side === "BUY";
  const isMarket = type === "MARKET";

  useEffect(() => {
    qtyInput.current?.focus();
    const controller = new AbortController();
    Promise.all([api.get("/funds", { signal: controller.signal }), api.get("/holdings", { signal: controller.signal })])
      .then(([funds, holdings]) => {
        const h = holdings.data.items.find((i) => i.symbol === symbol);
        setAccount({ cash: funds.data.cash, held: h ? h.qty - (h.reservedQty || 0) : 0 });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [symbol]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !submitting && closeOrderWindow();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeOrderWindow, submitting]);

  const chooseType = (t) => {
    setType(t);
    setError("");
    if (t !== "MARKET" && !price && quote?.price) setPrice(quote.price.toFixed(2));
  };

  const qtyNum = Number(qty);
  const priceNum = Number(price);
  const validQty = Number.isInteger(qtyNum) && qtyNum >= 1 && qtyNum <= 100000;
  const validPrice = isMarket || (priceNum > 0 && /^\d+(\.\d{1,2})?$/.test(price.trim()));
  const marketPrice = quote?.status !== "unavailable" ? quote?.price : null;
  const refPrice = isMarket ? marketPrice : priceNum;
  const estValue = validQty && refPrice ? qtyNum * refPrice : null;
  const reserve = isBuy && !isMarket && estValue ? estValue * (type === "STOP" ? STOP_BUY_BUFFER : 1) : null;

  let validation = "";
  if (!validQty) validation = "Enter a whole number of shares (1 – 100,000).";
  else if (!validPrice) validation = `Enter a ${type === "LIMIT" ? "limit" : "trigger"} price with at most 2 decimals.`;
  else if (isBuy && account.cash != null && (reserve ?? estValue) > account.cash)
    validation = isMarket ? "Estimated cost exceeds your available cash." : "Not enough available cash to reserve for this order.";
  else if (!isBuy && account.held != null && qtyNum > account.held) validation = `You have ${account.held} unreserved share(s) of ${symbol}.`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || validation) return;
    setSubmitting(true);
    setError("");
    try {
      const body = { symbol, side, type, qty: qtyNum, clientOrderId: clientOrderId.current };
      if (!isMarket) Object.assign(body, { price: priceNum, validity });
      if (note.trim()) body.note = note.trim();
      const res = await api.post("/orders", body);
      const o = res.data.order;
      if (o.status === "OPEN") {
        notify(`${o.type === "LIMIT" ? "Limit" : "Stop"} ${o.side === "BUY" ? "buy" : "sell"} placed: ${o.qty} ${o.symbol} @ ${formatMoney(o.triggerPrice)}`, "info");
      } else {
        notify(`${o.side === "BUY" ? "Bought" : "Sold"} ${o.qty} ${o.symbol} at ${formatMoney(o.price)} (simulated)`);
      }
      portfolioChanged();
      closeOrderWindow();
    } catch (err) {
      setError(errorMessage(err, "The order could not be placed."));
      if (err.response && err.response.status < 500) clientOrderId.current = newClientOrderId();
      setSubmitting(false);
    }
  };

  return (
    <div className="container order-window" role="dialog" aria-modal="false" aria-labelledby="order-window-title">
      <form onSubmit={handleSubmit} noValidate>
        <div className={`header ${isBuy ? "" : "header-sell"}`}>
          <h3 id="order-window-title">
            {isBuy ? "Buy" : "Sell"} {symbol} <span>× {validQty ? qtyNum : "—"}</span>
          </h3>
          <div className="market-options">
            {formatMoney(marketPrice)} · simulated · <QuoteStatus quote={quote} inverse />
          </div>
        </div>

        <div className="tab" role="tablist" aria-label="Order type">
          {TYPES.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={type === t.key} className={type === t.key ? "active" : ""} onClick={() => chooseType(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="regular-order">
          <div className="inputs">
            <fieldset>
              <legend>Qty.</legend>
              <input
                ref={qtyInput}
                type="number"
                name="qty"
                id="qty"
                min="1"
                step="1"
                inputMode="numeric"
                aria-label="Quantity"
                onChange={(e) => setQty(e.target.value)}
                value={qty}
              />
            </fieldset>
            <fieldset className={isMarket ? "" : "enabled"}>
              <legend>{type === "STOP" ? "Trigger" : "Price"}</legend>
              {isMarket ? (
                <input type="text" name="price" id="price" aria-label="Market price" value={marketPrice ? formatPrice(marketPrice) : "—"} disabled />
              ) : (
                <input
                  type="text"
                  name="price"
                  id="price"
                  inputMode="decimal"
                  aria-label={type === "STOP" ? "Trigger price" : "Limit price"}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              )}
            </fieldset>
          </div>
          {!isMarket && (
            <div className="order-validity" role="radiogroup" aria-label="Validity">
              {[
                ["DAY", "Day", "until today's 4 pm ET close"],
                ["GTC", "GTC", "good till cancelled (90 days)"],
              ].map(([v, label, hint]) => (
                <label key={v}>
                  <input type="radio" name="validity" value={v} checked={validity === v} onChange={() => setValidity(v)} /> {label} <span>{hint}</span>
                </label>
              ))}
            </div>
          )}
          <p className="order-hint">{HINTS[type][side]}</p>
          <input
            className="order-note"
            type="text"
            maxLength={280}
            placeholder="Journal note (optional) — why are you placing this trade?"
            aria-label="Journal note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {(error || validation) && (
            <p className="order-error" role="alert">
              {error || validation}
            </p>
          )}
        </div>

        <div className="buttons">
          <span>
            {isMarket ? "Est." : "Value at price"} {formatMoney(estValue)}
            {reserve != null && ` · Reserves ${formatMoney(reserve)}`}
            {" · "}
            {isBuy ? `Available ${formatMoney(account.cash)}` : `Available ${account.held ?? "—"} sh`}
          </span>
          <div>
            <button type="submit" className={`btn ${isBuy ? "btn-blue" : "btn-orange"}`} disabled={submitting || Boolean(validation) || !marketPrice}>
              {submitting ? "Placing…" : isMarket ? (isBuy ? "Buy" : "Sell") : `Place ${type === "LIMIT" ? "limit" : "stop"} ${isBuy ? "buy" : "sell"}`}
            </button>
            <button type="button" className="btn btn-grey" onClick={closeOrderWindow} disabled={submitting}>
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default OrderWindow;
