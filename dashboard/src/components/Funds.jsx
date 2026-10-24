import React, { useContext, useState } from "react";
import { Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";

import api, { errorMessage } from "../api/client";
import GeneralContext from "./GeneralContext";
import { useApiData } from "../hooks/useApiData";
import { useNotify } from "../context/NotificationContext";
import { formatMoney, formatPrice } from "../utils/format";
import PageSkeleton from "./PageSkeleton";

const TransferDialog = ({ kind, cash, onClose, onDone }) => {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isDeposit = kind === "deposit";

  const submit = async (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0) || !/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
      setError("Enter a positive amount with at most 2 decimal places.");
      return;
    }
    if (!isDeposit && value > cash) {
      setError(`You can withdraw at most ${formatMoney(cash)}.`);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await api.post(`/funds/${kind}`, { amount: value });
      onDone(res.data.cash, value);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={() => !submitting && onClose()} maxWidth="xs" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle sx={{ fontWeight: 400 }}>{isDeposit ? "Add virtual funds" : "Withdraw virtual funds"}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Amount (USD)"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={Boolean(error)}
            helperText={error || `Available cash: ${formatMoney(cash)}`}
            slotProps={{ htmlInput: { "aria-label": "Amount in USD" } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <button type="button" className="btn btn-grey" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className={`btn ${isDeposit ? "btn-green" : "btn-blue"}`} disabled={submitting}>
            {submitting ? "Processing…" : isDeposit ? "Add funds" : "Withdraw"}
          </button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

const Funds = () => {
  const { portfolioVersion, portfolioChanged } = useContext(GeneralContext);
  const notify = useNotify();
  const funds = useApiData("/funds", portfolioVersion);
  const holdings = useApiData("/holdings", portfolioVersion);
  const [dialog, setDialog] = useState(null);

  if (funds.loading && !funds.data) return <PageSkeleton label="Loading funds" rows={8} />;
  if (funds.error && !funds.data) return <p className="page-status error">{funds.error}</p>;

  const cash = funds.data.cash;
  const reserved = funds.data.reserved || 0;
  const holdingsValue = holdings.data?.totals.currentValue ?? null;

  return (
    <>
      <div className="funds">
        <p>Virtual USD for simulated trading — no real money is involved</p>
        <button className="btn btn-green" onClick={() => setDialog("deposit")}>
          Add funds
        </button>
        <button className="btn btn-blue" onClick={() => setDialog("withdraw")}>
          Withdraw
        </button>
      </div>

      <div className="row">
        <div className="col">
          <span>
            <p>Equity</p>
          </span>

          <div className="table">
            <div className="data">
              <p>Available cash</p>
              <p className="imp colored">{formatPrice(cash)}</p>
            </div>
            <div className="data">
              <p>Reserved for open orders</p>
              <p className="imp">{formatPrice(reserved)}</p>
            </div>
            <div className="data">
              <p>Invested (cost basis)</p>
              <p className="imp">{formatPrice(funds.data.invested)}</p>
            </div>
            <div className="data">
              <p>Holdings value</p>
              <p className="imp">{formatPrice(holdingsValue)}</p>
            </div>
            <hr />
            <div className="data">
              <p>Account value</p>
              <p>{holdingsValue == null ? "—" : formatPrice(cash + reserved + holdingsValue)}</p>
            </div>
            <div className="data">
              <p>Currency</p>
              <p>{funds.data.currency}</p>
            </div>
          </div>
        </div>

        <div className="col">
          <div className="commodity">
            <p>This is a paper-trading simulator. Funds are virtual and orders never reach a real exchange.</p>
          </div>
        </div>
      </div>

      {dialog && (
        <TransferDialog
          kind={dialog}
          cash={cash}
          onClose={() => setDialog(null)}
          onDone={(_newCash, amount) => {
            setDialog(null);
            notify(`${dialog === "deposit" ? "Added" : "Withdrew"} ${formatMoney(amount)} of virtual funds`);
            portfolioChanged();
          }}
        />
      )}
    </>
  );
};

export default Funds;
