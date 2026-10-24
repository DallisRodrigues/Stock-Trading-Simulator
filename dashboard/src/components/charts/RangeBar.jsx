import React from "react";
import { formatPrice } from "../../utils/format";

const RangeBar = ({ label, low, high, current, ticks = [] }) => {
  const valid = low != null && high != null && high > low;
  const pos = (v) => `${Math.min(100, Math.max(0, ((v - low) / (high - low)) * 100))}%`;

  return (
    <div className="range-bar">
      <div className="range-bar-label">
        <span>{label}</span>
        {valid && current != null && <span className="range-bar-pos">{Math.round(((current - low) / (high - low)) * 100)}% of range</span>}
      </div>
      {valid ? (
        <>
          <div className="range-bar-track" role="img" aria-label={`${label}: low ${formatPrice(low)}, high ${formatPrice(high)}, current ${formatPrice(current)}`}>
            {ticks
              .filter((t) => t.value != null && t.value >= low && t.value <= high)
              .map((t) => (
                <span key={t.label} className="range-bar-tick" style={{ left: pos(t.value) }} title={`${t.label} ${formatPrice(t.value)}`} />
              ))}
            {current != null && <span className="range-bar-marker" style={{ left: pos(current) }} />}
          </div>
          <div className="range-bar-ends">
            <span>{formatPrice(low)}</span>
            <span>{formatPrice(high)}</span>
          </div>
        </>
      ) : (
        <p className="chart-empty small">Not available</p>
      )}
    </div>
  );
};

export default RangeBar;
