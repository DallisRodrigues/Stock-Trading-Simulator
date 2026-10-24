const STREAM_URL = "wss://ws.finnhub.io";

function createFinnhubStream({
  apiKey,
  WebSocketImpl = globalThis.WebSocket,
  maxSymbols = 50,
  onTrades,
  onStatus = () => {},
  logger = console,
  random = Math.random,
  timers = { setTimeout, clearTimeout },
  now = Date.now,
  baseDelayMs = 1000,
  maxDelayMs = 60_000,
  idleTimeoutMs = 90_000,
}) {
  let ws = null;
  let stopped = true;
  let attempts = 0;
  let reconnectTimer = null;
  let idleTimer = null;
  const wanted = new Set();
  const subscribed = new Set();
  const status = { state: "idle", lastMessageAt: null, lastError: null, reconnectAttempts: 0, subscribedCount: 0 };

  const setState = (state, extra = {}) => {
    Object.assign(status, { state, ...extra, reconnectAttempts: attempts, subscribedCount: subscribed.size });
    onStatus({ ...status });
  };

  const send = (msg) => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  };

  const syncSubscriptions = () => {
    if (!ws || ws.readyState !== 1) return;
    for (const s of [...subscribed]) {
      if (!wanted.has(s)) {
        send({ type: "unsubscribe", symbol: s });
        subscribed.delete(s);
      }
    }
    for (const s of wanted) {
      if (!subscribed.has(s)) {
        send({ type: "subscribe", symbol: s });
        subscribed.add(s);
      }
    }
    status.subscribedCount = subscribed.size;
  };

  const armIdleTimer = () => {
    if (idleTimer) timers.clearTimeout(idleTimer);
    idleTimer = timers.setTimeout(() => {
      logger.warn("[market] stream idle; forcing reconnect");
      try {
        ws?.close();
      } catch {}
    }, idleTimeoutMs);
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempts);
    const delay = Math.round(random() * cap) + 250;
    attempts += 1;
    setState("reconnecting", { nextRetryInMs: delay });
    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const handleMessage = (raw) => {
    status.lastMessageAt = now();
    armIdleTimer();
    let msg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ping") return;
    if (msg.type === "error") {
      status.lastError = String(msg.msg || "stream error").slice(0, 200);
      logger.warn(`[market] stream error message: ${status.lastError}`);
      return;
    }
    if (msg.type !== "trade" || !Array.isArray(msg.data)) return;

    const latest = new Map();
    for (const t of msg.data) {
      const symbol = typeof t?.s === "string" ? t.s : null;
      const price = Number(t?.p);
      const ts = Number(t?.t);
      if (!symbol || !Number.isFinite(price) || price <= 0 || !Number.isFinite(ts)) continue;
      const vol = Number.isFinite(Number(t.v)) ? Number(t.v) : 0;
      const prev = latest.get(symbol);
      if (!prev || ts >= prev.sourceTs) {
        latest.set(symbol, { symbol, price, sourceTs: ts, volume: (prev?.volume || 0) + vol });
      } else {
        prev.volume += vol;
      }
    }
    if (latest.size) onTrades([...latest.values()]);
  };

  function connect() {
    if (stopped) return;
    setState("connecting");
    subscribed.clear();
    let socket;
    try {
      socket = new WebSocketImpl(`${STREAM_URL}?token=${encodeURIComponent(apiKey)}`);
    } catch (err) {
      status.lastError = err.message;
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.addEventListener("open", () => {
      if (ws !== socket) return;
      attempts = 0;
      setState("open", { lastError: null, nextRetryInMs: null });
      armIdleTimer();
      syncSubscriptions();
      setState("open");
    });
    socket.addEventListener("message", (ev) => {
      if (ws === socket) handleMessage(ev.data);
    });
    socket.addEventListener("error", () => {
      if (ws === socket) status.lastError = "WebSocket error";
    });
    socket.addEventListener("close", (ev) => {
      if (ws !== socket) return;
      ws = null;
      subscribed.clear();
      if (idleTimer) timers.clearTimeout(idleTimer);
      if (stopped) {
        setState("stopped");
        return;
      }
      logger.warn(`[market] stream closed (code ${ev?.code ?? "?"}); reconnecting`);
      setState("closed");
      scheduleReconnect();
    });
  }

  return {
    start() {
      if (!stopped) return;
      if (typeof WebSocketImpl !== "function") {
        setState("unsupported", { lastError: "WebSocket is not available in this Node.js runtime." });
        return;
      }
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      if (reconnectTimer) timers.clearTimeout(reconnectTimer);
      if (idleTimer) timers.clearTimeout(idleTimer);
      reconnectTimer = null;
      try {
        ws?.close();
      } catch {}
      ws = null;
      setState("stopped");
    },
    setSymbols(symbols) {
      wanted.clear();
      for (const s of symbols) {
        if (wanted.size >= maxSymbols) break;
        wanted.add(s);
      }
      syncSubscriptions();
      return [...wanted];
    },
    isOpen: () => status.state === "open",
    status: () => ({ ...status, subscribedCount: subscribed.size }),
  };
}

module.exports = { createFinnhubStream, STREAM_URL };
