import React, { useState } from "react";
import { useGuestDemo } from "../hooks/useGuestDemo";
import { Link, NavLink } from "react-router-dom";

const LINKS = [
  { to: "/signup", label: "Signup" },
  { to: "/about", label: "About" },
  { to: "/product", label: "Products" },
  { to: "/pricing", label: "Pricing" },
  { to: "/support", label: "Support" },
  { to: "/login", label: "Login" },
];

function Navbar() {
  const [open, setOpen] = useState(false);
  const demo = useGuestDemo();

  return (
    <nav className="navbar navbar-expand-lg border-bottom sticky-top" style={{ backgroundColor: "#fff" }}>
      <div className="container p-2">
        <Link className="navbar-brand" to="/" onClick={() => setOpen(false)}>
          <img src="/media/images/logo.svg" style={{ width: "25%", minWidth: "110px" }} alt="Zerodha clone home" />
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          aria-controls="mainNav"
          aria-expanded={open}
          aria-label="Toggle navigation"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className={`collapse navbar-collapse${open ? " show" : ""}`} id="mainNav">
          <ul className="navbar-nav ms-auto mb-2 mb-lg-0">
            {LINKS.map(({ to, label }) => (
              <li className="nav-item" key={to}>
                <NavLink className="nav-link" to={to} onClick={() => setOpen(false)}>
                  {label}
                </NavLink>
              </li>
            ))}
            <li className="nav-item">
              <button type="button" className="btn btn-sm btn-primary nav-demo" onClick={demo.start} disabled={demo.loading} title={demo.error || undefined}>
                {demo.loading ? "Starting…" : "Try demo"}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
