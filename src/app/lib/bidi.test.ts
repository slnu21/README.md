// 글 방향 판정 — 언어를 몰라도 맞는지 확인할 수 있는 종류의 검사다: 방향은 글자의 유니코드
// 속성이지 뜻이 아니다. 페르시아어 문장은 세계인권선언 1조(UN 공개 번역)에서 가져왔다.
import { describe, expect, it } from "vitest";
import { docDirection, firstStrongDir, firstStrongDirInHtml } from "./bidi";

const FA = "تمام افراد بشر آزاد به دنیا می‌آیند"; // ZWNJ(U+200C) 포함
const HE = "שלום עולם";
const AR = "مرحبا بالعالم";

describe("firstStrongDir", () => {
  it("라틴·한글은 ltr", () => {
    expect(firstStrongDir("Hello")).toBe("ltr");
    expect(firstStrongDir("안녕하세요")).toBe("ltr");
    expect(firstStrongDir("日本語")).toBe("ltr");
  });

  it("페르시아어·아랍어·히브리어는 rtl", () => {
    expect(firstStrongDir(FA)).toBe("rtl");
    expect(firstStrongDir(AR)).toBe("rtl");
    expect(firstStrongDir(HE)).toBe("rtl");
  });

  it("숫자·문장부호·공백·이모지는 건너뛰고 첫 강한 글자를 본다", () => {
    expect(firstStrongDir("123 " + FA)).toBe("rtl");
    expect(firstStrongDir("۱۲۳ " + FA)).toBe("rtl"); // 페르시아 숫자(EN)도 약하다
    expect(firstStrongDir("- (٣) " + AR)).toBe("rtl");
    expect(firstStrongDir("🙂 " + FA)).toBe("rtl");
    expect(firstStrongDir("**" + FA + "**")).toBe("rtl");
    expect(firstStrongDir("1. Hello " + FA)).toBe("ltr");
  });

  it("강한 글자가 없으면 null — 호출자가 상위 방향을 따른다", () => {
    expect(firstStrongDir("")).toBeNull();
    expect(firstStrongDir("123 456")).toBeNull();
    expect(firstStrongDir("---")).toBeNull();
    expect(firstStrongDir("۱۲۳")).toBeNull();
  });

  it("방향 표식 문자(LRM/RLM/ALM)는 글자보다 먼저 판정한다", () => {
    expect(firstStrongDir("‏" + "Hello")).toBe("rtl");
    expect(firstStrongDir("‎" + FA)).toBe("ltr");
    expect(firstStrongDir("؜" + "abc")).toBe("rtl");
  });

  it("ZWNJ 는 방향에 관여하지 않는다", () => {
    expect(firstStrongDir("‌" + FA)).toBe("rtl");
    expect(firstStrongDir("‌")).toBeNull();
  });
});

describe("firstStrongDirInHtml", () => {
  it("태그 안 글자(h1·id·data-line)를 세지 않는다", () => {
    expect(firstStrongDirInHtml(`<h1 id="x" data-line="0" dir="auto">${FA}</h1>`)).toBe("rtl");
    expect(firstStrongDirInHtml(`<p dir="auto">Hello</p>`)).toBe("ltr");
  });

  it("엔티티는 하나로 건너뛴다 — `&amp;` 의 amp 가 라틴 글자로 세이면 안 된다", () => {
    expect(firstStrongDirInHtml(`<p>&amp; &#x627; ${FA}</p>`)).toBe("rtl");
    expect(firstStrongDirInHtml(`<p>&lt;&gt; Hello</p>`)).toBe("ltr");
  });

  it("세미콜론이 멀리 있는 외로운 & 는 글자로 취급하지 않고 지나간다", () => {
    expect(firstStrongDirInHtml(`<p>& ${FA} ; x</p>`)).toBe("rtl");
  });

  it("텍스트가 없거나 강한 글자가 없으면 null", () => {
    expect(firstStrongDirInHtml("")).toBeNull();
    expect(firstStrongDirInHtml("<hr><p>123</p>")).toBeNull();
    expect(firstStrongDirInHtml("<p>unclosed")).toBe("ltr");
    expect(firstStrongDirInHtml("<p unclosed")).toBeNull();
  });

  it("첫 블록이 코드여도 규칙은 같다(첫 강한 글자) — 브라우저 dir=auto 와 동일", () => {
    expect(firstStrongDirInHtml(`<pre><code>let x</code></pre><p>${FA}</p>`)).toBe("ltr");
  });
});

describe("docDirection", () => {
  it("강제 모드는 본문과 무관하다", () => {
    expect(docDirection("rtl", "<p>Hello</p>")).toBe("rtl");
    expect(docDirection("ltr", `<p>${FA}</p>`)).toBe("ltr");
  });

  it("자동은 첫 강한 글자, 없으면 ltr", () => {
    expect(docDirection("auto", `<h1>${FA}</h1><p>Hello</p>`)).toBe("rtl");
    expect(docDirection("auto", `<h1>README</h1><p>${FA}</p>`)).toBe("ltr");
    expect(docDirection("auto", "")).toBe("ltr");
  });
});
