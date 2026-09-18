// 렌더러의 글 방향 속성(bidi_dir 코어 룰) — 잎 블록은 dir="auto", 컨테이너는 계산한 data-dir.
// 브라우저의 dir="auto" 가 dir 속성을 가진 자식을 건너뛰기 때문에 컨테이너는 우리가 계산해야
// 한다는 것이 이 룰의 존재 이유다(lib/markdown.ts BIDI_* 주석). 기하는 `npm run probe:rtl` 이 잰다.
import { describe, expect, it } from "vitest";
import { createMarkdown } from "./markdown";

const FA = "تمام افراد بشر آزاد به دنیا می‌آیند"; // 세계인권선언 1조(fa)
const md = createMarkdown();
const render = (src: string) => md.render(src);

describe("잎 블록 dir=\"auto\"", () => {
  it("문단·제목은 내용과 무관하게 항상 auto(브라우저가 첫 강한 글자로 정한다)", () => {
    expect(render("Hello")).toMatch(/<p [^>]*dir="auto"/);
    expect(render(FA)).toMatch(/<p [^>]*dir="auto"/);
    expect(render("# " + FA)).toMatch(/<h1 [^>]*dir="auto"/);
    expect(render("### 안녕")).toMatch(/<h3 [^>]*dir="auto"/);
  });

  it("기존 속성(id·data-line)을 밀어내지 않는다", () => {
    const html = render("# Title\n\ntext");
    expect(html).toMatch(/<h1 id="title" tabindex="-1" data-line="0" dir="auto">/);
    expect(html).toMatch(/<p data-line="2" dir="auto">/);
  });

  it("표 셀(th·td)·정의 목록(dt·dd)도 잎이다", () => {
    const table = render("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(table).toMatch(/<th[^>]*dir="auto"/);
    expect(table).toMatch(/<td[^>]*dir="auto"/);
    const dl = render("Term\n: definition");
    expect(dl).toMatch(/<dt[^>]*dir="auto"/);
    expect(dl).toMatch(/<dd[^>]*dir="auto"/);
  });

  it("표 열 정렬(style)이 있어도 dir 이 함께 붙는다", () => {
    const html = render("| a | b |\n|:--|--:|\n| 1 | 2 |");
    expect(html).toMatch(/<td[^>]*style="text-align:right"[^>]*dir="auto"|<td[^>]*dir="auto"[^>]*style="text-align:right"/);
  });

  it("코드 블록에는 dir 을 달지 않는다(pre 는 CSS 가 LTR 로 고정한다)", () => {
    expect(render("```js\nlet x\n```")).not.toMatch(/<pre[^>]*dir=/);
    expect(render("    indented")).not.toMatch(/<pre[^>]*dir=/);
  });
});

describe("컨테이너 data-dir(계산)", () => {
  it("목록: 첫 강한 글자가 페르시아어면 rtl, 영어면 ltr", () => {
    expect(render(`- ${FA}\n- second`)).toMatch(/<ul[^>]*data-dir="rtl"/);
    expect(render(`1. one\n2. ${FA}`)).toMatch(/<ol[^>]*data-dir="ltr"/);
    expect(render(`- ${FA}`)).toMatch(/<li[^>]*data-dir="rtl"/);
  });

  it("인용문·표·정의 목록·콜아웃", () => {
    expect(render(`> ${FA}`)).toMatch(/<blockquote[^>]*data-dir="rtl"/);
    expect(render(`> quote`)).toMatch(/<blockquote[^>]*data-dir="ltr"/);
    expect(render(`| ${FA} | b |\n|---|---|\n| 1 | 2 |`)).toMatch(/<table[^>]*data-dir="rtl"/);
    expect(render(`Term\n: ${FA}`)).toMatch(/<dl[^>]*data-dir="ltr"/);
    expect(render(`::: note\n${FA}\n:::`)).toContain(`<div class="callout note" data-dir="rtl">`);
    expect(render(`::: tip\nhello\n:::`)).toContain(`<div class="callout tip" data-dir="ltr">`);
  });

  it("강한 글자가 없으면 data-dir 을 달지 않는다 — 문서 루트를 따른다", () => {
    expect(render("- 123\n- 456")).not.toMatch(/data-dir=/);
    expect(render("> ۱۲۳")).not.toMatch(/data-dir=/);
    expect(render("::: note\n42\n:::")).toContain(`<div class="callout note">`);
  });

  it("숫자·기호·강조 표식을 건너뛰고 첫 글자를 본다", () => {
    expect(render(`- 1) **${FA}**`)).toMatch(/<ul[^>]*data-dir="rtl"/);
    expect(render(`- [${FA}](https://example.com)`)).toMatch(/<ul[^>]*data-dir="rtl"/);
  });

  it("원시 HTML 태그의 글자는 세지 않는다(브라우저도 텍스트만 본다)", () => {
    expect(render(`- <span class="x">${FA}</span>`)).toMatch(/<ul[^>]*data-dir="rtl"/);
  });

  it("중첩: 바깥 목록과 안쪽 목록이 각자 판정한다", () => {
    const html = render(`- ${FA}\n  - inner english`);
    expect(html).toMatch(/<ul[^>]*data-dir="rtl"[\s\S]*<ul[^>]*data-dir="ltr"/);
  });

  it("항목 안 코드 블록 내용도 텍스트다(브라우저 dir=auto 와 같은 규칙)", () => {
    expect(render("- ```\n  let x\n  ```\n- " + FA)).toMatch(/<ul[^>]*data-dir="ltr"/);
  });

  it("컨테이너의 짝 닫힘에서 멈춘다 — 다음 형제의 글자를 훔치지 않는다", () => {
    const html = render(`- 123\n\n${FA}`);
    expect(html).not.toMatch(/<ul[^>]*data-dir=/);
  });
});
