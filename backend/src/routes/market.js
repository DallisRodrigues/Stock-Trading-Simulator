const express = require("express");
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { normalizeSymbol } = require("../utils/symbols");
const { badRequest } = require("../utils/errors");

function marketRoutes({ marketData, companyData }) {
  const router = express.Router();

  router.get("/status", async (_req, res) => {
    res.json(await marketData.marketStatus());
  });

  router.get("/quotes", validate(z.object({ symbols: z.string().max(600) }), "query"), async (req, res) => {
    const symbols = [...new Set(req.valid.query.symbols.split(",").map(normalizeSymbol).filter(Boolean))];
    if (!symbols.length || symbols.length > 50) throw badRequest("Provide between 1 and 50 valid symbols.");
    res.json({ quotes: await marketData.getQuotes(symbols) });
  });

  router.get("/search", validate(z.object({ q: z.string().trim().min(1).max(30) }), "query"), async (req, res) => {
    res.json({ results: await marketData.search(req.valid.query.q) });
  });

  router.get("/company/:symbol", async (req, res) => {
    const symbol = normalizeSymbol(req.params.symbol);
    if (!symbol) throw badRequest("Invalid symbol.");
    res.json(await companyData.overview(symbol));
  });

  router.get("/news/:symbol", async (req, res) => {
    const symbol = normalizeSymbol(req.params.symbol);
    if (!symbol) throw badRequest("Invalid symbol.");
    const news = await companyData.get("news", symbol);
    res.json({ symbol, provider: companyData.provider, ...news, data: news.data || [] });
  });

  router.get("/history/:symbol", async (req, res) => {
    const symbol = normalizeSymbol(req.params.symbol);
    if (!symbol) throw badRequest("Invalid symbol.");
    res.json({
      symbol,
      points: marketData.history(symbol),
      provider: marketData.provider,
    });
  });

  return router;
}

module.exports = { marketRoutes };
