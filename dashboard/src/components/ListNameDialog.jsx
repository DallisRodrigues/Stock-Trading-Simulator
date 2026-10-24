import React, { useState } from "react";
import { Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";

const ListNameDialog = ({ title, initial = "", confirmLabel, danger = false, message, onSubmit, onClose }) => {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const needsName = !danger;

  const submit = async (e) => {
    e.preventDefault();
    if (needsName && !name.trim()) return;
    setBusy(true);
    const ok = await onSubmit(name.trim());
    if (!ok) setBusy(false);
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} maxWidth="xs" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle sx={{ fontWeight: 400 }}>{title}</DialogTitle>
        <DialogContent>
          {message && <p className="dialog-message">{message}</p>}
          {needsName && (
            <TextField
              autoFocus
              fullWidth
              margin="dense"
              label="Watchlist name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 30, "aria-label": "Watchlist name" } }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <button type="button" className="btn btn-grey" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className={`btn ${danger ? "btn-orange" : "btn-blue"}`} disabled={busy || (needsName && !name.trim())}>
            {confirmLabel}
          </button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ListNameDialog;
