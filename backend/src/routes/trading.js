const express = require("express");
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { fromCents } = require("../utils/money");
const { HoldingModel } = require("../models/Holding");
const { SYMBOL_RE } = require("../utils/symbols");

const symbolField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(SYMBOL_RE, "Enter a valid US ticker symbol.");

const twoDecimals = (n) => Math.round(n * 100) === Number((n * 100).toFixed(6));
const noteField = z.string().trim().max(280, "Notes can be at most 280 characters.");

const orderSchema = z
  .object({
    symbol: symbolField,
    side: z.enum(["BUY", "SELL"], { error: "Side must be BUY or SELL." }),
    type: z.enum(["MARKET", "LIMIT", "STOP"], { error: "Order type must be MARKET, LIMIT or STOP." }).default("MARKET"),
    qty: z
      .number({ error: "Quantity must be a number." })
      .int("Quantity must be a whole number.")
      .min(1, "Quantity must be at least 1.")
      .max(100_000, "Quantity is too large."),
    price: z
      .number({ error: "Price must be a number." })
      .positive("Price must be greater than zero.")
      .max(1_000_000, "Price is too large.")
      .refine(twoDecimals, "Price can have at most 2 decimal places.")
      .optional(),
    validity: z.enum(["DAY", "GTC"]).default("DAY"),
    note: noteField.optional(),
    clientOrderId: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9-]+$/, "Invalid order id."),
  })
  .refine((o) => o.type === "MARKET" || o.price != null, { message: "Limit and stop orders need a price.", path: ["price"] });
const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.date().optional(),
  status: z.enum(["executed", "open", "closed"]).default("executed"),
});
const idParam = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id.") });
const amountSchema = z.object({
  amount: z
    .number({ error: "Amount must be a number." })
    .positive("Amount must be greater than zero.")
    .max(1_000_000, "Amount cannot exceed $1,000,000 per transfer.")
    .refine(twoDecimals, "Amount can have at most 2 decimal places."),
});

function tradingRoutes({ trading, portfolio, onOrdersChanged = () => {} }) {
  const router = express.Router();

  router.get("/orders", validate(listSchema, "query"), async (req, res) => {
    res.json({ orders: await trading.listOrders(req.user._id, req.valid.query) });
  });

  router.post("/orders", validate(orderSchema), async (req, res) => {
    const { order, duplicate } = await trading.placeOrder(req.user._id, req.valid.body);
    if (order.status === "OPEN") onOrdersChanged();
    res.status(duplicate ? 200 : 201).json({ order, duplicate });
  });

  router.delete("/orders/:id", validate(idParam, "params"), async (req, res) => {
    const order = await trading.cancelOrder(req.user._id, req.valid.params.id);
    onOrdersChanged();
    res.json({ order });
  });

  router.patch("/orders/:id/note", validate(idParam, "params"), validate(z.object({ note: noteField })), async (req, res) => {
    res.json({ order: await trading.setNote(req.user._id, req.valid.params.id, req.valid.body.note) });
  });

  router.get("/holdings", async (req, res) => {
    res.json(await portfolio.holdings(req.user._id));
  });

  router.get("/positions", async (req, res) => {
    res.json({ positions: await portfolio.positions(req.user._id) });
  });

  router.get("/funds", async (req, res) => {
    const agg = await HoldingModel.aggregate([
      { $match: { user: req.user._id, qty: { $gt: 0 } } },
      { $group: { _id: null, cost: { $sum: "$costCents" } } },
    ]);
    res.json({
      cash: fromCents(req.user.cashCents),
      reserved: fromCents(req.user.reservedCashCents || 0),
      invested: fromCents(agg[0]?.cost || 0),
      currency: "USD",
    });
  });

  router.post("/funds/deposit", validate(amountSchema), async (req, res) => {
    res.json({ cash: await trading.changeCash(req.user._id, req.valid.body.amount, "deposit") });
  });

  router.post("/funds/withdraw", validate(amountSchema), async (req, res) => {
    res.json({ cash: await trading.changeCash(req.user._id, req.valid.body.amount, "withdraw") });
  });

  return router;
}

module.exports = { tradingRoutes, symbolField, idParam };
