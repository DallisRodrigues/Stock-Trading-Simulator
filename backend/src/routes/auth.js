const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { UserModel } = require("../models/User");
const { validate } = require("../middleware/validate");
const { COOKIE_NAME, cookieOptions, signToken, requireAuth, userFromToken } = require("../middleware/auth");
const { ApiError, conflict, unauthorized } = require("../utils/errors");
const { toCents, fromCents } = require("../utils/money");
const { DEFAULT_WATCHLIST } = require("../services/trackedSymbols");

const signupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  email: z.email("Enter a valid email address.").trim().toLowerCase().max(254),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128, "Password is too long."),
});
const loginSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(1, "Password is required.").max(128),
});

const BCRYPT_COST = 12;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);

const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  cash: fromCents(u.cashCents),
  reservedCash: fromCents(u.reservedCashCents || 0),
  isGuest: Boolean(u.isGuest),
  guestExpiresAt: u.guestExpiresAt || null,
});

function authRoutes({ config, guests, onWatchlistChanged = () => {} }) {
  const router = express.Router();
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: config.authRateLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please wait a few minutes and try again." } },
  });

  const issue = (res, user) => res.cookie(COOKIE_NAME, signToken(user, config), cookieOptions(config));

  router.post("/signup", limiter, validate(signupSchema), async (req, res) => {
    const { name, email, password } = req.valid.body;
    if (await UserModel.exists({ email })) throw conflict("EMAIL_TAKEN", "An account with this email already exists.");
    let user;
    try {
      user = await UserModel.create({
        name,
        email,
        passwordHash: await bcrypt.hash(password, BCRYPT_COST),
        cashCents: toCents(config.startingCash),
        netDepositsCents: toCents(config.startingCash),
        watchlists: [{ name: "Watchlist 1", symbols: DEFAULT_WATCHLIST }],
      });
    } catch (err) {
      if (err?.code === 11000) throw conflict("EMAIL_TAKEN", "An account with this email already exists.");
      throw err;
    }
    onWatchlistChanged();
    issue(res, user);
    res.status(201).json({ user: publicUser(user) });
  });

  router.post("/login", limiter, validate(loginSchema), async (req, res) => {
    const { email, password } = req.valid.body;
    const user = await UserModel.findOne({ email }).select("+passwordHash");
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) throw unauthorized("Invalid email or password.");
    issue(res, user);
    res.json({ user: publicUser(user) });
  });

  router.post("/guest", limiter, async (req, res) => {
    if (!guests || !config.guest?.enabled) throw new ApiError(403, "GUEST_DISABLED", "The guest demo is disabled on this server.");
    const user = await guests.create();
    onWatchlistChanged();
    issue(res, user);
    res.status(201).json({ user: publicUser(user) });
  });

  router.post("/logout", async (req, res) => {
    const user = await userFromToken(req.cookies?.[COOKIE_NAME], config);
    if (user?.isGuest && guests) await guests.purge([user._id]);
    else if (user) await UserModel.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
    const { maxAge: _maxAge, ...clearOpts } = cookieOptions(config);
    res.clearCookie(COOKIE_NAME, clearOpts);
    res.status(204).end();
  });

  router.get("/session", async (req, res) => {
    const user = await userFromToken(req.cookies?.[COOKIE_NAME], config);
    res.json({ user: user ? publicUser(user) : null });
  });

  router.get("/me", requireAuth(config), (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  return router;
}

module.exports = { authRoutes, publicUser };
