const { Schema, model } = require("mongoose");

const MAX_WATCHLIST = 50;
const MAX_WATCHLISTS = 5;

const WatchlistSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 30 },
  symbols: {
    type: [String],
    default: [],
    validate: [(v) => v.length <= MAX_WATCHLIST, `A watchlist is limited to ${MAX_WATCHLIST} symbols.`],
  },
});

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    cashCents: { type: Number, required: true, min: 0 },
    reservedCashCents: { type: Number, default: 0, min: 0 },
    netDepositsCents: { type: Number, default: 0 },
    watchlists: {
      type: [WatchlistSchema],
      default: [],
      validate: [(v) => v.length <= MAX_WATCHLISTS, `You can have at most ${MAX_WATCHLISTS} watchlists.`],
    },
    isGuest: { type: Boolean, default: false },
    guestExpiresAt: { type: Date },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

UserSchema.index({ "watchlists.symbols": 1 });
UserSchema.index({ isGuest: 1, guestExpiresAt: 1 });

const UserModel = model("user", UserSchema);

module.exports = { UserModel, MAX_WATCHLIST, MAX_WATCHLISTS };
