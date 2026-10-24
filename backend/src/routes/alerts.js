const express = require("express");
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { symbolField, idParam } = require("./trading");

const alertSchema = z
  .object({
    symbol: symbolField,
    condition: z.enum(["ABOVE", "BELOW", "CHANGE_UP", "CHANGE_DOWN"], { error: "Choose a valid alert condition." }),
    value: z.number({ error: "Enter a number." }).positive("Enter a value greater than zero.").max(1_000_000),
    note: z.string().trim().max(140, "Notes can be at most 140 characters.").optional(),
  })
  .refine((a) => !a.condition.startsWith("CHANGE") || a.value <= 100, { message: "Percent change must be 100 or less.", path: ["value"] });

function alertRoutes({ alerts, onAlertsChanged = () => {} }) {
  const router = express.Router();
  router.get("/", async (req, res) => res.json({ alerts: await alerts.list(req.user._id) }));
  router.post("/", validate(alertSchema), async (req, res) => {
    const alert = await alerts.create(req.user._id, req.valid.body);
    onAlertsChanged();
    res.status(201).json({ alert });
  });
  router.delete("/:id", validate(idParam, "params"), async (req, res) => {
    await alerts.remove(req.user._id, req.valid.params.id);
    onAlertsChanged();
    res.status(204).end();
  });
  return router;
}

function notificationRoutes({ notifications }) {
  const router = express.Router();
  router.get("/", async (req, res) => res.json(await notifications.list(req.user._id)));
  router.post("/read", async (req, res) => {
    await notifications.markRead(req.user._id);
    res.status(204).end();
  });
  router.post("/:id/read", validate(idParam, "params"), async (req, res) => {
    await notifications.markRead(req.user._id, req.valid.params.id);
    res.status(204).end();
  });
  return router;
}

module.exports = { alertRoutes, notificationRoutes };
