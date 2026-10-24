import React from "react";

import Home from "./components/Home";
import { AuthProvider } from "./context/AuthContext";
import { MarketDataProvider } from "./context/MarketDataContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ThemeModeProvider } from "./context/ThemeContext";
import "./App.css";
import "./theme.css";

function App() {
  return (
    <ThemeModeProvider>
      {(mode) => (
        <NotificationProvider>
          <AuthProvider>
            <MarketDataProvider>
              <Home key={mode} />
            </MarketDataProvider>
          </AuthProvider>
        </NotificationProvider>
      )}
    </ThemeModeProvider>
  );
}

export default App;
