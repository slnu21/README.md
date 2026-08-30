import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lib/i18n";
import { applyTheme } from "./themes/apply";
import { hydrateUserThemes, loadUserThemes } from "./themes/load";
import { useAppStore } from "./store";
import { applyDemoFromUrl } from "./shell/demoSeed";
import { FONT_FACE_CSS } from "./lib/fonts";

// 데모/스크린샷 시드(?demo=1). 실제 앱 로드에는 무동작.
applyDemoFromUrl();
// 사용자 테마를 먼저 레지스트리에 넣는다 — 캐시된 파일 원문을 **동기**로 파싱한다.
// 디스크 읽기를 기다렸다가 칠하면 사용자 테마를 쓰는 사람에게 light 가 한 번 번짝인다
// (창은 tauri.conf.json 에서 visible:false 가 아니라 프레임 0부터 화면에 있다).
hydrateUserThemes();
// 첫 페인트 전에 (영속화된) 테마 토큰을 주입해 FOUC 방지.
applyTheme(useAppStore.getState().themeId);
// 디스크가 진실원이다 — 달라졌으면 칠해진 뒤에 바로잡는다(themeRev 가 재적용을 부른다).
// Tauri 밖(데모·프로브)에서는 조용히 실패해 내장 테마로 남는다.
void loadUserThemes();
// 번들된 고급 폰트 @font-face 를 메인 문서에 등록(에디터·UI용). iframe 은 별도 주입(Preview.tsx).
const fontStyle = document.createElement("style");
fontStyle.textContent = FONT_FACE_CSS;
document.head.appendChild(fontStyle);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
