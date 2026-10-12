/**
 * 표시의 판 → 지금 판으로 범위를 옮긴다 (ADR 0003 2절 — 상태 넷).
 *
 * - same    그대로: 같은 글자, 같은 자리
 * - moved   옮겨짐: 같은 글자, 다른 자리(앞에서 무엇이 끼거나 빠졌다)
 * - changed 바뀜:   칠한 글자가 수정됨 — 지금 판의 대응 범위 + 이전/지금 글
 * - gone    사라짐: 칠한 글자가 통째로 지워짐
 *
 * "지금 판에서 어디냐"는 저장하지 않는다 — 열 때마다 이것으로 다시 구한다.
 */
import { textSegments, type Segment } from "./diff";

export type AnchorState = "same" | "moved" | "changed" | "gone";

export interface Relocated {
  state: AnchorState;
  /** 지금 판의 범위(gone 이면 사라진 자리, start === end). */
  start: number;
  end: number;
  /** 표시의 판에서 칠한 글. */
  before: string;
  /** 지금 판의 대응 글(gone 이면 ""). */
  after: string;
}

/** 줄끝 LF · BOM 없음 — 표시의 글자 위치는 언제나 이 형태 기준이다(편집기·미리보기가 보는 글과 같다). */
export function canonicalText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/** 같은 두 판 사이에서 여러 표시를 옮길 때 diff 를 한 번만 하도록. */
export class Relocator {
  readonly segs: Segment[];
  constructor(
    readonly oldText: string,
    readonly newText: string,
  ) {
    this.segs = oldText === newText ? [{ eq: true, o0: 0, o1: oldText.length, n0: 0, n1: newText.length }] : textSegments(oldText, newText);
  }

  relocate(start: number, end: number): Relocated {
    const { oldText, newText, segs } = this;
    start = clamp(start, 0, oldText.length);
    end = clamp(end, start, oldText.length);
    const before = oldText.slice(start, end);

    let touched = false;
    for (let i = this.first(start); i < segs.length; i++) {
      const s = segs[i];
      if (s.o0 > end || (s.o0 === end && end > start)) break;
      if (s.eq) continue;
      const overlaps = s.o0 < end && s.o1 > start;
      // 범위 안쪽(경계가 아닌 곳)에 끼어든 글도 범위를 바꾼다.
      const insideInsert = s.o0 === s.o1 && s.o0 > start && s.o0 < end;
      if (overlaps || insideInsert) {
        touched = true;
        break;
      }
    }

    let ns = this.map(start, "start");
    let ne = this.map(end, "end");
    if (!touched) {
      return { state: ns === start && ne === end ? "same" : "moved", start: ns, end: ne, before, after: newText.slice(ns, ne) };
    }
    // 바뀐 쪽 가장자리의 공백은 범위에서 뺀다.
    while (ns < ne && /\s/.test(newText[ns])) ns++;
    while (ne > ns && /\s/.test(newText[ne - 1])) ne--;
    if (ne <= ns) return { state: "gone", start: ns, end: ns, before, after: "" };
    return { state: "changed", start: ns, end: ne, before, after: newText.slice(ns, ne) };
  }

  /** p 를 포함하거나 p 뒤에 오는 첫 구간(o1 >= p) — 이분 탐색. */
  private first(p: number): number {
    const segs = this.segs;
    let lo = 0;
    let hi = segs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].o1 < p) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * 옛 위치 → 새 위치. 시작은 p 에서 **시작하는** 글자의 구간(o0 <= p < o1)으로, 끝은 p 에서 **끝나는**
   * 글자의 구간(o0 < p <= o1)으로 본다 — 그래야 범위 바로 앞·뒤에 끼어든 글이 범위에 안 섞인다.
   * 바뀐 구간 안쪽이면 시작은 그 구간의 앞, 끝은 그 구간의 뒤로 넓힌다.
   */
  private map(p: number, side: "start" | "end"): number {
    const segs = this.segs;
    if (side === "end" && p === 0) return 0;
    for (let i = Math.max(0, this.first(p) - 1); i < segs.length; i++) {
      const s = segs[i];
      if (s.o0 === s.o1) continue; // 순수 삽입은 옛 글자가 없다
      const hit = side === "start" ? s.o0 <= p && p < s.o1 : s.o0 < p && p <= s.o1;
      if (!hit) {
        if (s.o0 > p) break;
        continue;
      }
      if (s.eq) return s.n0 + (p - s.o0);
      return side === "start" ? s.n0 : s.n1;
    }
    return this.newText.length;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 0 부터 센 줄 번호(브리지 `list_annotations` 의 `line` 은 여기에 1 을 더한다). */
export function lineAt(text: string, offset: number): number {
  let n = 0;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
