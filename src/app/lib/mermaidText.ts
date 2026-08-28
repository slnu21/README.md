// mermaid 소스 안 인라인 HTML 정규화(순수). DOM·mermaid를 건드리지 않아 node vitest로 그대로 돈다 —
// 실제 렌더는 lib/mermaid.ts renderMermaid가 이 함수를 통과시킨 소스로 한다.
//
// **왜 필요한가.** v0.6.9에서 라벨을 SVG `<text>`로 돌리면서(`htmlLabels:false`, 라벨 잘림 수정)
// 라벨 안 HTML을 해석해 주던 `<foreignObject>` 경로가 사라졌다. 그 뒤로 mermaid는 라벨 안의
// 인라인 태그를 **글자 그대로** 그린다 — markdownToLines가 html 토큰을 그냥 한 단어로 밀어 넣는다
// (mermaid 11.16.0 `chunk-Q4XR5HBZ.mjs:43,385`). 그래서 `가<b>굵게</b>나`가 태그째 보인다.
//
// `<br>`만은 mermaid가 직접 처리하는데, 그 정규화가 **`/<br\s*\/?>/`(대소문자 구분·속성 없음)**
// 하나뿐이라 `<BR>`·`<br class="x">`는 그물을 빠져나가 역시 글자로 남는다. timeline은 한술 더 떠
// 자기 정규식(`split(/(\s+|<br>)/)`, `timeline-definition-*.mjs:944`)으로 **bare `<br>`만** 자른다.
//
// 그래서 여기서 소스를 한 번 고른다:
//   ① `<br …>` 모든 변형 → bare `<br>` (모든 렌더러가 아는 유일한 형태)
//   ② 살릴 수 없는 서식 태그(`<b>`·`<span>`…) → 태그만 제거하고 글자는 남긴다
//   ③ `&nbsp;` → NBSP 문자 (sequence·journey는 이걸 만나면 **파싱 자체가 실패**한다)
//
// 하지 않는 것: `<b>`→`**` 변환. flowchart 라벨은 마크다운으로 파싱되지 않아(백틱 마크다운
// 문자열일 때만) `**`가 그대로 또 보인다 — 리터럴을 다른 리터럴로 바꾸는 셈이라 안 한다.

/** `<br>`을 줄바꿈으로 **처리하지 못하는** 다이어그램. 여기선 태그를 지우고 공백으로 바꾼다 —
 *  놔두면 mermaid가 `<br>`을 글자로 그린다(mermaid.live도 같다).
 *
 *  2026-08-28 · mermaid 11.16.0 실측. 나머지 종류는 `<br>`을 그대로 넘긴다(기본값 = 현행 유지) —
 *  모르는 종류를 넘겨짚어 지우면 될 줄바꿈까지 잃는다. */
const BREAKS_UNSUPPORTED = new Set([
  "pie",
  "journey",
  "gitgraph",
  "xychart",
  "quadrantchart",
  "packet",
  "treemap",
]);

/** 같은 다이어그램을 가리키는 다른 이름들. 판정 전에 하나로 모은다. */
const KIND_ALIASES: Record<string, string> = {
  graph: "flowchart",
  "flowchart-elk": "flowchart",
  "classdiagram-v2": "classdiagram",
  "statediagram-v2": "statediagram",
};

/** `<br>`·`<BR>`·`<br/>`·`<br />`·`<br class="x">` 를 모두 잡는다.
 *  `\b` 덕에 `<brother>` 같은 다른 태그는 건드리지 않는다. */
const BR_RE = /<br\b[^>]*>/gi;

/** SVG 라벨 경로가 표현할 수 없는 인라인 서식 태그. 여는·닫는 태그 모두.
 *  `<a>`는 일부러 뺐다 — 링크는 mermaid의 `click` 지시자가 따로 다루고, 여기서 지우면
 *  사용자가 쓴 주소가 흔적 없이 사라진다.
 *
 *  주의: 이 목록에 태그를 더할 때 **mermaid 문법과 겹치지 않는지** 볼 것. 지금 목록은
 *  화살표(`-->`·`<|--`·`<--`·`->>`)와 클래스 스테레오타입(`<<interface>>`)을 건드리지 않는다
 *  (`\b` 경계 때문에 `<<interface>>`의 `i`·`ins`가 매치되지 않는다 — 테스트로 지킨다). */
const INLINE_TAG_RE =
  /<\/?(?:b|strong|i|em|u|s|strike|del|ins|span|code|small|sub|sup|mark|font|big|tt|kbd|samp|var)\b[^>]*>/gi;

/** mermaid는 `#nbsp;`를 쓴다. HTML식 `&nbsp;`는 flowchart에선 글자 그대로 보이고
 *  sequence·journey에선 **파싱 오류로 다이어그램이 통째로 실패**한다. */
const NBSP_RE = /&nbsp;/gi;

/** U+00A0. 소스에 그 글자를 직접 적으면 눈에 안 보여 사고가 난다 — 코드로만 만든다. */
const NBSP = String.fromCharCode(0xa0);

/** 소스 첫 줄에서 다이어그램 종류를 읽는다. frontmatter(`---`)·`%%` 주석·`%%{init}%%` 지시자는 건너뛴다.
 *  못 읽으면 빈 문자열(=모르는 종류 → 보수적으로 현행 유지). */
export function detectDiagramKind(src: string): string {
  const lines = src.split(/\r?\n/);
  let i = 0;

  // YAML frontmatter: 첫 유효 줄이 `---` 이면 닫는 `---` 까지 통째로 건너뛴다.
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length && lines[i].trim() === "---") {
    i++;
    while (i < lines.length && lines[i].trim() !== "---") i++;
    i++; // 닫는 ---
  }

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("%%")) continue; // 주석·`%%{init: …}%%` 지시자
    const word = /^([A-Za-z][\w-]*)/.exec(line)?.[1];
    if (!word) return "";
    const kind = word.toLowerCase();
    return KIND_ALIASES[kind] ?? kind.replace(/-beta$/, "");
  }
  return "";
}

/** mermaid에 넘기기 전 소스를 고른다. 순수 — 같은 입력에 같은 출력이고, 두 번 돌려도 결과가 같다. */
export function normalizeDiagramHtml(src: string): string {
  if (!src.includes("<") && !src.includes("&")) return src; // 흔한 경우를 빠르게 통과
  const breakWith = BREAKS_UNSUPPORTED.has(detectDiagramKind(src)) ? " " : "<br>";
  return src.replace(BR_RE, breakWith).replace(INLINE_TAG_RE, "").replace(NBSP_RE, NBSP);
}
