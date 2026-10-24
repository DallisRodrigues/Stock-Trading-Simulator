const { NotificationModel } = require("../models/Notification");

const serialize = (n) => ({
  id: String(n._id),
  type: n.type,
  title: n.title,
  body: n.body,
  data: n.data ?? null,
  read: n.read,
  createdAt: n.createdAt,
});

function createNotificationService({ userEvents }) {
  async function notify(userId, { type, title, body = "", data }) {
    const doc = await NotificationModel.create({ user: userId, type, title, body, data });
    userEvents.emit("notification", String(userId), serialize(doc));
    return doc;
  }

  async function list(userId, { limit = 30 } = {}) {
    const [items, unread] = await Promise.all([
      NotificationModel.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean(),
      NotificationModel.countDocuments({ user: userId, read: false }),
    ]);
    return { notifications: items.map(serialize), unread };
  }

  async function markRead(userId, id) {
    const filter = id ? { _id: id, user: userId } : { user: userId, read: false };
    await NotificationModel.updateMany(filter, { $set: { read: true } });
  }

  return { notify, list, markRead };
}

module.exports = { createNotificationService };
