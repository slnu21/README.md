/**
 * 표시 펜의 diff — 스냅샷 원문(표시의 판) ↔ 지금 원문 (ADR 0003 "가장 어려운 곳").
 *
 * 줄 단위 Myers 로 바뀐 덩어리를 찾고, 덩어리 안은 **낱말 단위**로 다시 가른다. 글자 단위로 가르면
 * 다시 쓴 문장 속 흔한 글자(조사·공백)가 우연히 맞아 범위가 조각난다. 새 의존성을 피하려고 직접 짠다.
 *
 * 결과는 두 글을 처음부터 끝까지 덮는 구간 목록이다 — `eq` 는 같은 글자, 아니면 옛 구간이 새 구간으로
 * 바뀐 것(어느 쪽이 비어도 된다 = 순수 삭제·삽입).
 */

export interface Run {
  kind: "eq" | "del" | "ins";
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

/** 이 이상 고치면 덩어리 하나로 본다. 메모리가 편집 거리의 제곱으로 자라서다. */
const MAX_EDITS = 2000;

/**
 * 두 배열의 최소 편집 — 같은 것 · 지움 · 넣음 구간들. 앞뒤 공통부를 먼저 떼어 Myers 를 가운데만 돌린다.
 */
export function diffSeq<T>(
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean = Object.is,
  maxEdits = MAX_EDITS,
): Run[] {
  const n = a.length;
  const m = b.length;
  let pre = 0;
  while (pre < n && pre < m && eq(a[pre], b[pre])) pre++;
  let suf = 0;
  while (suf < n - pre && suf < m - pre && eq(a[n - 1 - suf], b[m - 1 - suf])) suf++;

  const out: Run[] = [];
  if (pre > 0) out.push({ kind: "eq", a0: 0, a1: pre, b0: 0, b1: pre });
  const core = myers(a, b, pre, n - suf, pre, m - suf, eq, maxEdits);
  for (const r of core) push(out, r);
  if (suf > 0) push(out, { kind: "eq", a0: n - suf, a1: n, b0: m - suf, b1: m });
  return out;
}

function push(out: Run[], r: Run) {
  if (r.a0 === r.a1 && r.b0 === r.b1) return;
  const last = out[out.length - 1];
  if (last && last.kind === r.kind && last.a1 === r.a0 && last.b1 === r.b0) {
    last.a1 = r.a1;
    last.b1 = r.b1;
  } else out.push({ ...r });
}

function myers<T>(
  a: readonly T[],
  b: readonly T[],
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
  eq: (x: T, y: T) => boolean,
  maxEdits: number,
): Run[] {
  const N = aHi - aLo;
  const M = bHi - bLo;
  if (N === 0 && M === 0) return [];
  const coarse = (): Run[] => {
    const r: Run[] = [];
    if (N) r.push({ kind: "del", a0: aLo, a1: aHi, b0: bLo, b1: bLo });
    if (M) r.push({ kind: "ins", a0: aHi, a1: aHi, b0: bLo, b1: bHi });
    return r;
  };
  if (N === 0 || M === 0) return coarse();

  const MAX = Math.min(N + M, maxEdits);
  const off = MAX + 1;
  const v = new Int32Array(2 * MAX + 3);
  // trace[d] = 반복 d 를 시작할 때의 v 중 k∈[-(d+1), d+1] 만 (메모리 O(D²)).
  const trace: Int32Array[] = [];
  let found = -1;
  outer: for (let d = 0; d <= MAX; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && eq(a[aLo + x], b[bLo + y])) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= N && y >= M) {
        found = d;
        break outer;
      }
    }
  }
  if (found < 0) return coarse();

  // 뒤에서부터 걸음을 되짚는다.
  const steps: Run[] = [];
  let x = N;
  let y = M;
  for (let d = found; d >= 0; d--) {
    const t = trace[d];
    const at = (k: number) => t[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      steps.push({ kind: "eq", a0: aLo + x, a1: aLo + x + 1, b0: bLo + y, b1: bLo + y + 1 });
    }
    if (d > 0) {
      if (x === prevX) steps.push({ kind: "ins", a0: aLo + x, a1: aLo + x, b0: bLo + prevY, b1: bLo + prevY + 1 });
      else steps.push({ kind: "del", a0: aLo + prevX, a1: aLo + prevX + 1, b0: bLo + y, b1: bLo + y });
    }
    x = prevX;
    y = prevY;
  }
  const out: Run[] = [];
  for (let i = steps.length - 1; i >= 0; i--) push(out, steps[i]);
  return out;
}

