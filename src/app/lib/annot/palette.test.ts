import { describe, expect, it } from "vitest";
import { contrastRatio } from "../color";
import { BUILTIN_THEMES, type Theme } from "../../themes";
import { parseUserThemes } from "../../themes/custom";
import { SEED_FILES } from "../../themes/seeds";
import { INK_MIN, LEAD_MIN, isAchromatic, markPalette, markVarsCss } from "./palette";
import { COLORS } from "./pens";

/** 내장 셋 + 시드 파일 셋(한지·전자잉크·컬러 전자잉크) — 앱이 기본으로 주는 테마 전부. */
function allThemes(): Theme[] {
  const out: Theme[] = Object.values(BUILTIN_THEMES);
  let base: Record<string, Theme> = { ...BUILTIN_THEMES };
  for (const s of SEED_FILES) {
    if (!s.name.endsWith(".jsonc")) continue;
    const parsed = parseUserThemes(s.text, base);
    out.push(...Object.values(parsed.themes));
    base = { ...base, ...parsed.themes };
  }
  return out;
}

describe("표시 펜 색", () => {
  const themes = allThemes();

  it("시드 테마까지 여섯을 다 본다", () => {
    expect(themes.map((t) => t.id).sort()).toEqual(["dark", "epaper", "epaper-color", "hanji", "light", "paper"]);
  });

  for (const th of allThemes()) {
    it(`${th.id}: 형광펜 위 본문 ${INK_MIN}:1 · 색연필 ${LEAD_MIN}:1`, () => {
      const p = markPalette(th);
      for (const c of COLORS) {
        expect(contrastRatio(th.tokens["--fg"], p[c].ink), `${c} ink`).toBeGreaterThanOrEqual(INK_MIN);
        expect(contrastRatio(p[c].lead, th.tokens["--bg"]), `${c} lead`).toBeGreaterThanOrEqual(LEAD_MIN);
        expect(p[c].ink).not.toBe(th.tokens["--bg"]); // 칠한 게 보여야 한다
      }
    });
  }

  it("다섯 색은 서로 다르다(무채색 테마에서도 농도가 다르다)", () => {
    for (const th of themes) {
      const inks = new Set(COLORS.map((c) => markPalette(th)[c].ink));
      expect(inks.size, th.id).toBe(5);
    }
  });

  it("전자잉크는 회색, 컬러 전자잉크는 색", () => {
    const by = Object.fromEntries(themes.map((t) => [t.id, t]));
    expect(isAchromatic(by["epaper"])).toBe(true);
    expect(isAchromatic(by["epaper-color"])).toBe(false);
    const ink = markPalette(by["epaper"]).yellow.ink;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(16);
  });

  it("극단 사용자 테마(본문 대비가 낮은 다크)에서도 하한을 계산으로 지킨다", () => {
    const th: Theme = {
      id: "x",
      name: "x",
      type: "dark",
      tokens: { "--bg": "#202020", "--fg": "#9a9a9a", "--accent": "#ff00aa", "--surface": "#252525", "--border": "#333333" },
    };
    const p = markPalette(th);
    for (const c of COLORS) expect(contrastRatio(th.tokens["--fg"], p[c].ink)).toBeGreaterThanOrEqual(INK_MIN);
  });

  it("CSS 선언은 6자리 hex 뿐", () => {
    const css = markVarsCss(BUILTIN_THEMES.light);
    expect(css).toMatch(/^(--mark-[a-z]+-(ink|lead):#[0-9a-f]{6};)+$/);
    expect(css.match(/--mark-/g)).toHaveLength(10);
  });
});
