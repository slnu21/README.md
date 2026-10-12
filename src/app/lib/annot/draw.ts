/**
 * 표시 펜 그리기(ADR 0003 4절) — 순수. 줄 상자(LineBox) 목록 → SVG 문자열.
 *
 * 시안(`docs/mockups/annotation-pens.html`)의 도형을 그대로 옮겼다: 끌 촉 형광펜 · 손떨림 밑줄 · 물결 ·
 * 취소선 · 한 번에 휘갈긴 동그라미 · 별 · 체크 · 손글씨 ?! · 세로줄. **손떨림은 표시 id 를 시드로 한
 * 난수**라 같은 표시는 언제 그려도 같다(다시 그릴 때 떨리지 않는다). 질감은 SVG 필터(feTurbulence) —
 * 자산 0바이트, 오프라인. 끈 모드도 같은 경로에서 필터만 뺀다.
 *
 * 색은 `var(--mark-<color>-ink|lead)`(테마가 정한다, palette.ts). 만드는 마크업에는 **숫자와 열거값만**
 * 들어간다 — 인용문·메모 글은 iframe 에 넣지 않는다(메모 UI 는 부모 React 에 있다).
 */
import { isUnder, type AnnotColor, type AnnotStyle } from "./pens";

export interface LineBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 같은 줄 조각(굵게·코드·링크로 갈린 사각형)을 한 줄로 합친다. 폭 0 사각형은 버린다. */
export function mergeLines(rects: readonly LineBox[]): LineBox[] {
  const raw = rects.filter((r) => r.w > 0.5).map((r) => ({ ...r }));
  raw.sort((p, q) => p.y - q.y || p.x - q.x);
  const lines: LineBox[] = [];
  for (const c of raw) {
    const g = lines.find((L) => Math.abs(L.y + L.h / 2 - (c.y + c.h / 2)) < Math.min(L.h, c.h) * 0.5);
    if (!g) {
      lines.push(c);
      continue;
    }
    const x0 = Math.min(g.x, c.x);
    const x1 = Math.max(g.x + g.w, c.x + c.w);
    const y0 = Math.min(g.y, c.y);
    const y1 = Math.max(g.y + g.h, c.y + c.h);
    Object.assign(g, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return lines;
}

/** 시드 가능한 난수(mulberry32 + FNV 해시). */
export function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);

/** 질감 필터. 영역을 userSpaceOnUse 로 — 수평선은 bbox 높이가 0 이라 기본 영역이면 사라진다.
 *  **영역은 표시 하나의 상자**다. 처음엔 층 전체(카드 크기)에 걸었는데, 그러면 필터(feTurbulence)가 카드
 *  전체를 매번 다시 계산해 다시 칠하기가 두 배로 들었다(probe:annot — 957px 카드에서 16.7 → 33.3ms/프레임).
 *  표시마다 걸면 비용이 문서 길이가 아니라 칠한 넓이를 따른다. */
export function filterDefs(id: string, under: boolean, box: LineBox): string {
  const reg = `filterUnits="userSpaceOnUse" x="${f(box.x)}" y="${f(box.y)}" width="${f(box.w)}" height="${f(box.h)}" color-interpolation-filters="sRGB"`;
  if (under) {
    return (
      `<filter id="annot-hl-${id}" ${reg}>` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.04 0.09" numOctaves="2" seed="4" result="edge"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="edge" scale="3.5" xChannelSelector="R" yChannelSelector="G" result="rag"/>` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.006 0.5" numOctaves="2" seed="9" result="str"/>` +
      `<feColorMatrix in="str" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.6" result="stra"/>` +
      `<feComposite in="rag" in2="stra" operator="in"/></filter>`
    );
  }
  return (
    `<filter id="annot-pc-${id}" ${reg}>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="3" seed="2" result="g"/>` +
    `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.75" result="ga"/>` +
    `<feComposite in="SourceGraphic" in2="ga" operator="in" result="gr"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="1" seed="6" result="w"/>` +
    `<feDisplacementMap in="gr" in2="w" scale="1.4" xChannelSelector="R" yChannelSelector="G"/></filter>`
  );
}

/** 표시가 칠하는 넓이(필터 영역) — 줄 상자 · 여백 표시 · 메모 번호까지 넉넉히. */
function markBox(m: MarkGeom, mx: number): LineBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of m.lines) {
    x0 = Math.min(x0, l.x);
    y0 = Math.min(y0, l.y);
    x1 = Math.max(x1, l.x + l.w);
    y1 = Math.max(y1, l.y + l.h);
  }
  if (isPointLike(m.style)) {
    x0 = Math.min(x0, mx - 14);
    x1 = Math.max(x1, mx + 24);
  }
  if (m.badge) x1 += 24;
  return { x: x0 - 16, y: y0 - 14, w: x1 - x0 + 32, h: y1 - y0 + 28 };
}

