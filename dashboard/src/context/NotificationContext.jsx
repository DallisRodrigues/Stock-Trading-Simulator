import React, { createContext, useCallback, useContext, useState } from "react";
import { Alert, Snackbar } from "@mui/material";

const NotificationContext = createContext({ notify: () => {} });

export function NotificationProvider({ children }) {
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, severity = "success") => {
    if (message) setToast({ message, severity, key: Date.now() });
  }, []);

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <Snackbar
        key={toast?.key}
        open={Boolean(toast)}
        autoHideDuration={toast?.severity === "error" ? 6000 : 3500}
        onClose={(_e, reason) => reason !== "clickaway" && setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)} sx={{ fontSize: "0.85rem" }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotificationContext.Provider>
  );
}

export const useNotify = () => useContext(NotificationContext).notify;
