import React from "react";
import { Skeleton } from "@mui/material";

const PageSkeleton = ({ label = "Loading", rows = 5, kpis = 0, chart = false }) => (
  <div className="page-skeleton" role="status" aria-live="polite" aria-busy="true">
    <span className="visually-hidden">{label}…</span>
    <Skeleton variant="text" width={180} height={32} />
    {kpis > 0 && (
      <div className="skeleton-kpis">
        {Array.from({ length: kpis }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={72} />
        ))}
      </div>
    )}
    {chart && <Skeleton variant="rounded" height={220} sx={{ my: 2 }} />}
    {Array.from({ length: rows }, (_, i) => (
      <Skeleton key={i} variant="text" height={34} />
    ))}
  </div>
);

export default PageSkeleton;
