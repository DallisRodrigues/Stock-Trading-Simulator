const { Schema, model } = require("mongoose");

const HoldingSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "user", required: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    qty: { type: Number, required: true, min: 0 },
    costCents: { type: Number, required: true, min: 0 },
    reservedQty: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

HoldingSchema.index({ user: 1, symbol: 1 }, { unique: true });
HoldingSchema.index({ symbol: 1 });

const HoldingModel = model("holding", HoldingSchema);

module.exports = { HoldingModel };
