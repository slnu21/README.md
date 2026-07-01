import { useEffect } from "react";
import { useAppStore } from "./store";
import { applyTheme } from "./themes/apply";
import i18n from "./lib/i18n";
import { AppShell } from "./shell/AppShell";
import "./App.css";

function App() {
  const themeId = useAppStore((s) => s.themeId);
  const language = useAppStore((s) => s.language);

  // store 상태를 DOM/i18n에 반영. 테마 토글·언어 토글의 단일 경로.
  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [language]);

  return <AppShell />;
}

export default App;
