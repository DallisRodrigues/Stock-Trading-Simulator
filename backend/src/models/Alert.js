const { Schema, model } = require("mongoose");

const AlertSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "user", required: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    condition: { type: String, required: true, enum: ["ABOVE", "BELOW", "CHANGE_UP", "CHANGE_DOWN"] },
    value: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["ACTIVE", "TRIGGERED", "CANCELLED"], default: "ACTIVE" },
    note: { type: String, maxlength: 140, default: "" },
    triggeredAt: { type: Date },
    triggerPrice: { type: Number },
  },
  { timestamps: true }
);

AlertSchema.index({ user: 1, createdAt: -1 });
AlertSchema.index({ status: 1, symbol: 1 });

const AlertModel = model("alert", AlertSchema);

module.exports = { AlertModel };
