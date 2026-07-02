import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lib/i18n";
import { applyTheme } from "./themes/apply";
import { useAppStore } from "./store";

// 첫 페인트 전에 (영속화된) 테마 토큰을 주입해 FOUC 방지.
applyTheme(useAppStore.getState().themeId);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
