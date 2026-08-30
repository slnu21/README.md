// 색 검증·대비. 이 파일이 지키는 계약은 하나다 — **쓰레기 색이 mermaid 까지 못 간다.**
// lib/mermaid.ts mix() 는 hex 만 파싱하고 khroma 는 CSS 함수를 못 먹는다.
import { describe, expect, it } from "vitest";
import { contrastRatio, isHex6, mixHex, normalizeHex, relativeLuminance } from "./color";

describe("normalizeHex", () => {
  it.each([
    ["#abc", "#aabbcc"],
    ["#ABC", "#aabbcc"],
    ["#A1B2C3", "#a1b2c3"],
    ["  #fff  ", "#ffffff"],
    ["#000000", "#000000"],
  ])("%s → %s", (input, want) => expect(normalizeHex(input)).toBe(want));

  it.each([
    ["red"],
    ["rgb(1,2,3)"],
    ["hsl(20 50% 40%)"],
    ["color-mix(in srgb, red 50%, blue)"],
    ["var(--bg)"],
    ["#abcd"],
    ["#12345g"],
    ["#"],
    [""],
    ["aabbcc"],
  ])("%s 는 거절한다", (input) => expect(normalizeHex(input)).toBeNull());

  it.each([[null], [undefined], [42], [{}], [["#fff"]]])(
    "문자열이 아니면 거절한다: %s",
    (input) => expect(normalizeHex(input)).toBeNull(),
  );
});

describe("isHex6", () => {
  it("직렬화 직전 관문 — 6자리만 통과", () => {
    expect(isHex6("#a1b2c3")).toBe(true);
    expect(isHex6("#abc")).toBe(false); // 정규화를 거치지 않은 값은 못 나간다
    expect(isHex6("color-mix(in srgb,var(--fg) 70%,var(--bg))")).toBe(false);
    expect(isHex6("#fff;}body{display:none}")).toBe(false); // CSS 탈출 시도
  });
});

describe("contrastRatio", () => {
  it("흑백은 21:1", () => expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5));
  it("같은 색은 1:1", () => expect(contrastRatio("#3a7bd5", "#3a7bd5")).toBeCloseTo(1, 10));
  it("순서와 무관하다", () =>
    expect(contrastRatio("#123456", "#fedcba")).toBeCloseTo(contrastRatio("#fedcba", "#123456"), 10));
  it("3자리 hex 도 받는다", () =>
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5));
});

describe("relativeLuminance", () => {
  it("흰색 1, 검정 0", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 10);
  });
  it("녹색이 청색보다 밝다(계수 0.7152 vs 0.0722)", () =>
    expect(relativeLuminance("#00ff00")).toBeGreaterThan(relativeLuminance("#0000ff")));
});

describe("mixHex — CSS color-mix(in srgb) 와 같은 결과", () => {
  // in srgb 는 감마 인코딩된 좌표를 선형 보간한다 → 0~255 채널 lerp 와 일치.
  it("t=1 이면 a, t=0 이면 b", () => {
    expect(mixHex("#112233", "#ffffff", 1)).toBe("#112233");
    expect(mixHex("#112233", "#ffffff", 0)).toBe("#ffffff");
  });
  it("절반은 중간값", () => expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080"));
  it("잘못된 입력은 검정으로 떨어진다(테스트에서만 쓰는 함수 — 조용히 NaN 을 퍼뜨리지 않는다)", () =>
    expect(mixHex("red", "#fff", 0.5)).toBe("#000000"));
});
