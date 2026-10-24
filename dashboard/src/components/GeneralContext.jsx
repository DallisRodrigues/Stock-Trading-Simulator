import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";

import OrderWindow from "./OrderWindow";
import AlertDialog from "./AlertDialog";
import { useCommandPalette } from "./useCommandPalette";
import { useMarketData } from "../context/MarketDataContext";

const AnalyticsWindow = lazy(() => import("./AnalyticsWindow"));
const CommandPalette = lazy(() => import("./CommandPalette"));

const GeneralContext = React.createContext({
  openBuyWindow: (_symbol) => {},
  openSellWindow: (_symbol) => {},
  closeOrderWindow: () => {},
  openAnalytics: (_symbol) => {},
  openAlertDialog: (_symbol) => {},
  openPalette: () => {},
  portfolioVersion: 0,
  portfolioChanged: () => {},
});

export const GeneralContextProvider = (props) => {
  const [orderWindow, setOrderWindow] = useState(null);
  const [analyticsSymbol, setAnalyticsSymbol] = useState(null);
  const [alertSymbol, setAlertSymbol] = useState(null);
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  const { onEvent } = useMarketData();
  const palette = useCommandPalette();

  const openBuyWindow = useCallback((symbol) => setOrderWindow({ symbol, side: "BUY" }), []);
  const openSellWindow = useCallback((symbol) => setOrderWindow({ symbol, side: "SELL" }), []);
  const closeOrderWindow = useCallback(() => setOrderWindow(null), []);
  const portfolioChanged = useCallback(() => setPortfolioVersion((v) => v + 1), []);

  useEffect(() => onEvent("portfolio:changed", portfolioChanged), [onEvent, portfolioChanged]);

  return (
    <GeneralContext.Provider
      value={{
        openBuyWindow,
        openSellWindow,
        closeOrderWindow,
        openAnalytics: setAnalyticsSymbol,
        openAlertDialog: setAlertSymbol,
        openPalette: () => palette.setOpen(true),
        portfolioVersion,
        portfolioChanged,
      }}
    >
      {props.children}
      <Suspense fallback={null}>
        {palette.open && <CommandPalette open onClose={() => palette.setOpen(false)} />}
        {analyticsSymbol && <AnalyticsWindow symbol={analyticsSymbol} onClose={() => setAnalyticsSymbol(null)} />}
      </Suspense>
      {orderWindow && <OrderWindow key={`${orderWindow.side}-${orderWindow.symbol}`} {...orderWindow} />}
      {alertSymbol && <AlertDialog symbol={alertSymbol} onClose={() => setAlertSymbol(null)} onCreated={portfolioChanged} />}
    </GeneralContext.Provider>
  );
};

export default GeneralContext;
