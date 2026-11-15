// 웹 에디션 화면 자원 — 웹 전용 문구(`web.*`)와 웹 전용 스타일. platform/web/index.ts 만 이 파일을 싣는다,
// 즉 `@platform` 이 웹으로 이어지는 빌드에만 들어간다. 데스크톱 로케일(locales/*.json)·App.css 는 손대지 않는다.
import i18n from "../../lib/i18n";
import en from "./locales/en.json";
import ko from "./locales/ko.json";
import "./web.css";

/** `web.*` 키를 기존 번역에 덧붙인다(깊은 병합 · 기존 키는 덮지 않는다). */
export function registerWebStrings(target: Pick<typeof i18n, "addResourceBundle"> = i18n): void {
  target.addResourceBundle("ko", "translation", { web: ko }, true, false);
  target.addResourceBundle("en", "translation", { web: en }, true, false);
}

registerWebStrings();

export { en as webEn, ko as webKo };
