import "./styles/index.css";
import React from "react";
import ReactDOM from "react-dom/client";
// Modified 2026-10-05: standalone QQ task editor entry point.
import { App } from "./bot/App";
import { Providers } from "./app/providers";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);

