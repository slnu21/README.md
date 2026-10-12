/**
 * 표시 펜 색(ADR 0003 5절) — 이름으로 저장하고 **실제 색은 테마가 정한다**.
 *
 * 색마다 둘: `ink`(형광펜·세로줄 — 글자 *밑* 띠) · `lead`(색연필 — 글자 *위* 선·기호).
 * 테마가 한 항목도 안 적어도 동작하도록 5토큰에서 파생한다. 대비 하한을 계산으로 지킨다:
 * - ink 위 본문(--fg) 4.5:1 — 칠한 글자가 읽혀야 한다. 못 지키면 잉크를 바탕 쪽으로 옅게 한다.
 * - lead 와 바탕(--bg) 3:1 — 글자가 아닌 그래픽의 하한(WCAG 1.4.11). 못 지키면 글자색 쪽으로 진하게.
 * **무채색 테마(전자잉크)는 다섯 색을 회색 농도로 떨어뜨린다** — 뜻은 펜 *모양*이 전한다.
 *
 * CSS 로 파생하지 않고 여기서 hex 를 구하는 이유: 대비 하한을 브라우저 없이 테스트해야 해서다
 * (prose 토큰과 달리 하한을 못 지키면 값을 *고쳐야* 한다 — color-mix 로는 조건을 못 건다).
 */
import { contrastRatio, mixHex, normalizeHex } from "../color";
import type { Theme } from "../../themes";
import { COLORS, type AnnotColor } from "./pens";

const HUE_LIGHT: Record<AnnotColor, { ink: string; lead: string }> = {
  yellow: { ink: "#ffd23f", lead: "#a87300" },
  orange: { ink: "#ffa95a", lead: "#b8561c" },
  pink: { ink: "#ff8fb6", lead: "#c0304e" },
  green: { ink: "#8fe07c", lead: "#23803a" },
  blue: { ink: "#86c9ff", lead: "#1f5fbf" },
};
const HUE_DARK: Record<AnnotColor, { ink: string; lead: string }> = {
  yellow: { ink: "#f7d000", lead: "#f0c94a" },
  orange: { ink: "#ff8a1f", lead: "#ffad6b" },
  pink: { ink: "#ff4f8f", lead: "#ff8aa8" },
  green: { ink: "#4ed35a", lead: "#7fd98c" },
  blue: { ink: "#3aa8ff", lead: "#86b8ff" },
};
const GRAY_STEP: Record<AnnotColor, number> = { yellow: 0.14, orange: 0.2, pink: 0.26, green: 0.32, blue: 0.38 };

export const INK_MIN = 4.5;
export const LEAD_MIN = 3;

export interface MarkColor {
  ink: string;
  lead: string;
}

/** 무채색인가 — 강조색까지 회색이면(전자잉크) 색을 쓰지 않는 테마다. */
export function isAchromatic(theme: Theme): boolean {
  const a = normalizeHex(theme.tokens["--accent"]);
  if (!a) return false;
  const c = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  return Math.max(...c) - Math.min(...c) < 12;
}

export function markPalette(theme: Theme): Record<AnnotColor, MarkColor> {
  const bg = normalizeHex(theme.tokens["--bg"]) ?? "#ffffff";
  const fg = normalizeHex(theme.tokens["--fg"]) ?? "#000000";
  const dark = theme.type === "dark";
  const gray = isAchromatic(theme);
  const out = {} as Record<AnnotColor, MarkColor>;
  for (const c of COLORS) {
    let inkHue: string;
    let inkAmt: number;
    let lead: string;
    if (gray) {
      inkHue = fg;
      inkAmt = GRAY_STEP[c];
      lead = mixHex(fg, bg, 0.55 + GRAY_STEP[c]);
    } else {
      const h = (dark ? HUE_DARK : HUE_LIGHT)[c];
      inkHue = h.ink;
      inkAmt = dark ? 0.32 : 0.6;
      lead = h.lead;
    }
    // ink: 본문이 읽히도록 — 못 지키면 옅게.
    let ink = mixHex(inkHue, bg, inkAmt);
    for (let t = inkAmt; t > 0.05 && contrastRatio(fg, ink) < INK_MIN; t -= 0.03) ink = mixHex(inkHue, bg, t);
    // lead: 바탕 위에서 보이도록 — 못 지키면 글자색 쪽으로.
    for (let t = 0.1; t <= 1 && contrastRatio(lead, bg) < LEAD_MIN; t += 0.1) lead = mixHex(fg, lead, t);
    out[c] = { ink, lead };
  }
  return out;
}

/** iframe `:root` 에 넣을 선언(themeVarsCss 가 붙인다). 값은 전부 계산한 6자리 hex 다. */
export function markVarsCss(theme: Theme): string {
  const p = markPalette(theme);
  return COLORS.map((c) => `--mark-${c}-ink:${p[c].ink};--mark-${c}-lead:${p[c].lead};`).join("");
}
