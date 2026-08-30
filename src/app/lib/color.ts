// 색 값 검증·대비 계산. 순수 — DOM 없이 테스트한다(lib/color.test.ts).
//
// **왜 6자리 hex 만 받나**: 테마 5토큰은 mermaid 로 흘러간다. lib/mermaid.ts 의 mix() 는
// hex 를 parseInt(slice,16) 로 직접 파싱하고, mermaid 자체는 khroma 로 색을 파생하므로
// `color-mix()`·`var()`·`hsl()` 을 넘기면 렌더가 통째로 터진다(mermaid.test.ts 가 결과에
// /^#[0-9a-f]{6}$/i 를 강제한다). 사용자 테마 파일이 그 계약을 깨지 못하게 입구에서 좁힌다.

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

/** 이미 6자리 hex 인가. 직렬화 직전 마지막 관문으로도 쓴다. */
export function isHex6(v: unknown): v is string {
  return typeof v === "string" && HEX6.test(v);
}

/** `#abc`→`#aabbcc`, 대문자→소문자. 그 밖(rgb()·색이름·빈값·잘린 값)은 null. */
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (HEX6.test(s)) return s;
  if (HEX3.test(s)) return "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  return null;
}

/** sRGB 상대 휘도(WCAG 2.x). 입력은 정규화된 6자리 hex. */
export function relativeLuminance(hex: string): number {
  const n = normalizeHex(hex);
  if (!n) return 0;
  const ch = (i: number): number => {
    const c = parseInt(n.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
}

/** 명암비(1~21). 순서 무관. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** a 를 b 에 비율 t(0~1)로 섞는다 — CSS color-mix(a t%, b) 와 같은 결과의 hex.
 *  테마 기본 파생값은 CSS color-mix 가 계산하지만, **대비 테스트는 JS 에서 같은 색을
 *  구해야** 하므로 여기 둔다(브라우저 없이 검사하기 위해서다). */
export function mixHex(a: string, b: string, t: number): string {
  const na = normalizeHex(a);
  const nb = normalizeHex(b);
  if (!na || !nb) return "#000000";
  const part = (i: number): string => {
    const ca = parseInt(na.slice(1 + i * 2, 3 + i * 2), 16);
    const cb = parseInt(nb.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(ca * t + cb * (1 - t))
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + part(0) + part(1) + part(2);
}
