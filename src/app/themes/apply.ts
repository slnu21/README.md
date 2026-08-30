// 테마 토큰을 DOM(:root)에 주입한다. 테마 토글·초기화에서 공통 사용.
// themes/index.ts 레지스트리를 단일 진실원으로 삼아 CSS 변수를 설정하므로,
// 새 테마를 레지스트리에 추가하면 CSS 수정 없이 적용된다. (WBS 509/512)
import { themes, defaultThemeId, type Theme } from ".";
import { APP_SHADOW } from "./prose";

export function applyTheme(themeId: string): void {
  const theme: Theme = themes[themeId] ?? themes[defaultThemeId];
  const root = document.documentElement;

  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.type;

  // 그림자는 명도 방향이 반대이므로 테마 종류에 따라 결정(파생색은 CSS color-mix가 담당).
  // elevation:"flat" 은 전자잉크 화면처럼 그림자 없이 섬세한 테두리만 남긴다.
  // **분기마다 반드시 대입한다** — setProperty 는 속성을 지우지 않아서, 안 쓰면 직전 테마의
  // 값이 :root 에 그대로 남는다(flat → soft 로 되돌려도 그림자가 안 돌아오는 종류의 버그).
  const shadow = APP_SHADOW[theme.elevation ?? "soft"] ?? APP_SHADOW.soft;
  root.style.setProperty("--shadow", theme.type === "dark" ? shadow.dark : shadow.light);
}
