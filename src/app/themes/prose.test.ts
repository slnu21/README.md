// 서식 색 위계의 **가독성 하한**을 못박는다. 색을 넣는 것이 목적이 아니라 읽히게 하는 것이 목적이라,
// 새 테마를 추가하거나 파생 비율을 만질 때 대비가 조용히 무너지는 것을 여기서 막는다.
//
// 눈으로는 안 보이는 함정이 실제로 있었다: 인용문 기본값 color-mix(--fg 62%, --bg) 는
// paper 에서 4.08:1, hanji 에서 4.37:1 로 **본문보다 세 배 흐렸다**. 70%로 올려 5.1:1 을 만들었다.
import { describe, expect, it } from "vitest";
import { contrastRatio, isHex6, mixHex } from "../lib/color";
import { themes, type Theme, type ThemeTokens } from ".";
import { PROSE_DEFAULT_CSS, PROSE_DERIVED, PROSE_VAR, type ProseTokens } from "./prose";

const all = Object.entries(themes);

/** 기본 파생값을 JS 로 해석한다 — 테마가 직접 지정했으면 그 값이 이긴다(CSS 와 같은 우선순위). */
function resolved(theme: Theme, key: keyof ProseTokens): string {
  const own = theme.prose?.[key];
  if (typeof own === "string" && isHex6(own)) return own;
  const d = PROSE_DERIVED.find((x) => x.key === key);
  if (!d) throw new Error(`PROSE_DERIVED 에 ${key} 가 없다 — 이 헬퍼로 못 푸는 키다`);
  const tk = theme.tokens as ThemeTokens & Record<string, string>;
  return mixHex(tk[d.a], tk[d.b], d.t);
}

describe("PROSE_DERIVED 는 PROSE_DEFAULT_CSS 와 같은 식이다", () => {
  // 두 곳에 같은 비율을 손으로 적었다. 한쪽만 고치면 아래 대비 검사가 **거짓 통과**한다.
  const declared = new Map<string, { a: string; b: string; t: number }>();
  for (const m of PROSE_DEFAULT_CSS.matchAll(
    /(--[a-z-]+):color-mix\(in srgb,var\((--[a-z]+)\) ([\d.]+)%,var\((--[a-z]+)\)\)/g,
  )) {
    declared.set(m[1], { a: m[2], b: m[4], t: Number(m[3]) / 100 });
  }

  it("CSS 에서 color-mix 기본값을 읽어냈다", () => expect(declared.size).toBeGreaterThan(10));

  it.each(PROSE_DERIVED)("$key", (d) => {
    const got = declared.get(PROSE_VAR[d.key]);
    expect(got, `${PROSE_VAR[d.key]} 선언을 못 찾았다`).toBeDefined();
    expect(got).toEqual({ a: d.a, b: d.b, t: d.t });
  });

  it("CSS 의 모든 color-mix 기본값이 PROSE_DERIVED 에 있다(검사 누락 방지)", () => {
    const covered = new Set(PROSE_DERIVED.map((d) => PROSE_VAR[d.key]));
    expect([...declared.keys()].filter((k) => !covered.has(k))).toEqual([]);
  });
});

describe.each(all)("%s 테마", (_id, theme) => {
  const t = theme.tokens;

  it("5토큰이 6자리 hex 다 — mermaid 가 khroma 로 파생하므로 CSS 함수를 못 넘긴다", () => {
    for (const [k, v] of Object.entries(t)) expect(v, k).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("본문 대비 >= 7:1 (WCAG AAA)", () =>
    expect(contrastRatio(t["--fg"], t["--bg"])).toBeGreaterThanOrEqual(7));

  it("강조색 대비 >= 4.5:1 (바탕/면 둘 다)", () => {
    expect(contrastRatio(t["--accent"], t["--bg"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t["--accent"], t["--surface"])).toBeGreaterThanOrEqual(4.5);
  });

  it("제목 대비 >= 7:1", () =>
    expect(contrastRatio(resolved(theme, "heading"), t["--bg"])).toBeGreaterThanOrEqual(7));

  it("인용문이 자기 바탕 위에서 >= 4.5:1", () =>
    expect(
      contrastRatio(resolved(theme, "quote"), resolved(theme, "quoteBg")),
    ).toBeGreaterThanOrEqual(4.5));

  it("각주/캡션(muted) >= 4.5:1", () =>
    expect(contrastRatio(resolved(theme, "muted"), t["--bg"])).toBeGreaterThanOrEqual(4.5));

  it("인라인 코드가 자기 바탕 위에서 >= 4.5:1", () =>
    expect(
      contrastRatio(resolved(theme, "code"), resolved(theme, "codeBg")),
    ).toBeGreaterThanOrEqual(4.5));

  it("코드 하이라이트가 코드블록 바탕 위에서 >= 4.5:1", () => {
    const bg = resolved(theme, "preBg");
    expect(contrastRatio(resolved(theme, "synKey"), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(resolved(theme, "synStr"), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("목록 마커 >= 4.5:1", () =>
    expect(contrastRatio(resolved(theme, "marker"), t["--bg"])).toBeGreaterThanOrEqual(4.5));

  it("형광펜/줄무늬 위에서도 본문이 >= 4.5:1", () => {
    expect(contrastRatio(t["--fg"], resolved(theme, "markBg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t["--fg"], resolved(theme, "tableZebra"))).toBeGreaterThanOrEqual(4.5);
  });
});