// ── 도형 ───────────────────────────────────────────────────────────────────────
function hlPath(l: LineBox, r: () => number): string {
  const x0 = l.x - 2;
  const x1 = l.x + l.w + 2;
  const t = l.y + l.h * 0.1;
  const b = l.y + l.h * 0.93;
  const n = Math.max(2, Math.round((x1 - x0) / 36));
  const top: [number, number][] = [];
  const bot: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    top.push([x, t + (r() - 0.5) * 1.4]);
    bot.push([x, b + (r() - 0.5) * 1.4]);
  }
  top[0][0] += 3.5;
  bot[0][0] -= 0.5;
  top[n][0] += 0.5;
  bot[n][0] -= 3.5;
  return "M" + top.map((p) => f(p[0]) + "," + f(p[1])).join(" L") + " L" + bot.reverse().map((p) => f(p[0]) + "," + f(p[1])).join(" L") + "Z";
}

function jit(x0: number, y0: number, x1: number, y1: number, r: () => number, bow = 1.3): string {
  const mx = (x0 + x1) / 2 + (r() - 0.5) * 3;
  const my = (y0 + y1) / 2 + (r() - 0.5) * bow * 2;
  return `M${f(x0)},${f(y0)} Q${f(mx)},${f(my)} ${f(x1)},${f(y1)}`;
}

function wavyD(x0: number, x1: number, y: number, r: () => number): string {
  const lam = 6.4 + r() * 0.8;
  const ph = r() * 6;
  const drift = (r() - 0.5) * 1.2;
  let d = "";
  for (let x = x0; x <= x1 + 0.01; x += 1.1) {
    const k = (x - x0) / Math.max(1, x1 - x0);
    const a = 1.55 + Math.sin(x * 0.045 + ph) * 0.35;
    const yy = y + drift * k + a * Math.sin(((x - x0) / lam) * 2 * Math.PI + ph);
    d += (d ? " L" : "M") + f(x) + "," + yy.toFixed(2);
  }
  return d;
}

function loopD(cx: number, cy: number, rx: number, ry: number, r: () => number): string {
  const a0 = Math.PI * (0.75 + r() * 0.4);
  const turns = 1.1 + r() * 0.08;
  const p1 = r() * 6;
  const p2 = r() * 6;
  const N = 80;
  let d = "";
  for (let i = 0; i <= N; i++) {
    const t = a0 + (turns * 2 * Math.PI * i) / N;
    const k = 1 + 0.05 * Math.sin(2 * t + p1) + 0.03 * Math.sin(3 * t + p2) + (0.07 * i) / N;
    d += (d ? " L" : "M") + f(cx + rx * k * Math.cos(t)) + "," + f(cy + ry * k * Math.sin(t));
  }
  return d;
}

function starD(cx: number, cy: number, R: number, r: () => number): string {
  const rot = (r() - 0.5) * 0.35;
  const pts: [number, number][] = [];
  for (let k = 0; k <= 5; k++) {
    const a = -Math.PI / 2 + rot + (k * 4 * Math.PI) / 5;
    const rr = R * (0.9 + r() * 0.2);
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  const [a, b] = [pts[5], pts[1]];
  pts[5] = [a[0] + (b[0] - a[0]) * 0.12, a[1] + (b[1] - a[1]) * 0.12];
  return "M" + pts.map((p) => f(p[0]) + "," + f(p[1])).join(" L");
}

function checkD(cx: number, cy: number, r: () => number): string {
  const j = () => (r() - 0.5) * 1.2;
  return `M${f(cx - 7 + j())},${f(cy - 1 + j())} Q${f(cx - 4)},${f(cy + 2)} ${f(cx - 2 + j())},${f(cy + 6)} Q${f(cx + 2)},${f(cy - 3)} ${f(cx + 9 + j())},${f(cy - 9 + j())}`;
}

function barPath(x: number, y0: number, y1: number, r: () => number): string {
  const w = 5.5;
  const n = Math.max(2, Math.round((y1 - y0) / 30));
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    L.push([x + (r() - 0.5) * 1.2, y]);
    R.push([x + w + (r() - 0.5) * 1.2, y]);
  }
  L[0][1] += 2.5;
  R[n][1] -= 2.5;
  return "M" + L.map((p) => f(p[0]) + "," + f(p[1])).join(" L") + " L" + R.reverse().map((p) => f(p[0]) + "," + f(p[1])).join(" L") + "Z";
}

const lead = (c: AnnotColor) => `var(--mark-${c}-lead)`;
const ink = (c: AnnotColor) => `var(--mark-${c}-ink)`;

function pencil(d: string, color: AnnotColor, texture: boolean, w = 1.7): string {
  const s = `stroke:${lead(color)};stroke-width:${w};fill:none;stroke-linecap:round;stroke-linejoin:round`;
  const main = `<path d="${d}" style="${s}"/>`;
  if (!texture) return main;
  // 심이 두 번 지나간 듯 — 두 번째 획은 얇고 옅게.
  return main + `<path d="${d}" transform="translate(.45 .35)" style="${s};stroke-width:${w * 0.6};opacity:.5"/>`;
}

