// 스타일 팩 — 테마가 색뿐 아니라 모양(CSS)까지 갖는 구조.
//
// 이 파일이 지키는 계약 셋:
//  (1) 우선순위는 하나의 원칙에서 나온다 — **내가 손으로 쓴 것이 남이 준 것을 이긴다.**
//  (2) 사용자 CSS 는 `<style>` 을 벗어날 수 없다(`</style>` 하나가 유일한 진짜 탈출구).
//  (3) 내보낸 팩을 다시 읽으면 같은 테마가 나온다(왕복).
import { describe, expect, it } from "vitest";
import {
  buildThemePack,
  parseThemeBundle,
  parseUserThemes,
  sanitizeThemeCss,
  type ThemeBundle,
} from "./custom";
import { BUILTIN_THEMES, type Theme } from ".";

const bundle = (b: Partial<ThemeBundle>): ThemeBundle => ({
  file: "C:/x/themes.jsonc",
  dir: "C:/x/themes",
  main: null,
  packs: [],
  styles: [],
  ...b,
});
const pack = (id: string, extra = ""): string =>
  `{"version":1,"themes":[{"id":"${id}","name":"${id}"${extra ? "," + extra : ""}}]}`;
const codes = (w: { code: string }[]): string[] => w.map((x) => x.code);

describe("우선순위 — 손으로 쓴 것이 이긴다", () => {
  it("내장 → 팩 → themes.jsonc 순으로 덮인다", () => {
    const r = parseThemeBundle(
      bundle({
        packs: [{ name: "a", text: pack("paper", '"name":"팩이 준 종이"') }],
        main: pack("paper", '"name":"내가 쓴 종이"'),
      }),
      BUILTIN_THEMES,
    );
    expect(r.themes.paper.name).toBe("내가 쓴 종이");
  });

  it("팩끼리 겹치면 파일명 뒤가 이긴다(Rust 가 정렬해 준 순서)", () => {
    const r = parseThemeBundle(
      bundle({
        packs: [
          { name: "01-first", text: pack("dup", '"name":"먼저"') },
          { name: "02-second", text: pack("dup", '"name":"나중"') },
        ],
      }),
      BUILTIN_THEMES,
    );
    expect(r.themes.dup.name).toBe("나중");
  });

  it("팩과 내 파일의 테마가 함께 남는다", () => {
    const r = parseThemeBundle(
      bundle({ packs: [{ name: "p", text: pack("from-pack") }], main: pack("mine") }),
      BUILTIN_THEMES,
    );
    expect(Object.keys(r.themes).sort()).toEqual(["from-pack", "mine"]);
  });

  it("빈 뭉치는 경고 없이 아무것도 안 만든다", () =>
    expect(parseThemeBundle(bundle({}), BUILTIN_THEMES)).toEqual({
      themes: {},
      styles: {},
      warnings: [],
    }));
});

describe("CSS 붙이기", () => {
  it("사이드카 <id>.css 가 테마에 붙는다", () => {
    const r = parseThemeBundle(
      bundle({ main: pack("mine"), styles: [{ name: "mine", text: "h2{color:red}" }] }),
      BUILTIN_THEMES,
    );
    expect(r.themes.mine.css).toBe("h2{color:red}");
  });

  it("팩 안 styles 인라인도 붙는다", () => {
    const r = parseThemeBundle(
      bundle({
        packs: [
          { name: "p", text: `{"version":1,"themes":[{"id":"got"}],"styles":{"got":"h1{}"}}` },
        ],
      }),
      BUILTIN_THEMES,
    );
    expect(r.themes.got.css).toBe("h1{}");
  });

  it("사이드카가 인라인을 이긴다(같은 원칙)", () => {
    const r = parseThemeBundle(
      bundle({
        packs: [
          { name: "p", text: `{"version":1,"themes":[{"id":"x"}],"styles":{"x":"/*inline*/"}}` },
        ],
        styles: [{ name: "x", text: "/*sidecar*/" }],
      }),
      BUILTIN_THEMES,
    );
    expect(r.themes.x.css).toBe("/*sidecar*/");
  });

  it("짝이 없는 CSS 파일은 조용히 무시된다", () => {
    const r = parseThemeBundle(
      bundle({ main: pack("mine"), styles: [{ name: "nobody", text: "h1{}" }] }),
      BUILTIN_THEMES,
    );
    expect(r.warnings).toEqual([]);
    expect(r.themes.mine.css).toBeUndefined();
  });
});

