import React, { Suspense, lazy } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import Alerts from "./Alerts";
import Funds from "./Funds";
import Holdings from "./Holdings";
import Orders from "./Orders";
import Positions from "./Positions";
import Summary from "./Summary";
import WatchList from "./WatchList";
import GuestBanner from "./GuestBanner";
import PageSkeleton from "./PageSkeleton";

const Analytics = lazy(() => import("./Analytics"));

const NotFound = () => (
  <div className="orders">
    <div className="no-orders">
      <p>This page does not exist.</p>
      <Link to="/" className="btn">
        Back to dashboard
      </Link>
    </div>
  </div>
);

const Dashboard = () => {
  return (
    <div className="dashboard-container">
      <WatchList />
      <main className="content">
        <GuestBanner />
        <Routes>
          <Route path="/" element={<Summary />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/holdings" element={<Holdings />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/funds" element={<Funds />} />
          <Route
            path="/analytics"
            element={
              <Suspense fallback={<PageSkeleton label="Loading analytics" kpis={6} chart rows={3} />}>
                <Analytics />
              </Suspense>
            }
          />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/apps" element={<Navigate to="/alerts" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <footer className="app-footer">
          Simulated trading with virtual money — not investment advice. Market data by{" "}
          <a href="https://finnhub.io" target="_blank" rel="noreferrer">
            Finnhub
          </a>
          .
        </footer>
      </main>
    </div>
  );
};

export default Dashboard;
