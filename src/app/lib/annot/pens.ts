/**
 * 펜 정의(ADR 0003 3절) — 붙는 자리 세 종류, 펜마다 **뜻**. 값은 Rust(`commands/annot.rs`)와 같은
 * 열거값이어야 한다(저장 때 거기서 다시 좁힌다). 뜻은 사용자가 바꿀 수 있고(`settings.annotMeanings`)
 * 브리지 `list_annotations` 가 에이전트에게 함께 준다 — 표시가 곧 지시가 된다.
 */

export type AnnotKind = "range" | "point" | "block";
export type RangeStyle = "highlight" | "underline" | "wavy" | "strike" | "circle";
export type PointStyle = "star" | "question" | "exclaim" | "check";
export type BlockStyle = "bar";
export type AnnotStyle = RangeStyle | PointStyle | BlockStyle;
export type AnnotColor = "yellow" | "orange" | "pink" | "green" | "blue";

export const RANGE_STYLES: readonly RangeStyle[] = ["highlight", "underline", "wavy", "strike", "circle"];
export const POINT_STYLES: readonly PointStyle[] = ["star", "question", "exclaim", "check"];
export const BLOCK_STYLES: readonly BlockStyle[] = ["bar"];
export const COLORS: readonly AnnotColor[] = ["yellow", "orange", "pink", "green", "blue"];

export function kindOf(style: AnnotStyle): AnnotKind {
  if ((RANGE_STYLES as readonly string[]).includes(style)) return "range";
  if ((POINT_STYLES as readonly string[]).includes(style)) return "point";
  return "block";
}

/** 글자 *밑*에 칠하는 펜(형광펜·세로줄) — 나머지는 글자 *위*(색연필). 다크에서도 글자가 안 묻힌다. */
export function isUnder(style: AnnotStyle): boolean {
  return style === "highlight" || style === "bar";
}

export type Meanings = Partial<Record<AnnotStyle, string>>;

/** 설정에 저장된 뜻(JSON). 망가졌거나 모르는 키·긴 값은 버린다 — 기본 뜻(i18n)이 대신한다. */
export function parseMeanings(raw: string | null | undefined): Meanings {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Meanings = {};
    const all = [...RANGE_STYLES, ...POINT_STYLES, ...BLOCK_STYLES] as string[];
    for (const [k, m] of Object.entries(v as Record<string, unknown>)) {
      if (all.includes(k) && typeof m === "string" && m.trim() && m.length <= 80) out[k as AnnotStyle] = m.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export const MEANINGS_KEY = "annotMeanings";
