// mermaid 측정(앱 문서)↔표시(미리보기 문서) 문맥 공유 계약을 문자열 수준에서 못박는다.
//
// renderDoc.ts:27 이 "**한쪽만 바뀌면 버그가 재발하므로 이 상수를 반드시 공유한다**" 고 적어 두었지만
// 그걸 지키는 장치는 없었다. v0.6.7·v0.6.8 두 번 다 이 계열에서 샜다.
// 기하 실측은 `npm run probe:mermaid` 가 하고, 여기서는 상수가 실제로 공유되는지만 본다.
import { describe, expect, it } from "vitest";
import { DIAGRAM_CTX_CSS, DIAGRAM_FONT, DIAGRAM_FONT_PX, PREVIEW_CSS } from "./renderDoc";

describe("DIAGRAM_CTX_CSS ↔ PREVIEW_CSS 공유", () => {
  it("PREVIEW_CSS의 .mermaid-rendered 규칙이 DIAGRAM_CTX_CSS를 그대로 담고 있다", () => {
    // lib/mermaid.ts measureStage() 는 같은 상수를 인라인 style 로 쓴다 — 양쪽이 한 소스여야 한다.
    expect(PREVIEW_CSS).toContain(DIAGRAM_CTX_CSS);
    const rule = PREVIEW_CSS.split(".mermaid-rendered{")[1]?.split("}")[0] ?? "";
    expect(rule).toContain(DIAGRAM_CTX_CSS);
  });

  it.each([
    "line-height",
    "text-rendering",
    "letter-spacing",
    "word-spacing",
    "font-kerning",
    "font-variant-ligatures",
    "-webkit-font-smoothing",
    "font-family",
    "font-size",
  ])("%s 를 고정한다", (prop) => expect(DIAGRAM_CTX_CSS).toContain(`${prop}:`));

  it("글꼴 고정값이 diagramConfig가 mermaid에 넘기는 값과 같다", () => {
    // 어긋나면 mermaid <style> 이 사라졌을 때 측정과 표시가 서로 다른 글꼴로 떨어진다.
    expect(DIAGRAM_CTX_CSS).toContain(`font-family:${DIAGRAM_FONT}`);
    expect(DIAGRAM_CTX_CSS).toContain(`font-size:${DIAGRAM_FONT_PX}px`);
  });

  it("빈 상수가 아니다(대조가 무의미해지는 것 방지)", () =>
    expect(DIAGRAM_CTX_CSS.split(";").length).toBeGreaterThan(8));
});
