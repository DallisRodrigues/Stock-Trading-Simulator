import React from "react";
import { Link } from "react-router-dom";

const PARTNERS = [
  { logo: "smallcaseLogo.png", name: "smallcase", text: "Thematic investment platform", url: "https://www.smallcase.com/" },
  { logo: "streakLogo.png", name: "Streak", text: "Algo & strategy platform", url: "https://www.streak.tech/" },
  { logo: "sensibullLogo.svg", name: "Sensibull", text: "Options trading platform", url: "https://sensibull.com/" },
  { logo: "zerodhaFundhouse.png", name: "Zerodha Fund House", text: "Asset management", url: "https://www.zerodhafundhouse.com/" },
  { logo: "goldenpiLogo.png", name: "GoldenPi", text: "Bonds trading platform", url: "https://www.goldenpi.com/" },
  { logo: "dittoLogo.png", name: "Ditto", text: "Insurance", url: "https://joinditto.in/" },
];

function Universe() {
  return (
    <div className="container mt-5">
      <div className="row text-center">
        <h1>The Zerodha Universe</h1>
        <p>Extend your trading and investment experience even further with our partner platforms</p>

        {PARTNERS.map((p) => (
          <div className="col-12 col-md-4 p-3 mt-5" key={p.name}>
            <a href={p.url} target="_blank" rel="noreferrer">
              <img src={`/media/images/${p.logo}`} alt={p.name} className="universe-logo" />
            </a>
            <p className="text-small text-muted mt-3">{p.text}</p>
          </div>
        ))}
        <Link to="/signup" className="p-2 btn btn-primary fs-5 mb-5 mt-5 cta-button">
          Signup Now
        </Link>
      </div>
    </div>
  );
}

export default Universe;
