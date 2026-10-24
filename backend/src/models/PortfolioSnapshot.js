const { Schema, model } = require("mongoose");

const PortfolioSnapshotSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "user", required: true },
  t: { type: Date, required: true },
  cashCents: { type: Number, required: true },
  investedCents: { type: Number, required: true },
  holdingsValueCents: { type: Number, required: true },
  netDepositsCents: { type: Number },
  benchmarkPrice: { type: Number },
  priceSource: { type: String, enum: ["live", "demo"], required: true },
});

PortfolioSnapshotSchema.index({ user: 1, t: -1 });
PortfolioSnapshotSchema.index({ t: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

const PortfolioSnapshotModel = model("portfoliosnapshot", PortfolioSnapshotSchema);

module.exports = { PortfolioSnapshotModel };
