import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { BASE_PATH } from "./config";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <BrowserRouter basename={BASE_PATH || undefined}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
