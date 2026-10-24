const mongoose = require("mongoose");

mongoose.set("strictQuery", true);

function describeUri(uri) {
  const m = /^(mongodb(?:\+srv)?):\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri || "");
  return m ? `${m[1]}://${m[2]}` : "(unparseable MongoDB URI)";
}

async function connectDb({ mongoUri, mongoDbName }, logger = console) {
  mongoose.connection.on("disconnected", () => logger.warn("[db] disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("[db] reconnected"));
  await mongoose.connect(mongoUri, { dbName: mongoDbName, serverSelectionTimeoutMS: 10_000 });
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  logger.info(`[db] connected to ${describeUri(mongoUri)} database "${mongoDbName}"`);
  return mongoose.connection;
}

async function runMigrations(logger = console, { startingCashCents = 10_000_000 } = {}) {
  const { OrderModel } = require("./models/Order");
  const { UserModel } = require("./models/User");
  const users = UserModel.collection;
  const legacy = await users.find({ watchlist: { $exists: true } }, { projection: { watchlist: 1, watchlists: 1 } }).toArray();
  for (const u of legacy) {
    const update = { $unset: { watchlist: "" } };
    if (!u.watchlists?.length) {
      update.$set = { watchlists: [{ _id: new mongoose.Types.ObjectId(), name: "Watchlist 1", symbols: u.watchlist || [] }] };
    }
    await users.updateOne({ _id: u._id }, update);
  }
  if (legacy.length) logger.info(`[db] migrated ${legacy.length} user watchlist(s) to named watchlists`);
  await users.updateMany({ netDepositsCents: { $exists: false } }, { $set: { netDepositsCents: startingCashCents } });
  const res = await OrderModel.updateMany(
    { status: "EXECUTED", filledAt: { $exists: false } },
    [{ $set: { filledAt: "$createdAt" } }],
    { updatePipeline: true }
  );
  if (res.modifiedCount) logger.info(`[db] migrated filledAt on ${res.modifiedCount} order(s)`);
}

module.exports = { connectDb, describeUri, runMigrations };
