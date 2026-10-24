const SAMPLE = {
  SPY: { name: "SPDR S&P 500 ETF Trust", price: 500.0, prevClose: 497.5, sector: "ETF" },
  QQQ: { name: "Invesco QQQ Trust", price: 430.0, prevClose: 432.1, sector: "ETF" },
  AAPL: { name: "Apple Inc", price: 190.0, prevClose: 188.2, sector: "Technology" },
  MSFT: { name: "Microsoft Corp", price: 410.0, prevClose: 412.4, sector: "Technology" },
  GOOGL: { name: "Alphabet Inc Class A", price: 165.0, prevClose: 163.9, sector: "Media" },
  AMZN: { name: "Amazon.com Inc", price: 180.0, prevClose: 181.3, sector: "Retail" },
  NVDA: { name: "NVIDIA Corp", price: 120.0, prevClose: 117.6, sector: "Semiconductors" },
  TSLA: { name: "Tesla Inc", price: 250.0, prevClose: 254.8, sector: "Automobiles" },
  META: { name: "Meta Platforms Inc", price: 480.0, prevClose: 476.0, sector: "Media" },
  NFLX: { name: "Netflix Inc", price: 620.0, prevClose: 615.2, sector: "Media" },
  AMD: { name: "Advanced Micro Devices Inc", price: 160.0, prevClose: 162.5, sector: "Semiconductors" },
  JPM: { name: "JPMorgan Chase & Co", price: 200.0, prevClose: 199.1, sector: "Banking" },
  V: { name: "Visa Inc Class A", price: 275.0, prevClose: 276.4, sector: "Financial Services" },
  KO: { name: "Coca-Cola Co", price: 62.0, prevClose: 61.8, sector: "Beverages" },
  DIS: { name: "Walt Disney Co", price: 100.0, prevClose: 101.2, sector: "Media" },
  INTC: { name: "Intel Corp", price: 30.0, prevClose: 30.4, sector: "Semiconductors" },
  IBM: { name: "International Business Machines Corp", price: 185.0, prevClose: 183.7, sector: "Technology" },
  ORCL: { name: "Oracle Corp", price: 140.0, prevClose: 138.9, sector: "Technology" },
  WMT: { name: "Walmart Inc", price: 68.0, prevClose: 67.7, sector: "Retail" },
  BA: { name: "Boeing Co", price: 175.0, prevClose: 178.3, sector: "Aerospace & Defense" },
};

function createDemoProvider() {
  return {
    async getQuote(symbol) {
      const s = SAMPLE[symbol];
      if (!s) return null;
      return { price: s.price, prevClose: s.prevClose, open: null, high: null, low: null, sourceTs: null };
    },
    async search(query) {
      const q = query.trim().toUpperCase();
      return Object.entries(SAMPLE)
        .filter(([sym, s]) => sym.startsWith(q) || s.name.toUpperCase().includes(q))
        .slice(0, 15)
        .map(([symbol, s]) => ({ symbol, description: s.name, type: symbol === "SPY" || symbol === "QQQ" ? "ETP" : "Common Stock" }));
    },
    async marketStatus() {
      return { isOpen: null, session: null, holiday: null, timezone: "America/New_York", sourceTs: null };
    },
    async profile(symbol) {
      const s = SAMPLE[symbol];
      if (!s) return null;
      return { name: s.name, industry: s.sector, exchange: "SAMPLE", country: "US", currency: "USD", ipo: null, marketCap: null, sharesOutstanding: null, logo: null, website: null };
    },
    async metrics(symbol) {
      const s = SAMPLE[symbol];
      if (!s) return null;
      const r = (n) => Math.round(n * 100) / 100;
      return {
        high52: r(s.price * 1.2),
        high52Date: null,
        low52: r(s.price * 0.8),
        low52Date: null,
        beta: null,
        peTTM: null,
        epsTTM: null,
        dividendYield: null,
        roeTTM: null,
        netMarginTTM: null,
        avgVolume10D: null,
        returns: { "5D": null, MTD: null, "13W": null, "26W": null, "52W": null, YTD: null },
        annual: {},
        quarterly: {},
      };
    },
    async recommendations() {
      return [];
    },
    async peers(symbol) {
      const sector = SAMPLE[symbol]?.sector;
      return Object.keys(SAMPLE).filter((k) => k !== symbol && SAMPLE[k].sector === sector).slice(0, 6);
    },
    async news() {
      return [];
    },
  };
}

module.exports = { createDemoProvider, SAMPLE_SYMBOLS: Object.keys(SAMPLE) };