/** 두 글의 글자 구간. `eq` 가 아니면 옛 [o0,o1) 가 새 [n0,n1) 로 바뀐 것. */
export interface Segment {
  eq: boolean;
  o0: number;
  o1: number;
  n0: number;
  n1: number;
}

/** 줄을 줄바꿈과 함께 자른다(오프셋을 더하면 원문 위치가 된다). */
export function splitLines(text: string): string[] {
  if (!text) return [];
  return text.split(/(?<=\n)/);
}

const TOKEN = /[\p{L}\p{N}_]+|[^\S\n]+|\n|[^\p{L}\p{N}_\s]/gu;

/** 낱말 · 공백 · 구두점 하나씩. 한글 어절은 한 낱말이다. */
export function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/**
 * 옛 글 → 새 글의 글자 구간. 줄 diff 로 바뀐 덩어리를 찾고, 그 안을 낱말 diff 로 좁힌다.
 */
export function textSegments(oldText: string, newText: string): Segment[] {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const oStart = starts(oldLines);
  const nStart = starts(newLines);
  const runs = diffSeq(oldLines, newLines);

  const out: Segment[] = [];
  let i = 0;
  while (i < runs.length) {
    const r = runs[i];
    if (r.kind === "eq") {
      addSeg(out, true, oStart[r.a0], oStart[r.a1], nStart[r.b0], nStart[r.b1]);
      i++;
      continue;
    }
    // 이어지는 del/ins 를 덩어리 하나로.
    let a0 = r.a0, a1 = r.a1, b0 = r.b0, b1 = r.b1;
    i++;
    while (i < runs.length && runs[i].kind !== "eq") {
      a1 = Math.max(a1, runs[i].a1);
      b1 = Math.max(b1, runs[i].b1);
      a0 = Math.min(a0, runs[i].a0);
      b0 = Math.min(b0, runs[i].b0);
      i++;
    }
    hunk(out, oldText, newText, oStart[a0], oStart[a1], nStart[b0], nStart[b1]);
  }
  return out;
}

function starts(lines: string[]): number[] {
  const s = new Array<number>(lines.length + 1);
  s[0] = 0;
  for (let i = 0; i < lines.length; i++) s[i + 1] = s[i] + lines[i].length;
  return s;
}

function hunk(out: Segment[], oldText: string, newText: string, o0: number, o1: number, n0: number, n1: number) {
  const ot = tokenize(oldText.slice(o0, o1));
  const nt = tokenize(newText.slice(n0, n1));
  const os = starts(ot).map((p) => p + o0);
  const ns = starts(nt).map((p) => p + n0);
  const runs = diffSeq(ot, nt);
  // 다시 쓴 문장에서는 공백·구두점이 우연히 맞는다 — 바뀐 것 사이에 낀 그런 eq 는 바뀐 것으로 본다.
  // 안 그러면 "근거가 부족하다 — …" → "세 번 다시 …" 에서 칠한 범위가 "세 번" 으로 줄어든다.
  const noise = (r: Run) => r.kind === "eq" && ot.slice(r.a0, r.a1).every((t) => !/[\p{L}\p{N}]/u.test(t));
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const between = i > 0 && i < runs.length - 1 && runs[i - 1].kind !== "eq" && runs[i + 1].kind !== "eq";
    addSeg(out, r.kind === "eq" && !(between && noise(r)), os[r.a0], os[r.a1], ns[r.b0], ns[r.b1]);
  }
}

function addSeg(out: Segment[], eq: boolean, o0: number, o1: number, n0: number, n1: number) {
  if (o0 === o1 && n0 === n1) return;
  const last = out[out.length - 1];
  if (last && last.eq === eq && last.o1 === o0 && last.n1 === n0) {
    last.o1 = o1;
    last.n1 = n1;
  } else out.push({ eq, o0, o1, n0, n1 });
}
