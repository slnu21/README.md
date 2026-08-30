// 미리보기(리딩) 서식 색 토큰. 순수 — DOM 없이 테스트한다(themes/prose.test.ts).
//
// **왜 tokens 5개와 따로 두나**: lib/mermaid.ts diagramConfig() 는 tokens 에서 --bg/--fg/--accent/
// --surface 를 **이름으로** 꺼내 mermaid themeVariables 를 만들고, mermaid.test.ts 가 그 결과에
// /^#[0-9a-f]{6}$/i 를 강제한다. prose 를 tokens 에 섞으면 그 계약을 흔들 이유가 없다.
//
// **왜 기본값이 CSS 에 있나**(PROSE_DEFAULT_CSS): 테마가 한 항목도 안 적어도 동작해야 하고
// (사용자 테마의 최소 기재량 = 0), 파생을 CSS color-mix 에 맡기면 테마가 지정한 값만 주입하면 되어
// 재빌드마다 나가는 바이트가 절반이 된다. **순서가 계약이다** — 같은 특정도라 나중이 이기므로
// PROSE_DEFAULT_CSS 가 테마 :root 보다 **앞**에 와야 한다(renderDoc.ts buildDoc, 테스트로 못박음).

/** 사용자 테마 파일이 쓰는 키 이름. 값은 전부 6자리 hex(linkUnderline 만 불리언). */
export interface ProseTokens {
  heading: string;
  headingRule: string;
  link: string;
  linkUnderline: boolean;
  quote: string;
  quoteBar: string;
  quoteBg: string;
  code: string;
  codeBg: string;
  preBg: string;
  marker: string;
  rule: string;
  tableHead: string;
  tableZebra: string;
  markBg: string;
  muted: string;
  selection: string;
  note: string;
  warn: string;
  tip: string;
  error: string;
  synKey: string;
  synStr: string;
}

/** 파일 키 → CSS 변수. 사용자 파일의 유일한 어휘이므로 여기가 진실원이다. */
export const PROSE_VAR: Record<keyof ProseTokens, string> = {
  heading: "--prose-heading",
  headingRule: "--prose-heading-rule",
  link: "--prose-link",
  linkUnderline: "--prose-link-deco",
  quote: "--prose-quote",
  quoteBar: "--prose-quote-bar",
  quoteBg: "--prose-quote-bg",
  code: "--prose-code",
  codeBg: "--prose-code-bg",
  preBg: "--prose-pre-bg",
  marker: "--prose-marker",
  rule: "--prose-rule",
  tableHead: "--prose-table-head",
  tableZebra: "--prose-table-zebra",
  markBg: "--prose-mark-bg",
  muted: "--prose-muted",
  selection: "--prose-selection",
  note: "--prose-note",
  warn: "--prose-warn",
  tip: "--prose-tip",
  error: "--prose-error",
  synKey: "--prose-syn-key",
  synStr: "--prose-syn-str",
};

export const PROSE_KEYS = Object.keys(PROSE_VAR) as Array<keyof ProseTokens>;

/** linkUnderline 만 색이 아니다 — 검증·직렬화에서 갈라 쓴다. */
export const PROSE_BOOL_KEYS: ReadonlyArray<keyof ProseTokens> = ["linkUnderline"];

export type Texture = "none" | "hanji";
export type Elevation = "soft" | "flat";

/** 질감은 열거값 → 사전 정의 상수다. 사용자 CSS 문자열을 그대로 받지 않는다:
 *  커스텀 속성 값에 `;` 와 `}` 를 넣으면 스타일 블록을 벗어날 수 있기 때문(내 파일이라 보안
 *  경계는 아니지만, 값을 hex·열거값으로 좁히면 그 경로가 구조적으로 사라진다).
 *  한지 = 손으로 뜬 종이에 남는 가로 발(簾)자국. 자산 0바이트·필터 없음이라 확대에도 안전하다. */
export const TEXTURE_CSS: Record<Texture, string> = {
  none: "none",
  hanji:
    "repeating-linear-gradient(0deg,transparent 0 3px," +
    "color-mix(in srgb,var(--fg) 2.2%,transparent) 3px 4px)",
};

/** 리딩 카드 그림자. flat = 그림자 없는 전자잉크 화면. */
export const CARD_SHADOW: Record<Elevation, string> = {
  soft: "0 1px 2px rgba(0,0,0,.05),0 10px 30px rgba(0,0,0,.05)",
  flat: "none",
};

