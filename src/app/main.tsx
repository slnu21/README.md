import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lib/i18n";
import { applyTheme } from "./themes/apply";
import { useAppStore } from "./store";
import { applyDemoFromUrl } from "./shell/demoSeed";
import { FONT_FACE_CSS } from "./lib/fonts";

// 데모/스크린샷 시드(?demo=1). 실제 앱 로드에는 무동작.
applyDemoFromUrl();
// 첫 페인트 전에 (영속화된) 테마 토큰을 주입해 FOUC 방지.
applyTheme(useAppStore.getState().themeId);
// 번들된 고급 폰트 @font-face 를 메인 문서에 등록(에디터·UI용). iframe 은 별도 주입(Preview.tsx).
const fontStyle = document.createElement("style");
fontStyle.textContent = FONT_FACE_CSS;
document.head.appendChild(fontStyle);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
