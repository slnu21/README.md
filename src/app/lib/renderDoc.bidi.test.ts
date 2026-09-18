// 미리보기 문서의 글 방향 계약(문자열 수준). 기하는 `npm run probe:rtl` 이 잰다.
//
// 지키는 것 셋: ① PREVIEW_CSS 에 물리 좌우 속성이 없다(하나만 남아도 RTL 블록에서 그 자리만
// 왼쪽에 박힌다) ② 코드·수식·다이어그램은 LTR 고정 ③ buildDoc 이 문서 루트에 dir+모드를 적고,
// 강제 모드는 본문과 무관하다.
import { describe, expect, it } from "vitest";
import { DIAGRAM_CTX_CSS, PREVIEW_CSS, buildDoc } from "./renderDoc";

const FONT = { readStack: "serif", readerPx: 16 };
const FA = "<p dir=\"auto\">تمام افراد بشر</p>";

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

describe("PREVIEW_CSS 좌우는 논리 속성", () => {
  it("padding/margin/border 의 -left/-right, text-align:left/right, float 가 없다", () => {
    const physical = PREVIEW_CSS.match(/(?:padding|margin|border)-(?:left|right)\b|text-align:\s*(?:left|right)\b|float:\s*(?:left|right)\b/g);
    expect(physical ?? []).toEqual([]);
  });

  it("논리 속성으로 바뀐 자리가 실제로 있다(정규식이 공허하게 통과하는 것 방지)", () => {
    for (const p of ["padding-inline-start", "border-inline-start", "text-align:start", "margin-inline"]) {
      expect(PREVIEW_CSS).toContain(p);
    }
  });

  it("코드·수식은 어느 모드에서도 LTR, 다이어그램은 측정 문맥(DIAGRAM_CTX_CSS)이 고정한다", () => {
    expect(PREVIEW_CSS).toContain("pre,math{direction:ltr}");
    expect(DIAGRAM_CTX_CSS).toContain("direction:ltr");
  });

  it("인라인 코드는 문단에서 격리해 자기 첫 글자로 정한다", () => {
    expect(PREVIEW_CSS).toContain(":not(pre)>code{unicode-bidi:plaintext}");
  });

  it("강제 모드 규칙이 잎(dir=auto)과 컨테이너(data-dir)를 함께 덮는다", () => {
    expect(PREVIEW_CSS).toContain(".md[data-dir-mode=ltr] :is([dir=auto],[data-dir]){direction:ltr}");
    expect(PREVIEW_CSS).toContain(".md[data-dir-mode=rtl] :is([dir=auto],[data-dir]){direction:rtl}");
    expect(PREVIEW_CSS).toContain(".md [data-dir=rtl]{direction:rtl}");
    expect(PREVIEW_CSS).toContain(".md [data-dir=ltr]{direction:ltr}");
  });
});

describe("buildDoc 문서 루트", () => {
  it("기본(auto)은 첫 강한 글자 — 페르시아어 문서는 rtl, 한국어·영어는 ltr", () => {
    expect(withDocumentStub(() => buildDoc(FA, "light", FONT))).toContain('<div class="md" dir="rtl" data-dir-mode="auto">');
    expect(withDocumentStub(() => buildDoc("<p>안녕</p>", "light", FONT))).toContain('<div class="md" dir="ltr" data-dir-mode="auto">');
    expect(withDocumentStub(() => buildDoc("", "light", FONT))).toContain('dir="ltr" data-dir-mode="auto"');
  });

  it("강제 모드는 본문과 무관하다", () => {
    expect(withDocumentStub(() => buildDoc(FA, "light", FONT, { textDirection: "ltr" }))).toContain('dir="ltr" data-dir-mode="ltr"');
    expect(withDocumentStub(() => buildDoc("<p>Hello</p>", "light", FONT, { textDirection: "rtl" }))).toContain('dir="rtl" data-dir-mode="rtl"');
  });

  it("방향은 .md 카드에만 적는다 — <html> 에 적으면 스크롤바까지 왼쪽으로 간다", () => {
    const html = withDocumentStub(() => buildDoc(FA, "light", FONT));
    expect(html).toMatch(/^<!doctype html><html lang="ko"><head>/);
    expect(html).not.toMatch(/<html[^>]*dir=/);
    expect(html).not.toMatch(/<body[^>]*dir=/);
  });
});