/** 앱 크롬(App.css --shadow)용. themes/apply.ts 가 쓴다. */
export const APP_SHADOW: Record<Elevation, { light: string; dark: string }> = {
  soft: {
    light: "0 1px 2px rgba(20,20,20,.05), 0 14px 40px rgba(20,20,20,.12)",
    dark: "0 1px 2px rgba(0,0,0,.4), 0 18px 44px rgba(0,0,0,.55)",
  },
  flat: {
    light: "0 0 0 1px color-mix(in srgb,var(--fg) 10%,transparent)",
    dark: "0 0 0 1px color-mix(in srgb,var(--fg) 18%,transparent)",
  },
};

/** 지정하지 않은 항목의 기본값. 전부 5토큰에서 파생되므로 새 테마가 prose 를 안 적어도 동작한다.
 *  대비 하한은 themes/contrast.test.ts 가 지킨다(인용문 62%는 paper 에서 4.08 로 떨어져 70%로 올렸다). */
export const PROSE_DEFAULT_CSS =
  ":root{" +
  "--prose-heading:color-mix(in srgb,var(--fg) 88%,var(--accent));" +
  "--prose-heading-rule:var(--border);" +
  "--prose-link:var(--accent);" +
  "--prose-link-deco:none;" +
  "--prose-quote:color-mix(in srgb,var(--fg) 70%,var(--bg));" +
  "--prose-quote-bar:var(--accent);" +
  "--prose-quote-bg:color-mix(in srgb,var(--accent) 5%,var(--bg));" +
  "--prose-code:color-mix(in srgb,var(--accent) 55%,var(--fg));" +
  "--prose-code-bg:color-mix(in srgb,var(--accent) 12%,var(--bg));" +
  "--prose-pre-bg:color-mix(in srgb,var(--fg) 5%,var(--bg));" +
  "--prose-marker:color-mix(in srgb,var(--accent) 70%,var(--fg));" +
  "--prose-rule:var(--border);" +
  "--prose-table-head:var(--surface);" +
  "--prose-table-zebra:color-mix(in srgb,var(--surface) 45%,var(--bg));" +
  "--prose-mark-bg:color-mix(in srgb,var(--accent) 22%,var(--bg));" +
  "--prose-muted:color-mix(in srgb,var(--fg) 76%,var(--bg));" +
  "--prose-selection:color-mix(in srgb,var(--accent) 26%,var(--bg));" +
  "--prose-note:var(--accent);" +
  "--prose-warn:#d97706;" +
  "--prose-tip:#059669;" +
  "--prose-error:#c0392b;" +
  "--prose-syn-key:color-mix(in srgb,var(--accent) 80%,var(--fg));" +
  "--prose-syn-str:color-mix(in srgb,var(--accent) 52%,var(--fg));" +
  `--paper-texture:${TEXTURE_CSS.none};` +
  `--prose-card-shadow:${CARD_SHADOW.soft}` +
  "}";

type CoreVar = "--bg" | "--fg" | "--accent" | "--surface" | "--border";

/** 위 color-mix 기본값을 JS 로 다시 적은 것 — 대비 테스트가 브라우저 없이 같은 색을 구해야 하기
 *  때문이다. `resolved = mixHex(a, b, t)`. **PROSE_DEFAULT_CSS 와 손으로 맞춰 둔 짝**이라
 *  한쪽만 고치면 테스트가 거짓 통과한다 → themes/prose.test.ts 가 두 문자열을 대조해 막는다. */
export const PROSE_DERIVED: ReadonlyArray<{
  key: keyof ProseTokens;
  a: CoreVar;
  b: CoreVar;
  t: number;
}> = [
  { key: "heading", a: "--fg", b: "--accent", t: 0.88 },
  { key: "quote", a: "--fg", b: "--bg", t: 0.7 },
  { key: "quoteBg", a: "--accent", b: "--bg", t: 0.05 },
  { key: "code", a: "--accent", b: "--fg", t: 0.55 },
  { key: "codeBg", a: "--accent", b: "--bg", t: 0.12 },
  { key: "preBg", a: "--fg", b: "--bg", t: 0.05 },
  { key: "marker", a: "--accent", b: "--fg", t: 0.7 },
  { key: "tableZebra", a: "--surface", b: "--bg", t: 0.45 },
  { key: "markBg", a: "--accent", b: "--bg", t: 0.22 },
  { key: "muted", a: "--fg", b: "--bg", t: 0.76 },
  { key: "selection", a: "--accent", b: "--bg", t: 0.26 },
  { key: "synKey", a: "--accent", b: "--fg", t: 0.8 },
  { key: "synStr", a: "--accent", b: "--fg", t: 0.52 },
];
