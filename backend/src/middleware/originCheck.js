const { ApiError } = require("../utils/errors");

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

function sameHost(origin, req) {
  try {
    return new URL(origin).host === req.get("host");
  } catch {
    return false;
  }
}

const originCheck = (allowed) => (req, _res, next) => {
  if (SAFE.has(req.method)) return next();
  const origin = req.get("origin");
  if (origin && !allowed.includes(origin) && !sameHost(origin, req)) {
    return next(new ApiError(403, "FORBIDDEN_ORIGIN", "Request origin is not allowed."));
  }
  next();
};

module.exports = { originCheck };
