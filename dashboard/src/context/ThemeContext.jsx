import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createTheme, ThemeProvider } from "@mui/material";
import ChartJS from "../charts/setup";
import { cssVar, setSeriesMode } from "../charts/palette";

const STORAGE_KEY = "theme";
const ThemeModeContext = createContext({ mode: "light", toggle: () => {} });

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function applyMode(mode) {
  document.documentElement.dataset.theme = mode;
  setSeriesMode(mode);
  ChartJS.defaults.color = cssVar("--text-muted");
  ChartJS.defaults.borderColor = cssVar("--border-subtle");
}

const initialMode = readStored() || "light";
applyMode(initialMode);

export function ThemeModeProvider({ children }) {
  const [mode, setMode] = useState(initialMode);

  const toggle = useCallback(() => {
    setMode((m) => {
      const next = m === "dark" ? "light" : "dark";
      applyMode(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: mode === "dark" ? "#5c9cff" : "#4184f3" },
          background: mode === "dark" ? { default: "#121418", paper: "#1e2127" } : { default: "#ffffff", paper: "#ffffff" },
        },
        typography: { fontFamily: cssVar("--font") || "sans-serif" },
        shape: { borderRadius: 4 },
      }),
    [mode]
  );

  return (
    <ThemeModeContext.Provider value={{ mode, toggle }}>
      <ThemeProvider theme={muiTheme}>{children(mode)}</ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export const useThemeMode = () => useContext(ThemeModeContext);
