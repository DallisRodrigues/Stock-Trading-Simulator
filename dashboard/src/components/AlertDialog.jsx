import React, { useState } from "react";
import { Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from "@mui/material";

import api, { errorMessage } from "../api/client";
import { useQuotes } from "../context/MarketDataContext";
import { useNotify } from "../context/NotificationContext";
import { formatMoney, formatPct } from "../utils/format";

export const CONDITIONS = [
  { value: "ABOVE", label: "Price rises above", unit: "$" },
  { value: "BELOW", label: "Price falls below", unit: "$" },
  { value: "CHANGE_UP", label: "Day change is up at least", unit: "%" },
  { value: "CHANGE_DOWN", label: "Day change is down at least", unit: "%" },
];

const AlertDialog = ({ symbol, onClose, onCreated }) => {
  const notify = useNotify();
  const quote = useQuotes([symbol])[symbol];
  const [condition, setCondition] = useState("ABOVE");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const unit = CONDITIONS.find((c) => c.value === condition).unit;

  const submit = async (e) => {
    e.preventDefault();
    const num = Number(value);
    if (!(num > 0)) {
      setError(`Enter a ${unit === "$" ? "price" : "percentage"} greater than zero.`);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post("/alerts", { symbol, condition, value: num, note: note.trim() || undefined });
      notify(`Alert set for ${symbol}`);
      onCreated?.();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Could not create the alert."));
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={() => !submitting && onClose()} maxWidth="xs" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle sx={{ fontWeight: 400 }}>Create alert · {symbol}</DialogTitle>
        <DialogContent>
          <p className="analytics-meta">
            Now {formatMoney(quote?.price)} · {formatPct(quote?.changePct)} today
          </p>
          <TextField select fullWidth margin="dense" label="Notify me when" value={condition} onChange={(e) => setCondition(e.target.value)}>
            {CONDITIONS.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            margin="dense"
            label={unit === "$" ? "Price (USD)" : "Percent"}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={Boolean(error)}
            helperText={error || "Alerts fire once, then move to your alert history."}
            slotProps={{ htmlInput: { "aria-label": unit === "$" ? "Alert price" : "Alert percent" } }}
          />
          <TextField fullWidth margin="dense" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 140 } }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <button type="button" className="btn btn-grey" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-blue" disabled={submitting}>
            {submitting ? "Saving…" : "Create alert"}
          </button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default AlertDialog;
