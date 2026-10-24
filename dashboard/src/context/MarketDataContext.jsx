import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_URL } from "../config";

const MarketDataContext = createContext(null);
const USER_EVENTS = ["notification", "portfolio:changed"];

export function MarketDataProvider({ children, socketFactory = io }) {
  const [quotes, setQuotes] = useState({});
  const [connection, setConnection] = useState("connecting");
  const [marketStatus, setMarketStatus] = useState(null);
  const socketRef = useRef(null);
  const refCounts = useRef(new Map());
  const syncTimer = useRef(null);
  const eventHandlers = useRef(new Map());

  const mergeQuotes = useCallback((incoming) => {
    if (!incoming) return;
    const entries = Object.values(incoming).filter((q) => q?.symbol);
    if (!entries.length) return;
    setQuotes((prev) => {
      const next = { ...prev };
      for (const q of entries) next[q.symbol] = q;
      return next;
    });
  }, []);

  const syncSubscriptions = useCallback(() => {
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("quotes:subscribe", [...refCounts.current.keys()], (res) => mergeQuotes(res?.quotes));
    }, 50);
  }, [mergeQuotes]);

  useEffect(() => {
    const socket = socketFactory(API_URL || undefined, { withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const onConnect = () => {
      setConnection("connected");
      syncSubscriptions();
    };
    const onDisconnect = () => setConnection("disconnected");
    const onError = () => setConnection("disconnected");
    const onQuote = (q) => q?.symbol && setQuotes((prev) => ({ ...prev, [q.symbol]: q }));

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);
    socket.on("quote", onQuote);
    socket.on("market:status", setMarketStatus);
    const forwarders = USER_EVENTS.map((ev) => {
      const fn = (payload) => eventHandlers.current.get(ev)?.forEach((h) => h(payload));
      socket.on(ev, fn);
      return [ev, fn];
    });

    return () => {
      clearTimeout(syncTimer.current);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError);
      socket.off("quote", onQuote);
      socket.off("market:status", setMarketStatus);
      forwarders.forEach(([ev, fn]) => socket.off(ev, fn));
      socket.disconnect();
      socketRef.current = null;
    };
  }, [socketFactory, syncSubscriptions]);

  const subscribe = useCallback(
    (symbols) => {
      for (const s of symbols) refCounts.current.set(s, (refCounts.current.get(s) || 0) + 1);
      syncSubscriptions();
      return () => {
        for (const s of symbols) {
          const n = (refCounts.current.get(s) || 0) - 1;
          if (n <= 0) refCounts.current.delete(s);
          else refCounts.current.set(s, n);
        }
        syncSubscriptions();
      };
    },
    [syncSubscriptions]
  );

  const onEvent = useCallback((event, handler) => {
    const set = eventHandlers.current.get(event) || new Set();
    set.add(handler);
    eventHandlers.current.set(event, set);
    return () => set.delete(handler);
  }, []);

  const value = useMemo(
    () => ({ quotes, connection, marketStatus, subscribe, mergeQuotes, onEvent }),
    [quotes, connection, marketStatus, subscribe, mergeQuotes, onEvent]
  );
  return <MarketDataContext.Provider value={value}>{children}</MarketDataContext.Provider>;
}

export const useMarketData = () => useContext(MarketDataContext);

export function useQuotes(symbols) {
  const { quotes, subscribe } = useMarketData();
  const key = [...new Set(symbols)].sort().join(",");
  useEffect(() => {
    if (!key) return undefined;
    return subscribe(key.split(","));
  }, [key, subscribe]);
  return quotes;
}
