// 리딩 서식 색 토큰(prose)의 계약. 기하 계약은 renderDoc.test.ts 가 따로 지킨다.
//
// 여기서 막는 사고 세 가지:
//  (1) PREVIEW_CSS 가 쓰는 var(--prose-*) 에 기본값이 없어 **조용히 빈 값**으로 떨어지는 것
//  (2) 기본값 블록이 테마 :root 보다 **뒤에** 붙어 테마 지정을 덮어버리는 것(같은 특정도 = 나중이 승)
//  (3) 사용자 테마의 색 값이 `}` 나 </style> 을 품고 스타일 블록을 탈출하는 것
import { describe, expect, it } from "vitest";
import { PREVIEW_CSS, buildDoc, themeVarsCss } from "./renderDoc";
import { PROSE_DEFAULT_CSS, PROSE_KEYS, PROSE_VAR } from "../themes/prose";
import { themes } from "../themes";
import type { Theme } from "../themes";

/** buildDoc 은 document.documentElement.lang 한 곳만 읽는다(srcdoc 의 lang 결정).
 *  node 환경이라 그 한 줄만 세워 주고 진짜 조립 결과를 검사한다 — 순서 계약은 조립문에 있다. */
function withDocumentStub<T>(fn: () => T): T {
  const g = globalThis as { document?: unknown };
  const had = "document" in g;
  const prev = g.document;
  g.document = { documentElement: { lang: "ko" } };
  try {
    return fn();
  } finally {
    if (had) g.document = prev;
    else delete g.document;
  }
}

const FONT = { readStack: "serif", readerPx: 16 };

describe("prose 토큰 기본값", () => {
  it("PREVIEW_CSS 가 참조하는 모든 커스텀 속성에 기본값이 있다", () => {
    const used = [...PREVIEW_CSS.matchAll(/var\((--(?:prose-[a-z-]+|paper-texture))/g)].map(
      (m) => m[1],
    );
    expect(used.length).toBeGreaterThan(15); // 공허 통과 방지
    const missing = [...new Set(used)].filter((v) => !PROSE_DEFAULT_CSS.includes(`${v}:`));
    expect(missing).toEqual([]);
  });

  it("기본값은 PREVIEW_CSS 가 아니라 PROSE_DEFAULT_CSS 에 있다", () => {
    // PREVIEW_CSS 는 테마 :root 보다 **뒤**에 붙는다 → 여기에 기본값을 두면 테마를 전부 덮는다.
    expect(PREVIEW_CSS).not.toMatch(/--prose-[a-z-]+\s*:/);
    expect(PREVIEW_CSS).not.toMatch(/--paper-texture\s*:/);
  });

  it("PROSE_VAR 의 모든 키가 기본값을 갖는다", () => {
    const missing = PROSE_KEYS.filter((k) => !PROSE_DEFAULT_CSS.includes(`${PROSE_VAR[k]}:`));
    expect(missing).toEqual([]);
  });

  it("하드코딩 색이 남아 있지 않다", () =>
    expect(PREVIEW_CSS).not.toMatch(/#(d97706|059669|c0392b)/i));
});

describe("themeVarsCss", () => {
  it("5토큰을 그대로 내보낸다", () => {
    const css = themeVarsCss(themes.light);
    for (const [k, v] of Object.entries(themes.light.tokens)) expect(css).toContain(`${k}:${v};`);
  });

  it("질감과 그림자는 **무조건** 내보낸다 — setProperty 는 지우지 않으므로 안 쓰면 이전 테마 값이 남는다", () => {
    for (const t of Object.values(themes)) {
      expect(themeVarsCss(t)).toMatch(/--paper-texture:/);
      expect(themeVarsCss(t)).toMatch(/--prose-card-shadow:/);
    }
  });

  it("prose 를 안 적은 테마는 prose 변수를 하나도 안 내보낸다(기본값이 이긴다)", () => {
    const bare: Theme = { id: "x", name: "x", type: "light", tokens: themes.light.tokens };
    expect(themeVarsCss(bare)).not.toMatch(/--prose-(?!card-shadow)/);
  });

  it("linkUnderline:true 만 밑줄을 켠다", () => {
    const mk = (linkUnderline: boolean): Theme => ({
      ...themes.light,
      id: "x",
      prose: { linkUnderline },
    });
    expect(themeVarsCss(mk(true))).toContain("--prose-link-deco:underline;");
    expect(themeVarsCss(mk(false))).not.toContain("--prose-link-deco");
  });

  it.each([
    ["#fff;}body{display:none}"],
    ["</style><style>body{}"],
    ["red"],
    ["#abc"], // 정규화를 안 거친 값도 직렬화에서 막는다
    ["var(--fg)"],
    ["color-mix(in srgb,var(--fg) 50%,var(--bg))"],
  ])("탈출/비-hex 값 %s 은 버린다", (bad) => {
    const t: Theme = {
      ...themes.light,
      id: "x",
      tokens: { ...themes.light.tokens, "--bg": bad },
      prose: { heading: bad },
    };
    const css = themeVarsCss(t);
    expect(css).not.toContain(bad);
    expect(css).not.toContain("--bg:");
    expect(css).not.toContain("--prose-heading:");
    expect(css).not.toMatch(/[<}]/);
  });
});

describe("문서 조립 순서", () => {
  it("기본값 블록이 테마 :root 보다 앞에 온다", () => {
    const html = withDocumentStub(() => buildDoc("<p>x</p>", "paper", FONT));
    const iDefault = html.indexOf(PROSE_DEFAULT_CSS);
    const iTheme = html.indexOf(themeVarsCss(themes.paper));
    expect(iDefault).toBeGreaterThanOrEqual(0);
    expect(iTheme).toBeGreaterThan(iDefault);
  });

  it("PREVIEW_CSS 는 테마 :root 보다 뒤에 온다(요소 규칙이 변수 선언을 참조)", () => {
    const html = withDocumentStub(() => buildDoc("<p>x</p>", "paper", FONT));
    expect(html.indexOf(PREVIEW_CSS)).toBeGreaterThan(html.indexOf(themeVarsCss(themes.paper)));
  });

  it("없는 테마 id 는 기본 테마로 떨어진다", () => {
    const html = withDocumentStub(() => buildDoc("<p>x</p>", "no-such-theme", FONT));
    expect(html).toContain(themeVarsCss(themes.light));
  });
});
