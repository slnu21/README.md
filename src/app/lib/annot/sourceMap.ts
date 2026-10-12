/**
 * 렌더 글자 ↔ 소스 글자 (ADR 0003 "가장 어려운 곳").
 *
 * 사람은 미리보기에서 글자를 고르지만 표시의 위치는 마크다운 소스의 글자 범위다. 그 사이에 `**`·링크 문법·
 * 이스케이프·목록 기호·표 괘선이 있다. 두 단계로 맞춘다.
 *
 * 1. **보이는 글자만 남긴 소스**(`visibleChars`) — 줄 머리의 블록 기호(`>`·`-`·`1.`·`#`·체크박스)와 화면에
 *    안 나오는 *글자를 가진* 문법(링크 주소·이미지·HTML 태그·참조 정의)을 뺀다. 별표·밑줄 같은 기호는 그대로
 *    둔다 — 글자가 아니라서 다음 단계가 알아서 건너뛴다. 링크 주소를 남기면 `[a](http://x)hello` 의 `h` 가
 *    주소의 `h` 에 맞아 버린다(정렬이 갈리는 동점).
 * 2. 그것과 블록의 렌더 글(`textContent`)을 **글자 diff 로 정렬**한다. 타이포그래퍼가 바꾼 따옴표·줄표·말줄임은
 *    같은 글자로 본다.
 *
 * 맞지 않은 렌더 글자(수식 MathML 의 주석, 각주 번호 등)는 소스가 없다 — 경계는 안쪽의 맞은 글자로 당긴다.
 */
import { diffSeq } from "./diff";

export interface Visible {
  text: string;
  /** text[i] 의 소스 위치(문서 전체 기준). */
  offs: number[];
}

// 줄 머리: 인용 `>` 여러 겹 · 목록 기호 + 체크박스 · 헤딩 `#`.
const LINE_HEAD = /^(?:[ \t]*>[ \t]?)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)?(?:#{1,6}(?:[ \t]+|$))?/;
const TABLE_RULE = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const REF_DEF = /^[ \t]{0,3}\[[^\]^][^\]]*\]:[ \t]/;
const FOOTNOTE_HEAD = /^[ \t]{0,3}\[\^[^\]]+\]:[ \t]*/;

