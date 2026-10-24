import React, { useCallback, useEffect, useState } from "react";
import { Badge, IconButton, Popover } from "@mui/material";
import { NotificationsNoneOutlined } from "@mui/icons-material";

import api from "../api/client";
import { useMarketData } from "../context/MarketDataContext";
import { useNotify } from "../context/NotificationContext";
import { formatTime } from "../utils/format";

const ICON = { ORDER_FILLED: "✓", ORDER_EXPIRED: "⏱", ORDER_REJECTED: "!", ALERT: "🔔" };

const NotificationBell = () => {
  const { onEvent } = useMarketData();
  const notify = useNotify();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [anchor, setAnchor] = useState(null);

  const load = useCallback(() => {
    api
      .get("/notifications")
      .then((res) => {
        setItems(res.data.notifications);
        setUnread(res.data.unread);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    return onEvent("notification", (n) => {
      setItems((prev) => [n, ...prev].slice(0, 30));
      setUnread((u) => u + 1);
      notify(n.title, n.type === "ORDER_REJECTED" ? "warning" : "info");
    });
  }, [load, onEvent, notify]);

  const open = (e) => {
    setAnchor(e.currentTarget);
    if (unread > 0) {
      api.post("/notifications/read").catch(() => {});
      setUnread(0);
    }
  };

  return (
    <>
      <IconButton size="small" onClick={open} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="bell">
        <Badge badgeContent={unread} color="warning" max={9}>
          <NotificationsNoneOutlined fontSize="small" />
        </Badge>
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => {
          setAnchor(null);
          setItems((prev) => prev.map((n) => ({ ...n, read: true })));
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <div className="notif-panel" role="region" aria-label="Notifications">
          <p className="notif-title">Notifications</p>
          {!items.length ? (
            <p className="page-status">Nothing yet. Order fills and price alerts will appear here.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className={n.read ? "" : "unread"}>
                  <span className={`notif-icon notif-${n.type.toLowerCase()}`} aria-hidden="true">
                    {ICON[n.type]}
                  </span>
                  <div>
                    <strong>{n.title}</strong>
                    {n.body && <p>{n.body}</p>}
                    <small>{formatTime(n.createdAt)}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Popover>
    </>
  );
};

export default NotificationBell;
