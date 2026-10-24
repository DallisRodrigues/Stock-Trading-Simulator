import React from "react";
import { Link } from "react-router-dom";
import { useGuestDemo } from "../../hooks/useGuestDemo";

function Hero() {
  const demo = useGuestDemo();
  return (
    <div className="container p-4 p-md-5 mb-5">
      <div className="row text-center">
        <img src="/media/images/homeHero.png" alt="Trading platforms on desktop and mobile" className="mb-5" />
        <h1 className="mt-5">Invest in everything</h1>
        <p>Online platform to invest in stocks, derivatives, mutual funds, and more</p>
        <div className="hero-actions">
          <Link to="/signup" className="p-2 btn btn-primary fs-5 cta-button">
            Signup Now
          </Link>
          <button type="button" className="p-2 btn btn-outline-primary fs-5 cta-button" onClick={demo.start} disabled={demo.loading}>
            {demo.loading ? "Preparing demo…" : "Try the live demo"}
          </button>
        </div>
        <p className="text-muted small mt-3">No signup needed — the demo account comes with a sample portfolio and is deleted after 24 hours.</p>
        {demo.error && (
          <p className="text-danger small" role="alert">
            {demo.error}
          </p>
        )}
      </div>
    </div>
  );
}

export default Hero;
