import React, { useId, useState } from "react";

const ChartCard = ({ title, note, table, empty, children, actions, className = "", height = 240 }) => {
  const [view, setView] = useState("chart");
  const id = useId();
  const hasTable = table && table.rows.length > 0;

  return (
    <section className={`chart-card ${className}`} aria-labelledby={`${id}-title`}>
      <header className="chart-card-header">
        <h4 id={`${id}-title`}>{title}</h4>
        <div className="chart-card-actions">
          {actions}
          {hasTable && !empty && (
            <div className="segmented" role="group" aria-label={`${title} view`}>
              <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>
                Chart
              </button>
              <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>
                Table
              </button>
            </div>
          )}
        </div>
      </header>
      {empty ? (
        <p className="chart-empty">{empty}</p>
      ) : view === "table" && hasTable ? (
        <div className="chart-table order-table">
          <table>
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-body" style={{ height }}>
          {children}
        </div>
      )}
      {note && <p className="chart-note">{note}</p>}
    </section>
  );
};

export default ChartCard;
