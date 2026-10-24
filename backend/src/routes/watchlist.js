const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { UserModel, MAX_WATCHLIST, MAX_WATCHLISTS } = require("../models/User");
const { symbolField, idParam } = require("./trading");
const { badRequest, notFound, unprocessable, unavailable } = require("../utils/errors");

const nameField = z.string().trim().min(1, "Give the watchlist a name.").max(30, "Names can be at most 30 characters.");
const serializeList = (l) => ({ id: String(l._id), name: l.name, symbols: l.symbols });

function createWatchlistService({ marketData, onWatchlistChanged = () => {} }) {
  async function load(userId) {
    const user = await UserModel.findById(userId).select("watchlists").lean();
    return user?.watchlists || [];
  }

  async function getList(userId, listId) {
    const list = (await load(userId)).find((l) => String(l._id) === String(listId));
    if (!list) throw notFound("Watchlist not found.");
    return list;
  }

  async function addSymbol(userId, listId, symbol) {
    const list = await getList(userId, listId);
    if (list.symbols.includes(symbol)) return false;
    const exists = await marketData.symbolExists(symbol);
    if (exists === null) throw unavailable("PROVIDER_UNAVAILABLE", "Could not verify the symbol right now. Please try again shortly.");
    if (!exists) throw unprocessable("UNKNOWN_SYMBOL", `${symbol} was not found by the market data provider.`);
    const res = await UserModel.updateOne(
      {
        _id: userId,
        watchlists: { $elemMatch: { _id: list._id, symbols: { $ne: symbol }, [`symbols.${MAX_WATCHLIST - 1}`]: { $exists: false } } },
      },
      { $push: { "watchlists.$.symbols": symbol } }
    );
    if (res.modifiedCount !== 1) {
      const fresh = await getList(userId, listId);
      if (!fresh.symbols.includes(symbol)) throw unprocessable("WATCHLIST_FULL", `A watchlist is limited to ${MAX_WATCHLIST} symbols.`);
      return false;
    }
    onWatchlistChanged();
    return true;
  }

  async function removeSymbol(userId, listId, symbol) {
    await getList(userId, listId);
    await UserModel.updateOne({ _id: userId, "watchlists._id": listId }, { $pull: { "watchlists.$.symbols": symbol } });
    onWatchlistChanged();
  }

  async function create(userId, name) {
    const res = await UserModel.updateOne(
      { _id: userId, [`watchlists.${MAX_WATCHLISTS - 1}`]: { $exists: false } },
      { $push: { watchlists: { _id: new mongoose.Types.ObjectId(), name, symbols: [] } } }
    );
    if (res.modifiedCount !== 1) throw unprocessable("TOO_MANY_WATCHLISTS", `You can have at most ${MAX_WATCHLISTS} watchlists.`);
  }

  async function update(userId, listId, { name, symbols }) {
    const list = await getList(userId, listId);
    const $set = {};
    if (name != null) $set["watchlists.$.name"] = name;
    if (symbols) {
      const same = symbols.length === list.symbols.length && [...symbols].sort().join() === [...list.symbols].sort().join();
      if (!same) throw badRequest("Reordering must keep the same symbols.");
      $set["watchlists.$.symbols"] = symbols;
    }
    if (Object.keys($set).length) await UserModel.updateOne({ _id: userId, "watchlists._id": list._id }, { $set });
  }

  async function remove(userId, listId) {
    const lists = await load(userId);
    if (lists.length <= 1) throw unprocessable("LAST_WATCHLIST", "You need at least one watchlist.");
    await getList(userId, listId);
    await UserModel.updateOne({ _id: userId }, { $pull: { watchlists: { _id: listId } } });
    onWatchlistChanged();
  }

  async function snapshot(userId) {
    const lists = await load(userId);
    const symbols = [...new Set(lists.flatMap((l) => l.symbols))];
    return { lists: lists.map(serializeList), quotes: await marketData.getQuotes(symbols), max: MAX_WATCHLIST, maxLists: MAX_WATCHLISTS };
  }

  return { load, addSymbol, removeSymbol, create, update, remove, snapshot };
}

function watchlistsRoutes({ service }) {
  const router = express.Router();
  const listParam = idParam;
  const symbolParams = z.object({ id: idParam.shape.id, symbol: symbolField });

  router.get("/", async (req, res) => res.json(await service.snapshot(req.user._id)));

  router.post("/", validate(z.object({ name: nameField })), async (req, res) => {
    await service.create(req.user._id, req.valid.body.name);
    res.status(201).json(await service.snapshot(req.user._id));
  });

  router.patch(
    "/:id",
    validate(listParam, "params"),
    validate(z.object({ name: nameField.optional(), symbols: z.array(symbolField).max(MAX_WATCHLIST).optional() })),
    async (req, res) => {
      await service.update(req.user._id, req.valid.params.id, req.valid.body);
      res.json(await service.snapshot(req.user._id));
    }
  );

  router.delete("/:id", validate(listParam, "params"), async (req, res) => {
    await service.remove(req.user._id, req.valid.params.id);
    res.json(await service.snapshot(req.user._id));
  });

  router.post("/:id/symbols", validate(listParam, "params"), validate(z.object({ symbol: symbolField })), async (req, res) => {
    const added = await service.addSymbol(req.user._id, req.valid.params.id, req.valid.body.symbol);
    res.status(added ? 201 : 200).json(await service.snapshot(req.user._id));
  });

  router.delete("/:id/symbols/:symbol", validate(symbolParams, "params"), async (req, res) => {
    await service.removeSymbol(req.user._id, req.valid.params.id, req.valid.params.symbol);
    res.json(await service.snapshot(req.user._id));
  });

  return router;
}

function watchlistRoutes({ service, marketData }) {
  const router = express.Router();
  const first = async (userId) => (await service.load(userId))[0];
  const respond = async (res, userId, status = 200) => {
    const list = await first(userId);
    const symbols = list?.symbols || [];
    res.status(status).json({ symbols, quotes: await marketData.getQuotes(symbols), max: MAX_WATCHLIST });
  };

  router.get("/", async (req, res) => respond(res, req.user._id));
  router.post("/", validate(z.object({ symbol: symbolField })), async (req, res) => {
    const list = await first(req.user._id);
    const added = await service.addSymbol(req.user._id, list._id, req.valid.body.symbol);
    await respond(res, req.user._id, added ? 201 : 200);
  });
  router.delete("/:symbol", async (req, res) => {
    const parsed = symbolField.safeParse(req.params.symbol);
    const list = await first(req.user._id);
    if (parsed.success && list) await service.removeSymbol(req.user._id, list._id, parsed.data);
    await respond(res, req.user._id);
  });
  return router;
}

module.exports = { watchlistRoutes, watchlistsRoutes, createWatchlistService };
