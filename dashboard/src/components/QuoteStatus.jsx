import React from "react";
import { QUOTE_STATUS, formatTime } from "../utils/format";

const QuoteStatus = ({ quote, inverse = false, hideLive = false, hide = [] }) => {
  const status = quote?.status || "unavailable";
  if ((hideLive && status === "live") || hide.includes(status)) return null;
  const info = QUOTE_STATUS[status] || QUOTE_STATUS.unavailable;
  const when = quote?.sourceTs || quote?.receivedAt;
  const title = `${info.title}${when ? ` · last update ${formatTime(when)}` : ""}`;
  return (
    <span className={`quote-status quote-status-${info.tone}${inverse ? " inverse" : ""}`} title={title}>
      {info.label}
    </span>
  );
};

export default QuoteStatus;