// 줄 안에서 통째로 숨길 것(글자를 가졌지만 화면에 안 나온다).
const HIDE: RegExp[] = [
  /!\[[^\]]*\]\((?:[^()\s]|\([^()]*\))*(?:[ \t]+"[^"]*")?\)/g, // 이미지(alt 는 textContent 에 없다)
  /\]\((?:[^()\s]|\([^()]*\))*(?:[ \t]+"[^"]*")?\)/g, // 링크 주소 `](url "t")`
  /\]\[[^\]]*\]/g, // 참조 링크 `][ref]`
  /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/g, // HTML 태그(자동 링크 `<http://…>` 는 아래에서 살린다)
  /<!--[\s\S]*?-->/g,
];
const AUTOLINK = /^<(?:[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*|[^<>\s@]+@[^<>\s]+)>$/;

/** src[from,to) 의 보이는 글자. from/to 는 줄 경계여야 한다(블록의 소스 줄 범위). */
export function visibleChars(src: string, from: number, to: number): Visible {
  const text: string[] = [];
  const offs: number[] = [];
  let p = from;
  while (p < to) {
    let e = src.indexOf("\n", p);
    if (e < 0 || e >= to) e = to;
    const line = src.slice(p, e);
    // 표 구분 행·가로줄·setext 밑줄과 참조 정의 줄은 글자가 화면에 없다.
    if (!TABLE_RULE.test(line) && !REF_DEF.test(line)) emitLine(line, p, text, offs);
    if (e < to) {
      text.push("\n");
      offs.push(e);
    }
    p = e + 1;
  }
  return { text: text.join(""), offs };
}

function emitLine(line: string, base: number, text: string[], offs: number[]) {
  let head = FOOTNOTE_HEAD.exec(line)?.[0].length ?? 0;
  if (!head) head = LINE_HEAD.exec(line)?.[0].length ?? 0;
  const hidden = new Uint8Array(line.length);
  for (let i = 0; i < head; i++) hidden[i] = 1;
  for (const re of HIDE) {
    re.lastIndex = 0;
    for (let m = re.exec(line); m; m = re.exec(line)) {
      if (AUTOLINK.test(m[0])) continue;
      // 링크 주소·참조는 `]` 부터 잡히므로 `]` 자체는 남긴다(글자가 아니라 정렬이 건너뛴다).
      const s = m.index + (m[0].startsWith("]") ? 1 : 0);
      for (let i = s; i < m.index + m[0].length; i++) hidden[i] = 1;
    }
  }
  for (let i = 0; i < line.length; i++) {
    if (hidden[i]) continue;
    if (line[i] === "\\" && i + 1 < line.length && /[!-/:-@[-`{-~]/.test(line[i + 1])) continue; // 이스케이프 기호
    text.push(line[i]);
    offs.push(base + i);
  }
}

/** 타이포그래퍼·공백 차이를 같은 글자로. */
function norm(ch: string): string {
  switch (ch) {
    case "“":
    case "”":
    case "„":
      return '"';
    case "‘":
    case "’":
      return "'";
    case "–":
    case "—":
      return "-";
    case "…":
      return ".";
    case " ":
    case "\n":
    case "\t":
    case "\r":
      return " ";
    default:
      return ch;
  }
}

/** 렌더 글자 i → 소스 위치(맞는 글자가 없으면 -1). */
export function alignRendered(vis: Visible, rendered: string): Int32Array {
  const map = new Int32Array(rendered.length).fill(-1);
  const a = Array.from({ length: vis.text.length }, (_, i) => norm(vis.text[i]));
  const b = Array.from({ length: rendered.length }, (_, i) => norm(rendered[i]));
  for (const r of diffSeq(a, b, (x, y) => x === y, 4000)) {
    if (r.kind !== "eq") continue;
    for (let k = 0; k < r.b1 - r.b0; k++) map[r.b0 + k] = vis.offs[r.a0 + k];
  }
  return map;
}

/** 렌더 범위 → 소스 범위. 양끝이 소스 없는 글자면 안쪽의 맞은 글자로 당긴다. */
export function renderedToSource(map: Int32Array, rStart: number, rEnd: number): { start: number; end: number } | null {
  let s = rStart;
  while (s < rEnd && map[s] < 0) s++;
  let e = rEnd - 1;
  while (e >= s && map[e] < 0) e--;
  if (s > e) return null;
  return { start: map[s], end: map[e] + 1 };
}

/** 소스 범위 → 렌더 범위(그 블록 안). 범위 안의 맞은 렌더 글자들의 처음과 끝. */
export function sourceToRendered(map: Int32Array, sStart: number, sEnd: number): { start: number; end: number } | null {
  let s = -1;
  let e = -1;
  for (let i = 0; i < map.length; i++) {
    const o = map[i];
    if (o >= sStart && o < sEnd) {
      if (s < 0) s = i;
      e = i;
    }
  }
  return s < 0 ? null : { start: s, end: e + 1 };
}

/** 범위 펜을 못 다는 블록 — 렌더 글자와 소스 글자의 대응이 성립하지 않는다(점·세로줄만). */
export function rangeable(el: { tagName: string; classList?: { contains(c: string): boolean } }): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "pre" || tag === "math" || tag === "svg") return false;
  const cl = el.classList;
  if (cl && (cl.contains("mermaid") || cl.contains("mermaid-rendered") || cl.contains("katex-display"))) return false;
  return true;
}

/** 줄 번호(0부터) → 그 줄이 시작하는 소스 위치. */
export function lineStarts(src: string): number[] {
  const s = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) s.push(i + 1);
  return s;
}