describe("sanitizeThemeCss — 문서를 벗어나지 못한다", () => {
  it.each([
    "</style><h1>가짜 제목</h1>",
    "h1{}</STYLE>",
    "h1{}< / style >",
    "h1{}</\tstyle>",
  ])("`</style>` 변형을 통째로 버린다: %s", (css) => {
    const r = sanitizeThemeCss(css, "x");
    expect(r.css).toBe("");
    expect(codes(r.warnings)).toEqual(["cssUnsafe"]);
  });

  it("정상 CSS 는 그대로 통과한다", () => {
    const css = "h2::before{content:'';width:4px;background:var(--prose-marker)}";
    expect(sanitizeThemeCss(css, "x")).toEqual({ css, warnings: [] });
  });

  it("너무 크면 버린다(부팅 캐시에도 들어가는 값이다)", () => {
    const r = sanitizeThemeCss("a{}".repeat(30000), "x");
    expect(r.css).toBe("");
    expect(codes(r.warnings)).toEqual(["cssTooLong"]);
  });

  it("@import 는 통과시키되 왜 안 되는지 알린다", () => {
    const r = sanitizeThemeCss("@import url(x.css); h1{}", "x");
    expect(r.css).toContain("h1{}"); // 브라우저가 무시하므로 버리지 않는다
    expect(codes(r.warnings)).toEqual(["cssImport"]);
  });

  it("위험한 CSS 를 가진 테마는 색은 살고 모양만 빠진다", () => {
    const r = parseThemeBundle(
      bundle({ main: pack("mine", '"tokens":{"bg":"#101010"}'), styles: [{ name: "mine", text: "</style>" }] }),
      BUILTIN_THEMES,
    );
    expect(r.themes.mine.tokens["--bg"]).toBe("#101010");
    expect(r.themes.mine.css).toBeUndefined();
    expect(codes(r.warnings)).toEqual(["cssUnsafe"]);
  });
});

describe("buildThemePack — 내보내기", () => {
  // 바탕은 가짜 테마다 — 내장 테마에 질감을 가진 것이 없다(v0.9.0 에서 한지가 파일로 내려갔다).
  // 여기서 재는 것은 "물려받은 값이 펼쳐지는가"이지 어느 테마를 물려받았는가가 아니다.
  const FIXTURE: Theme = {
    id: "fixture",
    name: "바탕",
    type: "light",
    texture: "hanji",
    tokens: { ...BUILTIN_THEMES.paper.tokens, "--border": "#d9cfb8" },
  };
  const BASE: Record<string, Theme> = { ...BUILTIN_THEMES, fixture: FIXTURE };
  const source = parseThemeBundle(
    bundle({
      main: `{"version":1,"themes":[{"id":"mine","name":"내 테마","extends":"fixture","type":"light",
        "tokens":{"bg":"#101010","accent":"#ff8800"},
        "prose":{"heading":"#ffffff","linkUnderline":true}}]}`,
      styles: [{ name: "mine", text: "h2::before{content:''}" }],
    }),
    BASE,
  ).themes.mine;

  it("파일 하나에 테마와 CSS 가 함께 담긴다", () => {
    const out = buildThemePack(source);
    expect(out).toContain('"styles"');
    expect(out).toContain("h2::before");
    expect(out.startsWith("//")).toBe(true); // 받는 사람이 보는 머리말
  });

  it("왕복해도 같은 테마가 나온다", () => {
    const round = parseThemeBundle(
      bundle({ packs: [{ name: "exported", text: buildThemePack(source) }] }),
      BUILTIN_THEMES,
    );
    expect(round.warnings).toEqual([]);
    expect(round.themes.mine).toEqual(source);
  });

  it("extends 로 물려받은 값까지 펼쳐 담는다 — 받는 쪽에 그 테마가 없어도 된다", () => {
    const out = buildThemePack(source);
    expect(out).not.toContain('"extends"');
    // 바탕에서 물려받은 질감과 테두리색이 실제 값으로 들어 있다
    expect(out).toContain('"texture": "hanji"');
    expect(out).toContain(FIXTURE.tokens["--border"]);
  });

  it("기본값인 항목은 적지 않는다(읽을 만한 파일로)", () => {
    const plain = parseUserThemes(`{"version":1,"themes":[{"id":"p"}]}`, BUILTIN_THEMES).themes.p;
    const out = buildThemePack(plain);
    expect(out).not.toContain('"texture"');
    expect(out).not.toContain('"elevation"');
    expect(out).not.toContain('"styles"');
  });

  it("내보낸 파일은 CSS 검증도 통과한다", () => {
    const round = parseThemeBundle(
      bundle({ packs: [{ name: "e", text: buildThemePack(source) }] }),
      BUILTIN_THEMES,
    );
    expect(round.themes.mine.css).toBe("h2::before{content:''}");
  });
});
