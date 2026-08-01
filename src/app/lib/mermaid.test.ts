// v0.6.8에서 mermaid flowchart·ER 라벨이 글자 중간에 잘리던 버그의 재발 방지 테스트.
//
// 원인 두 겹이었고 둘 다 여기서 지킨다:
//  ① mermaid 11의 labelHelper는 **최상위** htmlLabels만 읽는다(chunk-ZGVPDNZ5.mjs:43).
//     `flowchart.htmlLabels`만 켜면 노드 라벨이 foreignObject HTML로 나가고, 앱 문서에서 잰 폭이
//     얼어붙은 채 미리보기 문서에서 다시 배치돼 잘린다.
//  ② 그 폭을 잰 문맥이 앱 CSS에 오염돼 있었다(App.css `.node{font-size:13px}`) — 그건 CSS라
//     여기서 못 잡는다. 기하 검사는 `npm run probe:mermaid`(app/dev/mermaidProbe.ts)가 한다.
import { describe, expect, it } from "vitest";
import { diagramConfig, decodeMermaidSrc, viewBoxWidth } from "./mermaid";
import { DIAGRAM_FONT, DIAGRAM_FONT_PX } from "./renderDoc";
import { themes } from "../themes";

// Node 오라클(bytes.test.ts와 같은 방식). @types/node 를 끌어오지 않으려고 지역 선언한다.
declare const Buffer: { from(s: string, enc: string): { toString(enc: string): string } };
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("diagramConfig — 라벨 잘림(v0.6.8) 재발 방지", () => {
  const cfg = diagramConfig("light");

  it("최상위 htmlLabels가 false다 — labelHelper는 flowchart.htmlLabels를 보지 않는다", () => {
    // 이 줄이 사라지면 evaluate(undefined)=true 가 되어 노드 라벨이 다시 foreignObject 로 나간다.
    expect(cfg.htmlLabels).toBe(false);
  });

  it("flowchart.htmlLabels도 false로 남아 있다 — 중복이 아니라 다른 두 경로를 막는다", () => {
    // getEffectiveHtmlLabels는 `htmlLabels ?? flowchart.htmlLabels ?? true` 인데 기본값이 null 이라
    // 이 줄이 없으면 간선 라벨·서브그래프 제목이 HTML 이 된다. swimlane·triangle 은 직접 읽는다.
    expect(cfg.flowchart.htmlLabels).toBe(false);
  });

  it("securityLevel이 strict다 — 미리보기 sandbox의 전제", () => {
    expect(cfg.securityLevel).toBe("strict");
  });

  it("startOnLoad는 꺼져 있다 — 우리가 명시적으로 render를 부른다", () => {
    expect(cfg.startOnLoad).toBe(false);
  });

  it("최상위 fontFamily와 themeVariables.fontFamily가 같은 리터럴이다", () => {
    // 앞은 측정 스테이지 div(divStyle)에, 뒤는 SVG에 심는 <style>에 박힌다. 어긋나면 두 문맥이
    // 서로 다른 face를 골라 라벨 폭이 벌어진다.
    expect(cfg.fontFamily).toBe(DIAGRAM_FONT);
    expect(cfg.themeVariables.fontFamily).toBe(DIAGRAM_FONT);
  });

  it("themeVariables.fontSize가 DIAGRAM_CTX_CSS와 같은 크기다", () => {
    expect(cfg.themeVariables.fontSize).toBe(`${DIAGRAM_FONT_PX}px`);
  });

  it("한글 face가 글꼴 스택에 있다 — mermaid 기본 스택엔 한글 글리프가 없다", () => {
    expect(DIAGRAM_FONT).toMatch(/Malgun Gothic/);
  });

  it.each([...Object.keys(themes), "존재하지-않는-테마"])("%s → base 테마 + 구체 hex 색", (id) => {
    const c = diagramConfig(id);
    expect(c.theme).toBe("base"); // themeVariables를 존중하는 mermaid 테마는 base 뿐이다
    const colors = Object.entries(c.themeVariables).filter(
      ([k]) => !["darkMode", "fontFamily", "fontSize"].includes(k),
    );
    // mermaid는 khroma로 색을 파생하므로 color-mix()/var() 같은 CSS 함수를 넘기면 렌더가 터진다.
    expect(colors.length).toBeGreaterThan(8); // 공허 통과 방지
    for (const [k, v] of colors) expect(String(v), k).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("decodeMermaidSrc", () => {
  it.each([
    "flowchart TD\n  A --> B",
    "graph LR\n  가 --> 나",
    "%% 이모지 🙂 와 화살표 -->",
    "",
  ])("왕복: %s", (src) => expect(decodeMermaidSrc(b64(src))).toBe(src));

  it("깨진 base64는 빈 문자열 — 렌더 오류가 아니라 조용히 빈 블록", () =>
    expect(decodeMermaidSrc("!!!not-base64!!!")).toBe(""));
});

describe("viewBoxWidth", () => {
  const stub = (v: string | null) => ({ getAttribute: (n: string) => (n === "viewBox" ? v : null) }) as Element;

  it.each([
    ["0 0 1400 800", 1400],
    ["0,0,320,240", 320],
    ["  -8  -8  512.4  300 ", 512],
  ])("%s → %s", (vb, want) => expect(viewBoxWidth(stub(vb))).toBe(want));

  it.each([["0 0 0 100"], ["0 0 -5 100"], ["nope"], [null]])("%s → null", (vb) =>
    expect(viewBoxWidth(stub(vb as string | null))).toBeNull());

  it("요소가 없으면 null", () => expect(viewBoxWidth(null)).toBeNull());
});
