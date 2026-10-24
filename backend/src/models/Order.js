const { Schema, model } = require("mongoose");

const OrderSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "user", required: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    side: { type: String, required: true, enum: ["BUY", "SELL"] },
    type: { type: String, enum: ["MARKET", "LIMIT", "STOP"], default: "MARKET" },
    qty: { type: Number, required: true, min: 1 },
    triggerPriceCents: { type: Number, min: 1 },
    validity: { type: String, enum: ["DAY", "GTC"], default: "DAY" },
    expiresAt: { type: Date },
    reservedCents: { type: Number, default: 0, min: 0 },
    priceCents: { type: Number, required: true, min: 0 },
    valueCents: { type: Number, required: true, min: 0 },
    realizedPnlCents: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["PENDING", "OPEN", "FILLING", "EXECUTED", "CANCELLED", "EXPIRED", "REJECTED"],
      default: "PENDING",
    },
    statusReason: { type: String, maxlength: 200 },
    priceSource: { type: String, enum: ["stream", "rest", "demo"] },
    priceTimestamp: { type: Date },
    filledAt: { type: Date },
    clientOrderId: { type: String, required: true, maxlength: 64 },
    note: { type: String, maxlength: 280, default: "" },
  },
  { timestamps: true }
);

OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ user: 1, status: 1, filledAt: -1 });
OrderSchema.index({ status: 1, symbol: 1 });
OrderSchema.index({ status: 1, expiresAt: 1 });
OrderSchema.index({ user: 1, clientOrderId: 1 }, { unique: true });

const OrderModel = model("order", OrderSchema);

module.exports = { OrderModel };
