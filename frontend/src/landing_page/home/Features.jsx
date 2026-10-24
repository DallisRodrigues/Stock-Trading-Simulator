import React from "react";

const FEATURES = [
  {
    icon: "fa-bolt",
    title: "Live US market data",
    text: "Real-time trades streamed from Finnhub over WebSockets, with honest labels for live, delayed, closed and sample prices.",
  },
  {
    icon: "fa-sliders",
    title: "Market, limit & stop orders",
    text: "A server-side matching engine fills limit and stop-loss orders when prices cross your level, with reserved cash and shares.",
  },
  {
    icon: "fa-chart-pie",
    title: "Portfolio analytics",
    text: "Allocation, sector exposure, P&L, beta, time-weighted performance vs the S&P 500 and company fundamentals.",
  },
  {
    icon: "fa-bell",
    title: "Alerts & notifications",
    text: "Price and percent-move alerts checked on the server, delivered instantly to your dashboard.",
  },
];

function Features() {
  return (
    <div className="container py-5">
      <div className="row text-center mb-4">
        <h2 className="fs-2">Practice trading with real market data</h2>
        <p className="text-muted">A full-stack paper-trading simulator: virtual money, real prices, nothing sent to an exchange.</p>
      </div>
      <div className="row g-4">
        {FEATURES.map((f) => (
          <div className="col-12 col-md-6 col-lg-3" key={f.title}>
            <div className="feature-card h-100">
              <i className={`fa-solid ${f.icon}`} aria-hidden="true"></i>
              <h3 className="fs-5 mt-3">{f.title}</h3>
              <p className="text-muted small mb-0">{f.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Features;
