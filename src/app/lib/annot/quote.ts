/**
 * 렌더 인용(TextQuote — W3C Web Annotation 의 방식) — 칠한 글 + 앞뒤 문맥.
 *
 * 소스 범위가 진실원이고 이것은 보조다: 옮긴 범위가 렌더 글자와 맞아떨어지지 않을 때(렌더러가 바뀌었거나
 * 글자 지도가 못 맞춘 곳) 그 블록의 렌더 글 안에서 실제 위치를 다시 찾는다.
 */

export interface TextQuote {
  quote: string;
  prefix: string;
  suffix: string;
}

export const QUOTE_CONTEXT = 32;

export function makeQuote(text: string, start: number, end: number, ctx = QUOTE_CONTEXT): TextQuote {
  return {
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - ctx), start),
    suffix: text.slice(end, end + ctx),
  };
}

/**
 * `text` 안에서 인용을 찾는다. 같은 글이 여럿이면 앞뒤 문맥이 더 길게 맞는 쪽, 그다음 `hint` 에 가까운 쪽.
 * 못 찾으면 null — 비슷한 글을 억지로 고르지 않는다(조용히 틀린 표시가 가장 나쁘다).
 */
export function findQuote(text: string, q: TextQuote, hint?: number): { start: number; end: number } | null {
  if (!q.quote) return null;
  let best: { start: number; score: number; dist: number } | null = null;
  for (let i = text.indexOf(q.quote); i >= 0; i = text.indexOf(q.quote, i + 1)) {
    const j = i + q.quote.length;
    const score = commonSuffix(text.slice(Math.max(0, i - q.prefix.length), i), q.prefix) + commonPrefix(text.slice(j, j + q.suffix.length), q.suffix);
    const dist = hint === undefined ? 0 : Math.abs(i - hint);
    if (!best || score > best.score || (score === best.score && dist < best.dist)) best = { start: i, score, dist };
  }
  return best ? { start: best.start, end: best.start + q.quote.length } : null;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
