// 글 방향(bidi) 순수 판정 — 미리보기 문서 루트·컨테이너 블록의 기준 방향을 정한다.
//
// 브라우저의 `dir="auto"` 는 **자식 중 dir 속성을 가진 것을 통째로 건너뛴다**(HTML 표준의
// directionality 알고리즘). 잎 블록(p·h1~h6·td…)마다 dir="auto" 를 달면 그 부모(ul·blockquote·
// table)와 문서 루트는 볼 텍스트가 하나도 남지 않아 항상 LTR 로 떨어진다 — 목록 여백·인용문
// 막대·표 열 순서가 전부 왼쪽에 남는다. 그래서 컨테이너와 루트는 **우리가 첫 강한 글자를 찾아**
// 방향을 적는다. 규칙은 유니코드 P2/P3 와 같다: 첫 강한 글자(L 또는 R/AL)가 방향이고, 숫자·
// 문장부호·공백은 약하거나 중립이라 건너뛴다.
//
// 언어를 몰라도 판정이 맞는 이유: 방향은 글자 하나하나의 유니코드 속성으로 정해지고, 여기서는
// 그 속성만 본다(lib/bidi.test.ts).

export type TextDirection = "auto" | "ltr" | "rtl";
export type StrongDir = "ltr" | "rtl";

/** R/AL 문자 블록. 히브리·아랍(페르시아·우르두 포함)·시리아·타나·은코·사마리아·만다·아랍 확장·
 *  표현형·보조 평면의 RTL 문자들. 숫자(U+0660~, U+06F0~)는 `\p{L}` 이 아니라 자동으로 빠진다. */
const RTL_LETTER =
  /[֐-ࣿיִ-﷿ﹰ-﻿\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
const LETTER = /\p{L}/u;

/** 문자열의 첫 강한 글자가 정하는 방향. 강한 글자가 없으면 null(호출자가 상위를 따른다).
 *  방향 표식 문자(LRM·RLM·ALM)는 글자가 아니지만 강하므로 존중한다 — 사용자가 문단 앞에 붙여
 *  자동 판정을 뒤집는 표준 수단이다. */
export function firstStrongDir(text: string): StrongDir | null {
  for (const ch of text) {
    if (ch === "‎") return "ltr";
    if (ch === "‏" || ch === "؜") return "rtl";
    if (LETTER.test(ch)) return RTL_LETTER.test(ch) ? "rtl" : "ltr";
  }
  return null;
}

/** 렌더된 HTML 본문에서 태그·엔티티를 건너뛰며 첫 강한 글자를 찾는다. 태그 안의 글자(`<h1 id=…>`)를
 *  세면 모든 문서가 LTR 이 되므로 `<…>` 는 통째로, `&…;` 는 엔티티 하나로 건너뛴다.
 *  전체를 훑지 않는다 — 첫 글자에서 멈춘다(제목이 있으면 사실상 즉시). */
export function firstStrongDirInHtml(html: string): StrongDir | null {
  let i = 0;
  const n = html.length;
  while (i < n) {
    const c = html[i];
    if (c === "<") {
      const close = html.indexOf(">", i + 1);
      if (close < 0) return null;
      i = close + 1;
      continue;
    }
    if (c === "&") {
      const semi = html.indexOf(";", i + 1);
      // 엔티티는 길어야 열 자 남짓 — 그보다 멀면 그냥 `&` 글자다.
      if (semi > 0 && semi - i <= 12) {
        i = semi + 1;
        continue;
      }
    }
    const cp = html.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const d = firstStrongDir(ch);
    if (d) return d;
    i += ch.length;
  }
  return null;
}

/** 문서 루트(.md)의 기준 방향. 설정이 강제면 그대로, 자동이면 본문의 첫 강한 글자(없으면 LTR). */
export function docDirection(mode: TextDirection, bodyHtml: string): StrongDir {
  if (mode === "ltr" || mode === "rtl") return mode;
  return firstStrongDirInHtml(bodyHtml) ?? "ltr";
}
