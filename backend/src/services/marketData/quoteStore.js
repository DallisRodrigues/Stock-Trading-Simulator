const { EventEmitter } = require("node:events");

const round2 = (n) => Math.round(n * 100) / 100;

class QuoteStore extends EventEmitter {
  constructor({ maxSymbols = 500, historyLength = 300, now = Date.now } = {}) {
    super();
    this.maxSymbols = maxSymbols;
    this.historyLength = historyLength;
    this.now = now;
    this.quotes = new Map();
    this.histories = new Map();
  }

  get(symbol) {
    return this.quotes.get(symbol) || null;
  }

  history(symbol) {
    return this.histories.get(symbol) || [];
  }

  applySnapshot(symbol, snap, source) {
    const prev = this.quotes.get(symbol);
    const quote = this.#build(symbol, {
      price: snap.price,
      prevClose: snap.prevClose ?? prev?.prevClose ?? null,
      open: snap.open ?? prev?.open ?? null,
      high: snap.high ?? prev?.high ?? null,
      low: snap.low ?? prev?.low ?? null,
      volume: null,
      sourceTs: snap.sourceTs ?? null,
      source,
    });
    if (prev && prev.source === "stream" && prev.sourceTs && quote.sourceTs && quote.sourceTs < prev.sourceTs) {
      prev.prevClose = quote.prevClose;
      prev.open = quote.open;
      this.#recomputeChange(prev);
      this.emit("quote", prev);
      return prev;
    }
    return this.#store(quote);
  }

  applyTrade(symbol, trade) {
    const prev = this.quotes.get(symbol);
    if (prev && prev.sourceTs && trade.sourceTs < prev.sourceTs) return prev;
    const high = prev?.high != null ? Math.max(prev.high, trade.price) : null;
    const low = prev?.low != null ? Math.min(prev.low, trade.price) : null;
    return this.#store(
      this.#build(symbol, {
        price: trade.price,
        prevClose: prev?.prevClose ?? null,
        open: prev?.open ?? null,
        high,
        low,
        volume: trade.volume ?? null,
        sourceTs: trade.sourceTs,
        source: "stream",
      })
    );
  }

  #build(symbol, f) {
    const q = { symbol, ...f, receivedAt: this.now(), change: null, changePct: null };
    this.#recomputeChange(q);
    return q;
  }

  #recomputeChange(q) {
    if (q.prevClose && q.prevClose > 0 && Number.isFinite(q.price)) {
      q.change = round2(q.price - q.prevClose);
      q.changePct = round2(((q.price - q.prevClose) / q.prevClose) * 100);
    } else {
      q.change = null;
      q.changePct = null;
    }
  }

  #store(quote) {
    const { symbol } = quote;
    this.quotes.delete(symbol);
    this.quotes.set(symbol, quote);
    if (this.quotes.size > this.maxSymbols) {
      const oldest = this.quotes.keys().next().value;
      this.quotes.delete(oldest);
      this.histories.delete(oldest);
    }

    const hist = this.histories.get(symbol) || [];
    const t = quote.sourceTs || quote.receivedAt;
    const last = hist[hist.length - 1];
    if (!last || last.t !== t || last.p !== quote.price) {
      hist.push({ t, p: quote.price });
      if (hist.length > this.historyLength) hist.splice(0, hist.length - this.historyLength);
      this.histories.set(symbol, hist);
    }

    this.emit("quote", quote);
    return quote;
  }
}

module.exports = { QuoteStore };
