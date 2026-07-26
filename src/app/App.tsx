import { useEffect } from "react";
import { useAppStore } from "./store";
import { applyTheme } from "./themes/apply";
import { monoStack, readStack, uiStack, BASE_EDITOR_PX } from "./lib/fonts";
import i18n from "./lib/i18n";
import { AppShell } from "./shell/AppShell";
import "./App.css";

function App() {
  const themeId = useAppStore((s) => s.themeId);
  const language = useAppStore((s) => s.language);
  const fontMono = useAppStore((s) => s.fontMono);
  const fontRead = useAppStore((s) => s.fontRead);
  const fontUi = useAppStore((s) => s.fontUi);
  const editorZoom = useAppStore((s) => s.editorZoom);

  // store 상태를 DOM/i18n에 반영. 테마 토글·언어 토글의 단일 경로.
  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [language]);

  // 글꼴/줌을 :root CSS 변수로 반영 → 에디터(--mono-font, --editor-font-size)는 즉시 갱신.
  // 미리보기(iframe)는 격리돼 있어 별도로 buildDoc에 주입한다(Preview.tsx).
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--mono-font", monoStack(fontMono));
    root.setProperty("--read-font", readStack(fontRead));
    root.setProperty("--ui-font", uiStack(fontUi));
    // 에디터 폰트크기·줄높이는 정수 px로 고정. 분수 값(예 13*1.62=21.06px)은 줄바꿈(wrap)된
    // 여러 줄짜리 행에서 CM 높이모델과 실제 렌더가 행 수만큼 누적으로 어긋나, 스크롤 후
    // 커서/거터가 밀리는 원인이 된다(정수화하면 측정=실제=모델로 드리프트 0).
    const px = Math.round(BASE_EDITOR_PX * editorZoom);
    root.setProperty("--editor-font-size", `${px}px`);
    root.setProperty("--editor-line-height", `${Math.round(px * 1.62)}px`);
  }, [fontMono, fontRead, fontUi, editorZoom]);

  // 데스크톱 앱답게 기본 우클릭(브라우저) 메뉴 억제 — 새로고침/저장/인쇄/검사 등이 뜨지 않게.
  // 에디터는 Editor.tsx의 커스텀 메뉴(서식+클립보드)가 뜨므로 브라우저 기본 메뉴도 억제.
  // preventDefault 만 하므로 React onContextMenu(워크스페이스/에디터 커스텀 메뉴)는 정상 동작. 미리보기 iframe은 Preview.tsx에서 별도 처리.
  useEffect(() => {
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
    }
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  return <AppShell />;
}

export default App;
