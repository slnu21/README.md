// 앱이 처음 넣어 주는 테마 팩(themes/seeds.ts). **사용자가 가장 먼저 여는 파일들**이라
// 오타 하나가 곧 부팅 직후의 경고 토스트다 — 우리 파서가 경고 없이 읽는지 여기서 못박는다.
//
// 대비 하한은 themes/prose.test.ts 가 내장 테마와 **같은 잣대**로 함께 잰다(seedThemes 를 쓴다).
// 여기서는 팩이 팩으로서 온전한지를 본다: 파싱 · 사이드카 결합 · 왕복 · 제목 색 사다리.
import { describe, expect, it } from "vitest";
import { contrastRatio, isHex6 } from "../lib/color";
import {
  buildThemePack,
  parseThemeBundle,
  sanitizeThemeCss,
  type ThemeBundle,
} from "./custom";
import { HEADING_LADDER_CSS, SEED_FILES, SEED_VERSION, seedEntries } from "./seeds";
import { BUILTIN_THEMES } from ".";

/** 시드를 진짜 폴더처럼 뭉친다 — Rust 가 확장자로 갈라 담는 것과 같은 모양. */
function seedBundle(): ThemeBundle {
  return {
    file: "C:/x/themes.jsonc",
    dir: "C:/x/themes",
    main: null,
    packs: seedEntries(".jsonc"),
    styles: seedEntries(".css"),
  };
}

const parsed = parseThemeBundle(seedBundle(), BUILTIN_THEMES);

describe("시드 팩", () => {
  it("경고 하나 없이 읽힌다", () => expect(parsed.warnings).toEqual([]));

  it("세 테마가 나온다", () =>
    expect(Object.keys(parsed.themes).sort()).toEqual(["epaper", "epaper-color", "hanji"]));

  it("내장 테마를 덮어쓰지 않는다 — 셋은 새 id 다", () => {
    for (const id of Object.keys(parsed.themes)) expect(BUILTIN_THEMES[id]).toBeUndefined();
  });

  it("파일명 번호가 목록 순서를 정한다(읽는 순서 = 우선순위)", () => {
    // 번호가 없으면 'epaper-color' 가 'epaper' 보다 먼저 와 목록이 뒤집힌다.
    expect(SEED_FILES.filter((f) => f.name.endsWith(".jsonc")).map((f) => f.name)).toEqual([
      "10-hanji.jsonc",
      "20-epaper.jsonc",
      "30-epaper-color.jsonc",
    ]);
    expect(Object.keys(parsed.themes)).toEqual(["hanji", "epaper", "epaper-color"]);
  });

  it("모든 색이 6자리 hex 다", () => {
    for (const t of Object.values(parsed.themes)) {
      for (const [k, v] of Object.entries(t.tokens)) expect(v, k).toSatisfy(isHex6);
      for (const [k, v] of Object.entries(t.prose ?? {})) {
        if (typeof v === "string") expect(v, k).toSatisfy(isHex6);
      }
    }
  });

  it("사이드카 CSS 가 짝을 찾아 붙는다", () => {
    expect(parsed.themes.epaper.css).toContain("border-left: 5px solid var(--prose-heading)");
    expect(parsed.themes["epaper-color"].css).toContain("--h1: #111b26");
    expect(parsed.themes.hanji.css).toBeUndefined(); // 한지는 모양을 안 바꾼다
  });

  it("CSS 가 정화를 통과한다 — 경고 0", () => {
    for (const f of SEED_FILES.filter((f) => f.name.endsWith(".css"))) {
      expect(sanitizeThemeCss(f.text, f.name).warnings, f.name).toEqual([]);
    }
  });

  it("전자잉크는 스물세 항목을 다 적는다 — 이 파일이 곧 목록이다", () => {
    // 파생에 기대지 않고 전부 적어 두는 것이 이 팩의 존재 이유 중 하나다.
    expect(Object.keys(parsed.themes.epaper.prose ?? {})).toHaveLength(23);
  });

  it("팩을 내보냈다가 다시 읽어도 같은 테마다(왕복)", () => {
    for (const [id, theme] of Object.entries(parsed.themes)) {
      const round = parseThemeBundle(
        { ...seedBundle(), packs: [{ name: id, file: `${id}.jsonc`, text: buildThemePack(theme) }], styles: [] },
        BUILTIN_THEMES,
      );
      expect(round.warnings, id).toEqual([]);
      expect(round.themes[id], id).toEqual(theme);
    }
  });
});

