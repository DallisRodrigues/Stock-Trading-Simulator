import React from "react";

import Dashboard from "./Dashboard";
import TopBar from "./TopBar";
import { GeneralContextProvider } from "./GeneralContext";

const Home = () => {
  return (
    <GeneralContextProvider>
      <div className="app-shell">
        <TopBar />
        <Dashboard />
      </div>
    </GeneralContextProvider>
  );
};

export default Home;
