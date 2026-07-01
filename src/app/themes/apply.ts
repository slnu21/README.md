// 테마 토큰을 DOM(:root)에 주입한다. 테마 토글·초기화에서 공통 사용.
// themes/index.ts 레지스트리를 단일 진실원으로 삼아 CSS 변수를 설정하므로,
// 새 테마를 레지스트리에 추가하면 CSS 수정 없이 적용된다. (WBS 509/512)
import { themes, defaultThemeId, type Theme } from ".";

export function applyTheme(themeId: string): void {
  const theme: Theme = themes[themeId] ?? themes[defaultThemeId];
  const root = document.documentElement;

  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.type;

  // 그림자는 명도 방향이 반대이므로 테마 종류에 따라 결정(파생색은 CSS color-mix가 담당).
  root.style.setProperty(
    "--shadow",
    theme.type === "dark"
      ? "0 1px 2px rgba(0,0,0,.4), 0 18px 44px rgba(0,0,0,.55)"
      : "0 1px 2px rgba(20,20,20,.05), 0 14px 40px rgba(20,20,20,.12)",
  );
}
