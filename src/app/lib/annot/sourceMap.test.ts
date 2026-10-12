import { describe, expect, it } from "vitest";
import { createMarkdown } from "../markdown";
import { alignRendered, lineStarts, rangeable, renderedToSource, sourceToRendered, visibleChars } from "./sourceMap";

const md = createMarkdown();

/** 블록 하나를 진짜 렌더러로 그려 textContent 를 흉내 낸다(node 환경이라 DOM 이 없다). */
function renderedText(src: string): string {
  return md
    .render(src)
    .replace(/<annotation[\s\S]*?<\/annotation>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** 렌더 글에서 `pick` 을 골랐을 때의 소스 글. */
function pickToSource(src: string, pick: string, nth = 0) {
  const r = renderedText(src);
  let i = -1;
  for (let k = 0; k <= nth; k++) i = r.indexOf(pick, i + 1);
  expect(i, `렌더 글에 "${pick}" 없음: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(0);
  const map = alignRendered(visibleChars(src, 0, src.length), r);
  const s = renderedToSource(map, i, i + pick.length);
  expect(s).not.toBeNull();
  return { ...s!, text: src.slice(s!.start, s!.end), map, r, i };
}

describe("렌더 ↔ 소스", () => {
  it("굵게·기울임·코드 기호를 건너뛴다", () => {
    const src = "이 문장은 **굵게** 와 *기울임* 과 `코드` 가 있다.\n";
    expect(pickToSource(src, "굵게 와 기울임").text).toBe("굵게** 와 *기울임");
    expect(pickToSource(src, "코드").text).toBe("코드");
  });

  it("링크 주소의 글자에 맞지 않는다", () => {
    const src = '자세히는 [설계 문서](docs/hello.md "hello")hello 참고.\n';
    const p = pickToSource(src, "hello");
    expect(p.start).toBe(src.lastIndexOf("hello"));
    expect(pickToSource(src, "설계 문서").text).toBe("설계 문서");
  });

  it("이미지 alt 는 렌더 글에 없다 — 뒤 글이 alt 에 맞지 않는다", () => {
    const src = "그림 ![도표 설명](a.png) 도표 설명 끝.\n";
    expect(pickToSource(src, "도표 설명").start).toBe(src.lastIndexOf("도표 설명"));
  });

  it("이스케이프한 기호", () => {
    const src = "별표 \\*는\\* 그대로.\n";
    expect(pickToSource(src, "*는*").text).toBe("*는\\*");
  });

  it("타이포그래퍼가 바꾼 따옴표·줄표·말줄임", () => {
    const src = '"인용" -- 그리고... 끝.\n';
    expect(pickToSource(src, "인용").text).toBe("인용");
    expect(pickToSource(src, "그리고").text).toBe("그리고");
    expect(pickToSource(src, "끝").text).toBe("끝");
  });

  it("목록 기호와 번호에 맞지 않는다", () => {
    const src = "- 첫째 항목\n- 둘째 항목\n";
    expect(pickToSource(src, "둘째").start).toBe(src.indexOf("둘째"));
    const ol = "1. 10개를 샀다\n2. 2개를 팔았다\n";
    expect(pickToSource(ol, "10").start).toBe(ol.indexOf("10개"));
    expect(pickToSource(ol, "2개").start).toBe(ol.indexOf("2개"));
  });

  it("체크박스·인용·헤딩 머리", () => {
    expect(pickToSource("- [x] 끝낸 일\n", "끝낸").start).toBe(6);
    expect(pickToSource("> 인용한 말\n> 둘째 줄\n", "둘째").start).toBe("> 인용한 말\n> ".length);
    expect(pickToSource("## 2. 근거\n", "2. 근거").text).toBe("2. 근거");
  });

  it("표 — 괘선·구분 행을 건너뛰고 셀 글자에", () => {
    const src = "| 항목 | 값 |\n|---|---|\n| 지연 | 91ms |\n| 처리량 | 12k |\n";
    expect(pickToSource(src, "91ms").text).toBe("91ms");
    expect(pickToSource(src, "12k").text).toBe("12k");
  });

  it("원시 HTML 태그 안 글자", () => {
    const src = "앞 <b>굵은 bold</b> 뒤\n";
    expect(pickToSource(src, "굵은 bold").text).toBe("굵은 bold");
  });

  it("자동 링크는 주소가 곧 글이다", () => {
    const src = "주소 <https://example.com/x> 끝\n";
    expect(pickToSource(src, "example.com").text).toBe("example.com");
  });

  it("여러 줄 문단 — 소프트 줄바꿈", () => {
    const src = "첫 줄의 끝과\n둘째 줄의 시작.\n";
    expect(pickToSource(src, "끝과\n둘째").text).toBe("끝과\n둘째");
  });

  it("페르시아어", () => {
    const src = "این **سند** آزمایشی است.\n";
    expect(pickToSource(src, "سند آزمایشی").text).toBe("سند** آزمایشی");
  });

  it("소스 → 렌더 왕복", () => {
    const src = "이 문장은 **굵게** 와 [링크](u) 다.\n";
    const r = renderedText(src);
    const map = alignRendered(visibleChars(src, 0, src.length), r);
    const s = src.indexOf("굵게");
    const back = sourceToRendered(map, s, src.indexOf("링크") + 2);
    expect(r.slice(back!.start, back!.end)).toBe("굵게 와 링크");
  });

  it("양끝이 소스 없는 글자면 안쪽으로 당기고, 전부 없으면 null", () => {
    const map = Int32Array.from([-1, 5, 6, -1]);
    expect(renderedToSource(map, 0, 4)).toEqual({ start: 5, end: 7 });
    expect(renderedToSource(Int32Array.from([-1, -1]), 0, 2)).toBeNull();
  });

  it("블록 범위만 — 앞뒤 블록 글자는 안 들어간다", () => {
    const src = "첫 문단.\n\n둘째 문단 **굵게**.\n\n셋째.\n";
    const ls = lineStarts(src);
    const vis = visibleChars(src, ls[2], ls[3]);
    expect(vis.text).toBe("둘째 문단 **굵게**.\n");
    expect(vis.offs[0]).toBe(src.indexOf("둘째"));
  });
});

describe("rangeable", () => {
  const el = (tagName: string, cls: string[] = []) => ({ tagName, classList: { contains: (c: string) => cls.includes(c) } });
  it("코드 블록·다이어그램·수식 블록은 범위 펜 불가", () => {
    expect(rangeable(el("PRE", ["hljs"]))).toBe(false);
    expect(rangeable(el("PRE", ["mermaid"]))).toBe(false);
    expect(rangeable(el("DIV", ["mermaid-rendered"]))).toBe(false);
    expect(rangeable(el("SECTION", ["katex-display"]))).toBe(false);
    expect(rangeable(el("P"))).toBe(true);
    expect(rangeable(el("LI"))).toBe(true);
  });
});
