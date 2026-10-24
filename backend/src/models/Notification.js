const { Schema, model } = require("mongoose");

const NotificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "user", required: true },
    type: { type: String, required: true, enum: ["ORDER_FILLED", "ORDER_EXPIRED", "ORDER_REJECTED", "ALERT"] },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, maxlength: 300, default: "" },
    data: { type: Schema.Types.Mixed },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

const NotificationModel = model("notification", NotificationSchema);

module.exports = { NotificationModel };
