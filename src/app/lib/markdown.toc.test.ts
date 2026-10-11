import { describe, expect, it } from "vitest";
import { createMarkdown, extractToc, renderWithToc } from "./markdown";
import { bigDoc } from "../dev/perfFixture";

// 워커는 renderWithToc 한 번으로 HTML 과 아웃라인을 만든다(파싱 한 번). 예전 두 호출과
// **글자 하나 다르지 않아야** 한다 — 각주·중복 헤딩 id 처럼 env·문서 전체 상태를 쓰는 것까지.
const SAMPLE = [
  "# 제목",
  "",
  "본문[^1] 과 $E=mc^2$.",
  "",
  "## 같은 이름",
  "",
  "## 같은 이름",
  "",
  "```mermaid",
  "graph TD; A-->B",
  "```",
  "",
  "::: tip",
  "콜아웃",
  ":::",
  "",
  "### English heading",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "[^1]: 각주 내용",
].join("\n");

describe("renderWithToc — 한 번 파싱", () => {
  it("md.render + extractToc 와 같은 결과(각주·중복 id·컨테이너·수식 포함)", () => {
    const md = createMarkdown();
    const got = renderWithToc(md, SAMPLE);
    expect(got.html).toBe(createMarkdown().render(SAMPLE));
    expect(got.toc).toEqual(extractToc(createMarkdown(), SAMPLE));
    // 중복 헤딩은 서로 다른 id 를 받고, 그 id 가 HTML 에 그대로 있다.
    const ids = got.toc.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(got.html).toContain(`id="${id}"`);
  });

  it("같은 인스턴스로 여러 번 불러도 상태가 새지 않는다(워커는 md 하나를 계속 쓴다)", () => {
    const md = createMarkdown();
    const a = renderWithToc(md, SAMPLE);
    const b = renderWithToc(md, SAMPLE);
    expect(b).toEqual(a);
  });

  it("큰 문서에서도 같다", () => {
    const doc = bigDoc({ chars: 200_000 });
    const got = renderWithToc(createMarkdown(), doc);
    expect(got.html).toBe(createMarkdown().render(doc));
    expect(got.toc).toEqual(extractToc(createMarkdown(), doc));
  });
});
