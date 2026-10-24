import React, { useCallback, useContext, useEffect, useRef, useState } from "react";

import { Tooltip, Grow, Menu as MuiMenu, MenuItem } from "@mui/material";
import { BarChartOutlined, KeyboardArrowDown, KeyboardArrowUp, MoreHoriz, SettingsOutlined } from "@mui/icons-material";

import api, { errorMessage } from "../api/client";
import GeneralContext from "./GeneralContext";
import QuoteStatus from "./QuoteStatus";
import { SignedBar, pctFormat } from "./charts/Charts";
import ListNameDialog from "./ListNameDialog";
import { useMarketData, useQuotes } from "../context/MarketDataContext";
import { useNotify } from "../context/NotificationContext";
import { formatPct, formatPrice } from "../utils/format";

const ACTIVE_KEY = "watchlist.active";
const readActive = () => {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
};
const writeActive = (id) => {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {}
};

const WatchList = () => {
  const notify = useNotify();
  const { mergeQuotes } = useMarketData();
  const [state, setState] = useState({ lists: [], max: 50, maxLists: 5, loaded: false, error: "" });
  const [activeId, setActiveId] = useState(readActive);
  const [settingsAnchor, setSettingsAnchor] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dialog, setDialog] = useState(null);
  const active = state.lists.find((l) => l.id === activeId) || state.lists[0];
  const symbols = active?.symbols || [];
  const quotes = useQuotes(symbols);

  const applyResponse = useCallback(
    (data) => {
      mergeQuotes(data.quotes);
      setState({ lists: data.lists, max: data.max, maxLists: data.maxLists, loaded: true, error: "" });
    },
    [mergeQuotes]
  );

  useEffect(() => {
    const controller = new AbortController();
    api
      .get("/watchlists", { signal: controller.signal })
      .then((res) => applyResponse(res.data))
      .catch((err) => {
        const msg = errorMessage(err);
        if (msg) setState((w) => ({ ...w, loaded: true, error: msg }));
      });
    return () => controller.abort();
  }, [applyResponse]);

  const selectList = (id) => {
    setActiveId(id);
    writeActive(id);
  };

  const run = async (request, success, tone = "success") => {
    try {
      const res = await request();
      applyResponse(res.data);
      if (success) notify(success, tone);
      return res.data;
    } catch (err) {
      notify(errorMessage(err), "error");
      return null;
    }
  };

  const addSymbol = async (symbol) =>
    Boolean(await run(() => api.post(`/watchlists/${active.id}/symbols`, { symbol }), `${symbol} added to ${active.name}`));
  const removeSymbol = (symbol) =>
    run(() => api.delete(`/watchlists/${active.id}/symbols/${encodeURIComponent(symbol)}`), `${symbol} removed from ${active.name}`, "info");
  const reorder = (next) => {
    setState((s) => ({ ...s, lists: s.lists.map((l) => (l.id === active.id ? { ...l, symbols: next } : l)) }));
    return run(() => api.patch(`/watchlists/${active.id}`, { symbols: next }));
  };
  const move = (symbol, delta) => {
    const i = symbols.indexOf(symbol);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= symbols.length) return;
    const next = [...symbols];
    [next[i], next[j]] = [next[j], next[i]];
    reorder(next);
  };
  const createList = async (name) => {
    const data = await run(() => api.post("/watchlists", { name }), `Created “${name}”`);
    if (data) selectList(data.lists.at(-1).id);
    return Boolean(data);
  };
  const renameList = async (name) => Boolean(await run(() => api.patch(`/watchlists/${active.id}`, { name }), "Watchlist renamed"));
  const deleteList = async () => {
    const data = await run(() => api.delete(`/watchlists/${active.id}`), `Deleted “${active.name}”`, "info");
    if (data) selectList(data.lists[0].id);
    return Boolean(data);
  };
  const closeDialogAfter = (fn) => async (value) => {
    const ok = await fn(value);
    if (ok) setDialog(null);
    return ok;
  };

  const onDrop = (target) => {
    if (!dragging || dragging === target) return setDragging(null);
    const next = symbols.filter((s) => s !== dragging);
    next.splice(next.indexOf(target) + (symbols.indexOf(dragging) < symbols.indexOf(target) ? 1 : 0), 0, dragging);
    setDragging(null);
    reorder(next);
  };

  const withChange = symbols.filter((s) => quotes[s]?.changePct != null).sort((a, b) => quotes[b].changePct - quotes[a].changePct);

  return (
    <div className="watchlist-container">
      <SymbolSearch existing={symbols} onAdd={addSymbol} count={symbols.length} max={state.max} listName={active?.name} />

      {!state.loaded && <p className="page-status">Loading watchlist…</p>}
      {state.error && <p className="page-status error">{state.error}</p>}
      {state.loaded && !state.error && !symbols.length && (
        <p className="page-status">{active?.name || "This watchlist"} is empty. Search for a US stock above to add it.</p>
      )}

      <ul className="list" aria-label="Watchlist">
        {symbols.map((symbol, i) => (
          <WatchListItem
            key={symbol}
            symbol={symbol}
            quote={quotes[symbol]}
            onRemove={removeSymbol}
            onMove={(delta) => move(symbol, delta)}
            canMoveUp={i > 0}
            canMoveDown={i < symbols.length - 1}
            dragProps={{
              draggable: true,
              onDragStart: (e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragging(symbol);
              },
              onDragOver: (e) => e.preventDefault(),
              onDrop: (e) => {
                e.preventDefault();
                onDrop(symbol);
              },
              onDragEnd: () => setDragging(null),
              className: dragging === symbol ? "dragging-row" : undefined,
            }}
          />
        ))}
      </ul>

      {withChange.length > 0 && (
        <div className="watchlist-chart">
          <p className="watchlist-chart-title">Today's change</p>
          <div style={{ height: Math.max(120, withChange.length * 22) }}>
            <SignedBar labels={withChange} values={withChange.map((s) => quotes[s].changePct)} format={pctFormat} label="Day change" />
          </div>
        </div>
      )}

      {state.loaded && !state.error && (
        <div className="watchlist-tabs" role="tablist" aria-label="Watchlists">
          {state.lists.map((l, i) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={l.id === active?.id}
              title={l.name}
              className={l.id === active?.id ? "active" : ""}
              onClick={() => selectList(l.id)}
            >
              {i + 1}
            </button>
          ))}
          {state.lists.length < state.maxLists && (
            <button type="button" className="add-list" onClick={() => setDialog("create")} aria-label="New watchlist" title="New watchlist">
              +
            </button>
          )}
          <span className="watchlist-tabs-name">{active?.name}</span>
          <button type="button" className="settings-button" aria-label="Watchlist settings" onClick={(e) => setSettingsAnchor(e.currentTarget)}>
            <SettingsOutlined fontSize="small" />
          </button>
          <MuiMenu anchorEl={settingsAnchor} open={Boolean(settingsAnchor)} onClose={() => setSettingsAnchor(null)}>
            <MenuItem
              onClick={() => {
                setSettingsAnchor(null);
                setDialog("rename");
              }}
            >
              Rename “{active?.name}”
            </MenuItem>
            <MenuItem
              onClick={() => {
                setSettingsAnchor(null);
                setDialog("delete");
              }}
              disabled={state.lists.length <= 1}
            >
              Delete watchlist
            </MenuItem>
          </MuiMenu>
        </div>
      )}

      {dialog === "create" && (
        <ListNameDialog title="New watchlist" initial={`Watchlist ${state.lists.length + 1}`} confirmLabel="Create" onSubmit={closeDialogAfter(createList)} onClose={() => setDialog(null)} />
      )}
      {dialog === "rename" && (
        <ListNameDialog title="Rename watchlist" initial={active?.name} confirmLabel="Rename" onSubmit={closeDialogAfter(renameList)} onClose={() => setDialog(null)} />
      )}
      {dialog === "delete" && (
        <ListNameDialog
          title={`Delete “${active?.name}”?`}
          message="The list and its symbols will be removed. Your holdings and orders are not affected."
          confirmLabel="Delete"
          danger
          onSubmit={closeDialogAfter(deleteList)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
};

export default WatchList;

const SymbolSearch = ({ existing, onAdd, count, max, listName }) => {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState({ q: "", results: [], error: false });
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .get("/market/search", { params: { q }, signal: controller.signal })
        .then((res) => setSearch({ q, results: res.data.results, error: false }))
        .catch((err) => {
          if (errorMessage(err)) setSearch({ q, results: [], error: true });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const settled = search.q === q;
  const results = settled ? search.results : [];
  const state = !q ? "idle" : !settled ? "loading" : search.error ? "error" : "done";

  useEffect(() => {
    const onClick = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const add = async (symbol) => {
    if (await onAdd(symbol)) {
      setQuery("");
      setOpen(false);
    }
  };

  return (
    <div className="search-container" ref={boxRef}>
      <input
        type="search"
        name="search"
        id="search"
        placeholder="Search eg: aapl, microsoft, spy"
        className="search"
        autoComplete="off"
        aria-label={`Search US stocks to add to ${listName || "your watchlist"}`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && results[0] && !existing.includes(results[0].symbol)) add(results[0].symbol);
        }}
      />
      <span className="counts">
        {count} / {max}
      </span>
      {open && query.trim() && (
        <ul className="search-results" role="listbox" aria-label="Search results">
          {state === "loading" && <li className="search-info">Searching…</li>}
          {state === "error" && <li className="search-info">Search is unavailable right now.</li>}
          {state === "done" && !results.length && <li className="search-info">No US stocks match “{query.trim()}”.</li>}
          {results.map((r) => {
            const added = existing.includes(r.symbol);
            return (
              <li key={r.symbol} role="option" aria-selected="false">
                <button type="button" className="search-result" disabled={added} onClick={() => add(r.symbol)}>
                  <strong>{r.symbol}</strong>
                  <span>{r.description}</span>
                  <em>{added ? "Added" : "+ Add"}</em>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const WatchListItem = ({ symbol, quote, onRemove, onMove, canMoveUp, canMoveDown, dragProps = {} }) => {
  const { openBuyWindow, openSellWindow, openAnalytics } = useContext(GeneralContext);
  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    const action = { b: openBuyWindow, s: openSellWindow, a: openAnalytics }[e.key.toLowerCase()];
    if (action) {
      e.preventDefault();
      action(symbol);
    }
  };
  const isDown = quote?.changePct != null ? quote.changePct < 0 : false;
  const hasChange = quote?.changePct != null;

  return (
    <li {...dragProps} tabIndex={0} onKeyDown={onKeyDown} aria-label={`${symbol} ${quote?.price ? formatPrice(quote.price) : "price unavailable"}`}>
      <div className="item">
        <p className={hasChange ? (isDown ? "down" : "up") : ""}>{symbol}</p>
        <div className="item-info">
          <QuoteStatus quote={quote} hide={["live", "demo"]} />
          <span className="percent">{formatPct(quote?.changePct)}</span>
          {hasChange && (isDown ? <KeyboardArrowDown className="down" /> : <KeyboardArrowUp className="up" />)}
          <span className={`price ${hasChange ? (isDown ? "down" : "up") : ""}`}>{formatPrice(quote?.price)}</span>
        </div>
      </div>
      <WatchListActions symbol={symbol} onRemove={onRemove} onMove={onMove} canMoveUp={canMoveUp} canMoveDown={canMoveDown} />
    </li>
  );
};

const tooltipProps = { placement: "top", arrow: true, slots: { transition: Grow } };

const WatchListActions = ({ symbol, onRemove, onMove, canMoveUp, canMoveDown }) => {
  const { openBuyWindow, openSellWindow, openAnalytics, openAlertDialog } = useContext(GeneralContext);
  const [menuAnchor, setMenuAnchor] = useState(null);

  return (
    <span className="actions">
      <span>
        <Tooltip title="Buy (B)" {...tooltipProps}>
          <button className="buy" onClick={() => openBuyWindow(symbol)} aria-label={`Buy ${symbol}`}>
            Buy
          </button>
        </Tooltip>
        <Tooltip title="Sell (S)" {...tooltipProps}>
          <button className="sell" onClick={() => openSellWindow(symbol)} aria-label={`Sell ${symbol}`}>
            Sell
          </button>
        </Tooltip>
        <Tooltip title="Analytics (A)" {...tooltipProps}>
          <button className="action" onClick={() => openAnalytics(symbol)} aria-label={`Analytics for ${symbol}`}>
            <BarChartOutlined className="icon" />
          </button>
        </Tooltip>
        <Tooltip title="More" {...tooltipProps}>
          <button className="action" onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label={`More actions for ${symbol}`}>
            <MoreHoriz className="icon" />
          </button>
        </Tooltip>
        <MuiMenu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              openAlertDialog(symbol);
            }}
          >
            Create price alert
          </MenuItem>
          <MenuItem
            disabled={!canMoveUp}
            onClick={() => {
              setMenuAnchor(null);
              onMove(-1);
            }}
          >
            Move up
          </MenuItem>
          <MenuItem
            disabled={!canMoveDown}
            onClick={() => {
              setMenuAnchor(null);
              onMove(1);
            }}
          >
            Move down
          </MenuItem>
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onRemove(symbol);
            }}
          >
            Remove from watchlist
          </MenuItem>
        </MuiMenu>
      </span>
    </span>
  );
};
