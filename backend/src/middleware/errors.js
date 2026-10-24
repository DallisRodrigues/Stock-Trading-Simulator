const mongoose = require("mongoose");
const { ApiError } = require("../utils/errors");
const { ProviderError } = require("../services/marketData");

const notFoundHandler = (req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (logger) => (err, req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ProviderError) {
    const status = err.code === "UNKNOWN_SYMBOL" ? 422 : 503;
    return res.status(status).json({ error: { code: err.code, message: err.message } });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "BAD_JSON", message: "Request body is not valid JSON." } });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: { code: "VALIDATION_FAILED", message: Object.values(err.errors)[0]?.message || "Invalid data." } });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: { code: "BAD_ID", message: "Invalid identifier." } });
  }
  const dbDown =
    err?.name === "MongoServerSelectionError" || err?.name === "MongoNetworkError" || /buffering timed out/i.test(err?.message || "");
  if (dbDown) {
    logger.error("[db] unavailable:", err.message);
    return res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "The database is temporarily unavailable." } });
  }
  logger.error(`[api] ${req.method} ${req.path} failed:`, err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
};

module.exports = { notFoundHandler, errorHandler };
