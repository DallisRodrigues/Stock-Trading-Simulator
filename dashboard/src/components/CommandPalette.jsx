import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@mui/material";
import { useNavigate } from "react-router-dom";

import api from "../api/client";
import GeneralContext from "./GeneralContext";
import { useAuth } from "../context/AuthContext";
import { useThemeMode } from "../context/ThemeContext";

const PAGES = [
  { label: "Dashboard", path: "/" },
  { label: "Orders", path: "/orders" },
  { label: "Holdings", path: "/holdings" },
  { label: "Positions", path: "/positions" },
  { label: "Funds", path: "/funds" },
  { label: "Analytics", path: "/analytics" },
  { label: "Alerts", path: "/alerts" },
];

import { PALETTE_SHORTCUT } from "./useCommandPalette";

export { PALETTE_SHORTCUT };

const CommandPalette = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { openAnalytics, openBuyWindow, openSellWindow, openAlertDialog } = useContext(GeneralContext);
  const { logout } = useAuth();
  const { mode, toggle } = useThemeMode();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ q: "", items: [] });
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .get("/market/search", { params: { q }, signal: controller.signal })
        .then((res) => setResults({ q, items: res.data.results.slice(0, 6) }))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const items = useMemo(() => {
    const lower = q.toLowerCase();
    const run = (fn) => () => {
      onClose();
      fn();
    };
    const out = [];
    const stocks = results.q === q ? results.items : [];
    const top = stocks[0];
    if (top) {
      out.push(
        { group: "Trade", label: `Buy ${top.symbol}`, hint: top.description, action: run(() => openBuyWindow(top.symbol)) },
        { group: "Trade", label: `Sell ${top.symbol}`, hint: top.description, action: run(() => openSellWindow(top.symbol)) },
        { group: "Trade", label: `Set price alert on ${top.symbol}`, action: run(() => openAlertDialog(top.symbol)) }
      );
    }
    stocks.forEach((s) => out.push({ group: "Stocks", label: s.symbol, hint: s.description, action: run(() => openAnalytics(s.symbol)) }));
    PAGES.filter((p) => !lower || p.label.toLowerCase().includes(lower)).forEach((p) =>
      out.push({ group: "Go to", label: p.label, action: run(() => navigate(p.path)) })
    );
    const actions = [
      { label: mode === "dark" ? "Switch to light theme" : "Switch to dark theme", action: run(toggle) },
      { label: "Log out", action: run(logout) },
    ];
    actions.filter((a) => !lower || a.label.toLowerCase().includes(lower)).forEach((a) => out.push({ group: "Actions", ...a }));
    return out;
  }, [q, results, mode, navigate, onClose, openAnalytics, openBuyWindow, openSellWindow, openAlertDialog, toggle, logout]);

  const safeIndex = Math.min(index, Math.max(0, items.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${safeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [safeIndex]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((safeIndex + 1) % Math.max(1, items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((safeIndex - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[safeIndex]?.action();
    }
  };

  let lastGroup = null;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { className: "palette" } }}>
      <input
        autoFocus
        className="palette-input"
        placeholder="Search stocks, pages and actions…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={items.length ? `palette-item-${safeIndex}` : undefined}
        aria-label="Command palette"
      />
      <ul id="palette-list" className="palette-list" role="listbox" ref={listRef}>
        {q && results.q !== q && <li className="palette-status">Searching stocks…</li>}
        {items.map((item, i) => {
          const header = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          return (
            <React.Fragment key={`${item.group}-${item.label}`}>
              {header && (
                <li className="palette-group" role="presentation">
                  {header}
                </li>
              )}
              <li
                id={`palette-item-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === safeIndex}
                className={i === safeIndex ? "selected" : ""}
                onMouseMove={() => i !== safeIndex && setIndex(i)}
                onClick={item.action}
              >
                <span>{item.label}</span>
                {item.hint && <small>{item.hint}</small>}
              </li>
            </React.Fragment>
          );
        })}
        {!items.length && <li className="palette-status">No matches.</li>}
      </ul>
      <p className="palette-footer">↑↓ to navigate · Enter to select · Esc to close</p>
    </Dialog>
  );
};

export default CommandPalette;