function glyph(ch: "?" | "!" | string, x: number, y: number, color: AnnotColor, size = 21): string {
  return (
    `<text x="${f(x)}" y="${f(y)}" style="fill:${lead(color)};font-family:'Ink Free','Segoe Print','Comic Sans MS',cursive;` +
    `font-size:${size}px;font-weight:700" text-anchor="middle" dominant-baseline="central">${ch}</text>`
  );
}

export interface MarkGeom {
  /** 영숫자·`-` 만(저장 때 Rust 가 좁힌 값) — 그래도 여기서 다시 거른다. */
  id: string;
  style: AnnotStyle;
  color: AnnotColor;
  /** 범위 펜: 줄 상자들. 점·세로줄: 블록 첫 줄(또는 블록 상자) 하나. */
  lines: LineBox[];
  /** 점 표시·세로줄의 x(왼쪽 여백). */
  mx?: number;
  /** 메모 번호(1부터). 있으면 끝에 손글씨 번호. */
  badge?: number;
}

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

/** 표시 하나 → 글자 밑 층 · 글자 위 층 조각. */
export function drawMark(m: MarkGeom, texture: boolean): { under: string; over: string } {
  if (!SAFE_ID.test(m.id) || !m.lines.length) return { under: "", over: "" };
  const r = rng(m.id + m.style);
  const c = m.color;
  const l0 = m.lines[0];
  const mx = m.mx ?? l0.x - 20;
  let u = "";
  let o = "";
  switch (m.style) {
    case "highlight":
      for (const l of m.lines) u += `<path d="${hlPath(l, r)}" style="fill:${ink(c)}"/>`;
      break;
    case "underline":
      for (const l of m.lines) {
        const y = l.y + l.h - 0.5;
        o += pencil(jit(l.x - 1 - r() * 2, y + (r() - 0.5), l.x + l.w + 1 + r() * 3, y + (r() - 0.5) * 1.8, r), c, texture);
      }
      break;
    case "wavy":
      for (const l of m.lines) o += pencil(wavyD(l.x - 1, l.x + l.w + 1, l.y + l.h + 0.5, r), c, texture, 1.45);
      break;
    case "strike":
      for (const l of m.lines) {
        const y = l.y + l.h * 0.55;
        o += pencil(jit(l.x - 3, y + (r() - 0.5) * 1.5, l.x + l.w + 3, y + (r() - 0.5) * 2.2, r, 0.6), c, texture, 1.8);
      }
      break;
    case "circle":
      for (const l of m.lines) o += pencil(loopD(l.x + l.w / 2, l.y + l.h / 2, l.w / 2 + 9, l.h / 2 + 4, r), c, texture, 1.6);
      break;
    case "star":
      o += pencil(starD(mx, l0.y + l0.h / 2, 8.5, r), c, texture, 1.7);
      break;
    case "check":
      o += pencil(checkD(mx, l0.y + l0.h / 2, r), c, texture, 2);
      break;
    case "question":
      o += glyph("?", mx, l0.y + l0.h / 2, c);
      break;
    case "exclaim":
      o += glyph("!", mx, l0.y + l0.h / 2, c);
      break;
    case "bar":
      u += `<path d="${barPath(mx, l0.y + 2, l0.y + l0.h - 2, r)}" style="fill:${ink(c)}"/>`;
      break;
  }
  if (m.badge && Number.isInteger(m.badge) && m.badge > 0) {
    const last = m.lines[m.lines.length - 1];
    const bx = isPointLike(m.style) ? mx + 13 : last.x + last.w + 9;
    const by = last.y + 3;
    const rb = rng("b" + m.id);
    o += `<g class="annot-badge">${pencil(loopD(bx, by, 6.5, 6, rb), c, texture, 1.1)}${glyph(String(m.badge), bx, by + 0.5, c, 11)}</g>`;
  }
  const box = texture ? markBox(m, mx) : null;
  const g = (inner: string, under: boolean) => {
    if (!inner) return "";
    const body = box ? `<defs>${filterDefs(m.id, under, box)}</defs><g filter="url(#annot-${under ? "hl" : "pc"}-${m.id})">${inner}</g>` : inner;
    return `<g class="annot-m" data-id="${m.id}">${body}</g>`;
  };
  return { under: g(u, true), over: g(o, false) };
}

function isPointLike(style: AnnotStyle): boolean {
  return style === "star" || style === "question" || style === "exclaim" || style === "check" || style === "bar";
}

/** 층 하나의 SVG 내용 — 필터는 표시마다 들고 있으므로 이어 붙이기만 한다. */
export function layerInner(parts: string[]): string {
  return parts.join("");
}

/** 그 펜이 어느 층에 그리는가(테스트·호출부 편의). */
export const layerOf = (style: AnnotStyle): "under" | "over" => (isUnder(style) ? "under" : "over");
