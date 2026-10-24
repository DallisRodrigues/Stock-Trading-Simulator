const jwt = require("jsonwebtoken");
const { UserModel } = require("../models/User");
const { unauthorized } = require("../utils/errors");

const COOKIE_NAME = "token";

function cookieOptions(config) {
  return {
    httpOnly: true,
    sameSite: config.cookieSameSite || "lax",
    secure: config.isProduction,
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  };
}

function signToken(user, config) {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion || 0 }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    algorithm: "HS256",
  });
}

function tokenFromCookieHeader(header) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE_NAME) return decodeURIComponent(v.join("="));
  }
  return null;
}

async function userFromToken(token, config) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
  const user = await UserModel.findById(payload.sub);
  if (!user || (user.tokenVersion || 0) !== payload.tv) return null;
  return user;
}

const requireAuth = (config) => async (req, _res, next) => {
  const header = req.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const user = await userFromToken(req.cookies?.[COOKIE_NAME] || bearer, config);
  if (!user) return next(unauthorized());
  req.user = user;
  next();
};

module.exports = { COOKIE_NAME, cookieOptions, signToken, requireAuth, userFromToken, tokenFromCookieHeader };
