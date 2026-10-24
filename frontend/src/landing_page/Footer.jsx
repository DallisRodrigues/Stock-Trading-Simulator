import React from "react";
import { Link } from "react-router-dom";

const COLUMNS = [
  {
    title: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/product", label: "Products" },
      { to: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Support",
    links: [
      { to: "/support", label: "Support portal" },
      { to: "/pricing", label: "List of charges" },
    ],
  },
  {
    title: "Account",
    links: [
      { to: "/signup", label: "Open an account" },
      { to: "/login", label: "Login" },
    ],
  },
];

const YEAR = new Date().getFullYear();

function Footer() {
  return (
    <footer style={{ backgroundColor: "rgb(250, 250, 250)" }}>
      <div className="container border-top mt-5">
        <div className="row mt-5">
          <div className="col-12 col-md">
            <img src="/media/images/logo.svg" style={{ width: "50%" }} alt="Zerodha clone logo" />
            <p className="mt-3">&copy; {YEAR} Zerodha clone — a portfolio project. Not affiliated with Zerodha Broking Ltd.</p>
          </div>
          {COLUMNS.map((col) => (
            <div className="col-6 col-md footer-links" key={col.title}>
              <p>{col.title}</p>
              {col.links.map((l) => (
                <React.Fragment key={l.label}>
                  <Link to={l.to}>{l.label}</Link>
                  <br />
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-5 text-muted pb-4" style={{ fontSize: "14px" }}>
          <p>
            This website is an educational clone of the Zerodha landing page built with the MERN stack. The trading dashboard is a paper-trading
            simulator: funds are virtual, orders are simulated and never sent to any exchange or broker.
          </p>
          <p>
            Market data for US-listed stocks is provided by Finnhub on its free plan for personal, non-commercial use. When no API key is
            configured, the dashboard shows clearly labelled sample prices instead.
          </p>
          <p>Investments in securities markets are subject to market risks. Nothing on this site is investment advice.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
