const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const plain = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

export const formatMoney = (n) => (n == null || Number.isNaN(n) ? "—" : usd.format(n));
export const formatPrice = (n) => (n == null || Number.isNaN(n) ? "—" : plain.format(n));
export const formatCompact = (n) => (n == null || Number.isNaN(n) ? "—" : compact.format(n));
export const formatSigned = (n) => (n == null || Number.isNaN(n) ? "—" : `${n > 0 ? "+" : ""}${plain.format(n)}`);
export const formatPct = (n) => (n == null || Number.isNaN(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);

export function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

export const QUOTE_STATUS = {
  live: { label: "Live", tone: "up", title: "Streaming real-time trades from Finnhub" },
  snapshot: { label: "Snapshot", tone: "neutral", title: "Latest REST quote (polled, not streaming)" },
  closed: { label: "Market closed", tone: "neutral", title: "US market is closed; showing the last available price" },
  stale: { label: "Stale", tone: "down", title: "This price has not been refreshed recently" },
  demo: { label: "Sample data", tone: "demo", title: "Fixed sample prices — not real market data" },
  unavailable: { label: "Unavailable", tone: "down", title: "No price is available for this symbol" },
};
