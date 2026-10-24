import React from "react";
import { formatPct, formatPrice } from "../../utils/format";

const CAP = 3;
const isDark = () => typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
function tileColor(pct) {
  const base = isDark() ? [37, 41, 49] : [240, 240, 240];
  if (pct == null) return `rgb(${base.join(", ")})`;
  const t = Math.min(1, Math.abs(pct) / CAP);
  const [r, g, b] = pct >= 0 ? [72, 194, 55] : [223, 73, 73];
  const mix = (c, i) => Math.round(base[i] + (c - base[i]) * (0.15 + 0.85 * t));
  return `rgb(${mix(r, 0)}, ${mix(g, 1)}, ${mix(b, 2)})`;
}
const tileText = (pct) => (isDark() || (pct != null && Math.abs(pct) >= CAP * 0.55) ? "#fff" : "rgb(60, 60, 60)");

const Heatmap = ({ symbols, quotes, onSelect }) => (
  <div className="heatmap" role="list" aria-label="Watchlist heatmap">
    {symbols.map((s) => {
      const q = quotes[s];
      const pct = q?.changePct ?? null;
      return (
        <button
          type="button"
          role="listitem"
          key={s}
          className="heatmap-tile"
          style={{ background: tileColor(pct), color: tileText(pct) }}
          onClick={() => onSelect?.(s)}
          aria-label={`${s} ${formatPct(pct)}, price ${formatPrice(q?.price)}`}
        >
          <strong>{s}</strong>
          <span>{formatPct(pct)}</span>
          <small>{formatPrice(q?.price)}</small>
        </button>
      );
    })}
  </div>
);

export default Heatmap;
