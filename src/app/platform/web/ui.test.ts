// 웹 전용 문구 조각 — 데스크톱 로케일(locales/*.json)과 분리돼 있으므로 대칭·등록을 여기서 지킨다.
import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import ko from "./locales/ko.json";
import desktopKoRaw from "../../locales/ko.json?raw";
import { registerWebStrings } from "./ui";
import i18n from "../../lib/i18n";

describe("web locale fragment", () => {
  it("ko/en 키 집합이 같고 빈 문자열이 없다", () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    for (const v of [...Object.values(ko), ...Object.values(en)]) expect(typeof v === "string" && v.length > 0).toBe(true);
  });

  it("데스크톱 로케일에는 web.* 가 없다(데스크톱 번들 불변)", () => {
    // 원문으로 본다 — i18next 는 리소스 객체를 참조로 들고 깊은 병합하므로, 등록 뒤의 import 객체에는 web 이 붙어 있다.
    expect("web" in JSON.parse(desktopKoRaw)).toBe(false);
  });

  it("등록하면 web.* 가 번역에 붙고 기존 키는 그대로", () => {
    const calls: unknown[][] = [];
    registerWebStrings({ addResourceBundle: (...a: unknown[]) => (calls.push(a), i18n) } as never);
    expect(calls.map((c) => c[0])).toEqual(["ko", "en"]);
    expect(calls[0][2]).toEqual({ web: ko });
    expect(calls[0][4]).toBe(false); // 덮어쓰기 금지
    expect(i18n.getFixedT("ko")("web.toc")).toBe(ko.toc); // 모듈 로드 때 실제 등록
    expect(i18n.getFixedT("ko")("menu.save")).toBe("저장");
  });
});
