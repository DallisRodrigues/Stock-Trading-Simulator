const { loadEnvFile } = require("../src/config");
const { createFinnhubRest } = require("../src/services/marketData/finnhubRest");
const { createFinnhubStream } = require("../src/services/marketData/finnhubStream");

loadEnvFile();
const apiKey = process.env.FINNHUB_API_KEY;
if (!apiKey) {
  console.error("FINNHUB_API_KEY is not set in backend/.env");
  process.exit(1);
}

(async () => {
  const rest = createFinnhubRest({ apiKey, callsPerMinute: 5 });
  try {
    const q = await rest.getQuote("AAPL");
    console.log("REST /quote AAPL:", q ? `ok (price ${q.price}, prevClose ${q.prevClose})` : "no data");
    const s = await rest.marketStatus();
    console.log(`REST market status: isOpen=${s.isOpen} session=${s.session}`);
  } catch (err) {
    console.error(`REST check failed: ${err.code} ${err.message}`);
  }

  let trades = 0;
  const stream = createFinnhubStream({
    apiKey,
    onTrades: (t) => (trades += t.length),
    onStatus: (s) => console.log(`WebSocket state: ${s.state}${s.lastError ? ` (${s.lastError})` : ""}`),
  });
  stream.start();
  stream.setSymbols(["AAPL", "MSFT", "SPY"]);
  setTimeout(() => {
    console.log(`WebSocket: received ${trades} trade update(s) in 15 s (0 is expected while the US market is closed).`);
    stream.stop();
    process.exit(0);
  }, 15_000);
})();
