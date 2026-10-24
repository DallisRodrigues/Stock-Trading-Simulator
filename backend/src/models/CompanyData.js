const { Schema, model } = require("mongoose");

const CompanyDataSchema = new Schema({
  symbol: { type: String, required: true },
  kind: { type: String, required: true, enum: ["profile", "metrics", "recommendations", "peers", "news"] },
  source: { type: String, required: true, enum: ["finnhub", "demo"] },
  data: { type: Schema.Types.Mixed },
  fetchedAt: { type: Date, required: true },
});

CompanyDataSchema.index({ symbol: 1, kind: 1 }, { unique: true });
CompanyDataSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

const CompanyDataModel = model("companydata", CompanyDataSchema);

module.exports = { CompanyDataModel };
