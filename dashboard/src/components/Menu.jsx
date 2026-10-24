import React, { useContext, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu as MuiMenu, MenuItem, Divider } from "@mui/material";
import { SearchOutlined } from "@mui/icons-material";

import { useAuth } from "../context/AuthContext";
import { useMarketData } from "../context/MarketDataContext";
import NotificationBell from "./NotificationBell";
import GeneralContext from "./GeneralContext";
import { PALETTE_SHORTCUT } from "./useCommandPalette";
import { useThemeMode } from "../context/ThemeContext";

const MENUS = [
  { to: "/", label: "Dashboard" },
  { to: "/orders", label: "Orders" },
  { to: "/holdings", label: "Holdings" },
  { to: "/positions", label: "Positions" },
  { to: "/funds", label: "Funds" },
  { to: "/analytics", label: "Analytics" },
  { to: "/alerts", label: "Alerts" },
];

const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "U";

const FeedStatus = () => {
  const { connection, marketStatus } = useMarketData();
  let label;
  let tone;
  let title;
  if (connection !== "connected") {
    label = connection === "connecting" ? "Connecting…" : "Reconnecting…";
    tone = "down";
    title = "Live updates are paused until the connection to the server is restored.";
  } else if (!marketStatus) {
    label = "Connecting…";
    tone = "neutral";
    title = "Waiting for market data status from the server.";
  } else if (marketStatus.provider === "demo") {
    label = "Sample data";
    tone = "demo";
    title = "No FINNHUB_API_KEY configured: prices are fixed sample values, not market data.";
  } else if (marketStatus?.marketState === "closed") {
    label = "Market closed";
    tone = "neutral";
    title = "US market is closed. Prices are the last available quotes.";
  } else if (marketStatus?.stream?.state === "open") {
    label = "Live";
    tone = "up";
    title = "Streaming real-time US trades from Finnhub.";
  } else {
    label = "Polling";
    tone = "neutral";
    title = "Trade stream unavailable; prices refresh from Finnhub REST quotes within free-plan limits.";
  }
  return (
    <span className={`feed-status quote-status-${tone}`} title={title} role="status">
      <span className="dot" aria-hidden="true" /> {label}
    </span>
  );
};

const Menu = () => {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [anchor, setAnchor] = useState(null);
  const { openPalette } = useContext(GeneralContext);
  const { mode, toggle } = useThemeMode();

  const isActive = (to) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <div className="menu-container">
      <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Zerodha clone logo" className="brand-logo" />
      <FeedStatus />
      <button type="button" className="palette-trigger" onClick={openPalette} aria-label="Open command palette">
        <SearchOutlined sx={{ fontSize: 16 }} aria-hidden="true" /> <kbd>{PALETTE_SHORTCUT}</kbd>
      </button>
      <div className="menus">
        <ul>
          {MENUS.map(({ to, label }) => (
            <li key={to}>
              <Link style={{ textDecoration: "none" }} to={to} aria-current={isActive(to) ? "page" : undefined}>
                <p className={isActive(to) ? "menu selected" : "menu"}>{label}</p>
              </Link>
            </li>
          ))}
        </ul>
        <hr />
        <NotificationBell />
        <button
          className="profile"
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor)}
          aria-label="Account menu"
        >
          <div className="avatar">{initials(user?.name)}</div>
          <p className="username">{user?.name}</p>
        </button>
        <MuiMenu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
          <MenuItem disabled sx={{ fontSize: "0.8rem", opacity: "1 !important" }}>
            {user?.email}
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              setAnchor(null);
              toggle();
            }}
          >
            {mode === "dark" ? "Light theme" : "Dark theme"}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setAnchor(null);
              logout();
            }}
          >
            Log out
          </MenuItem>
        </MuiMenu>
      </div>
    </div>
  );
};

export default Menu;