describe("제목 위계", () => {
  it("사다리는 한 곳에서 나온다 — 두 팩이 어긋날 수 없다", () => {
    const css = SEED_FILES.filter((f) => f.name.endsWith(".css"));
    expect(css).toHaveLength(2);
    for (const f of css) expect(f.text, f.name).toContain(HEADING_LADDER_CSS);
  });

  it("색이 아니라 모양으로 여섯 단을 가른다", () => {
    // 무채색 테마에서 색은 신호가 못 된다 — 굵기·괘선·막대·자간이 그 일을 한다.
    expect(HEADING_LADDER_CSS).toContain("3px double var(--prose-heading-rule)"); // h1
    expect(HEADING_LADDER_CSS).toContain("1px solid var(--prose-heading-rule)"); // h2
    expect(HEADING_LADDER_CSS).toContain("5px solid var(--prose-heading)"); // h3
    expect(HEADING_LADDER_CSS).toContain("2px solid var(--prose-marker)"); // h4
    expect(HEADING_LADDER_CSS).toMatch(/letter-spacing: 0\.06em/); // h5
    expect(HEADING_LADDER_CSS).toMatch(/letter-spacing: 0\.1em/); // h6
  });

  it("사다리는 색을 직접 적지 않는다 — 전부 토큰 파생이다", () => {
    // 리터럴 색이 섞이면 다른 테마가 이 사이드카를 베꼈을 때 어긋난다.
    expect(HEADING_LADDER_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("컬러 전자잉크 제목 색 사다리", () => {
  const css = SEED_FILES.find((f) => f.name === "epaper-color.css")!.text;
  const bg = parsed.themes["epaper-color"].tokens["--bg"];
  const ladder = [...css.matchAll(/--h([1-6]): (#[0-9a-f]{6})/gi)].map((m) => ({
    level: Number(m[1]),
    hex: m[2],
  }));

  it("여섯 단을 모두 선언한다", () => expect(ladder.map((x) => x.level)).toEqual([1, 2, 3, 4, 5, 6]));

  // 하한을 계층별로 나눈다. 여섯 단을 전부 7:1 로 묶으면 쓸 수 있는 명도 폭이
  // L <= 0.084 로 좁아져 **여섯 단이 서로 구분되지 않는다** — 사다리를 만들려다 없애는 셈이다.
  // 문서 구조를 지는 h1~h3 은 7:1(내장 테마의 heading 과 같은 잣대), 잔가지인 h4~h6 은
  // 4.5:1(내장 테마의 muted 와 같은 잣대)로 둔다.
  it.each(ladder)("h$level 대비 하한", ({ level, hex }) => {
    expect(contrastRatio(hex, bg)).toBeGreaterThanOrEqual(level <= 3 ? 7 : 4.5);
  });

  it("단조 감소한다 — 아래로 갈수록 옅어진다", () => {
    // 사다리인데 순서가 뒤집히면 위계가 아니라 장식이다. 눈에 보이는 층은 이 단조성에서 나온다.
    const ratios = ladder.map((x) => contrastRatio(x.hex, bg));
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i], `h${ladder[i].level} vs h${ladder[i - 1].level}`).toBeLessThan(ratios[i - 1]);
    }
  });
});

describe("안내문", () => {
  it("폴더 안내문(README.md)도 함께 들어간다", () => {
    // 시드가 들어가면 폴더가 비지 않아 openThemeFolder 의 "비었을 때 만든다" 분기가 안 돈다.
    const guide = SEED_FILES.find((f) => f.name === "README.md");
    expect(guide).toBeDefined();
    expect(guide!.text).toContain("epaper-color.css");
  });

  it("확장자로 갈라 담아도 안내문은 팩·사이드카 어느 쪽에도 안 섞인다", () => {
    expect(seedEntries(".jsonc").map((e) => e.file)).not.toContain("README.md");
    expect(seedEntries(".css").map((e) => e.file)).not.toContain("README.md");
  });
});

describe("시드 판 번호", () => {
  it("1 이상이다 — 0 이면 store 기본값과 같아 매번 다시 넣는다", () =>
    expect(SEED_VERSION).toBeGreaterThanOrEqual(1));
});
