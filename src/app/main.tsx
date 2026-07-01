import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lib/i18n";
import { applyTheme } from "./themes/apply";
import { defaultThemeId } from "./themes";

// 첫 페인트 전에 기본 테마 토큰을 주입해 FOUC(무테마 깜빡임)를 방지.
applyTheme(defaultThemeId);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
