/**
 * 캔버스 드로잉(ADR 0004 6절) — 카드 *사이와 주변*에 긋는 색연필·형광펜. 캔버스는 좌표 자체가 콘텐츠라 자유 드로잉이
 * 어긋나지 않는다(리플로우 문서 위 드로잉을 기각한 ADR 0003 의 이유가 여기엔 없다).
 *
 * 저장: JSON Canvas 최상위 확장 필드 **`x-readme-ink`** = `{version, strokes:[{id, kind, color, points}]}`.
 * **옵시디언이 저장할 때 보존하는가** — 설치본(1.13.7)의 캔버스 직렬화가 최상위를 `{...this.data, nodes, edges}` 로, 노드·선을
 * `{...unknownData, …}` 로 쓴다(앱 번들 정적 확인 · 2026-10-13). 그래서 옆 파일로 빼지 않는다.
 * 우리도 `x-readme-ink` 안의 모르는 키는 그대로 둔다(다음 판이 넣을 것을 지우지 않게).
 */
import type { CanvasDoc } from "./format";
import type { AnnotColor } from "../annot/pens";

export const INK_KEY = "x-readme-ink";
export type InkKind = "pencil" | "marker";

export interface Stroke {
  id: string;
  kind: InkKind;
  color: AnnotColor;
  points: [number, number][];
  [extra: string]: unknown;
}

const COLORS = new Set(["yellow", "orange", "pink", "green", "blue"]);
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

function inkObj(doc: CanvasDoc): { version?: number; strokes?: unknown[]; [k: string]: unknown } | null {
  const v = doc[INK_KEY];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as { strokes?: unknown[] }) : null;
}

export function validStroke(s: unknown): s is Stroke {
  if (!s || typeof s !== "object") return false;
  const o = s as Stroke;
  return (
    typeof o.id === "string" &&
    SAFE_ID.test(o.id) &&
    (o.kind === "pencil" || o.kind === "marker") &&
    COLORS.has(o.color) &&
    Array.isArray(o.points) &&
    o.points.length >= 2 &&
    o.points.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  );
}

/** 그릴 획(형식이 맞는 것만). 틀린 것은 파일에 그대로 남는다. */
export function strokes(doc: CanvasDoc): Stroke[] {
  const o = inkObj(doc);
  return Array.isArray(o?.strokes) ? o!.strokes!.filter(validStroke) : [];
}

export function addStroke(doc: CanvasDoc, s: Stroke): void {
  let o = inkObj(doc);
  if (!o) {
    o = { version: 1, strokes: [] };
    doc[INK_KEY] = o;
  }
  if (!Array.isArray(o.strokes)) o.strokes = [];
  o.strokes.push({ ...s, points: s.points.map(([x, y]) => [round1(x), round1(y)]) });
}

/** (x,y) 반경 r 안을 지나는 획을 지운다(형광펜은 두꺼운 만큼 더). 지운 수를 돌려준다. 다 지우면 필드를 뺀다. */
export function eraseAt(doc: CanvasDoc, x: number, y: number, r: number): number {
  const o = inkObj(doc);
  if (!o || !Array.isArray(o.strokes)) return 0;
  const before = o.strokes.length;
  o.strokes = o.strokes.filter((s) => !(validStroke(s) && hits(s, x, y, r + (s.kind === "marker" ? 8 : 0))));
  const n = before - o.strokes.length;
  if (!o.strokes.length && Object.keys(o).every((k) => k === "version" || k === "strokes")) delete doc[INK_KEY];
  return n;
}

function hits(s: Stroke, x: number, y: number, r: number): boolean {
  const p = s.points;
  for (let i = 0; i < p.length; i++) {
    if (Math.hypot(p[i][0] - x, p[i][1] - y) <= r) return true;
    if (i > 0 && segDist(p[i - 1], p[i], x, y) <= r) return true;
  }
  return false;
}

function segDist(a: [number, number], b: [number, number], x: number, y: number): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)) : 0;
  return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y);
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 획 경로 — 점 사이 중점을 잇는 2차 곡선(손글씨처럼 부드럽게). */
export function smoothPath(pts: readonly [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]} l.1,0` : "";
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    d += ` Q${f(pts[i][0])},${f(pts[i][1])} ${f(m[0])},${f(m[1])}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${f(l[0])},${f(l[1])}`;
}

/** 획의 상자(필터 영역) — 표시 펜과 같은 이유로 획마다 자기 상자에 건다(층 전체에 걸면 다시 칠하기가 문서 크기를 따른다). */
export function strokeBox(s: Stroke, pad = 24): { x: number; y: number; w: number; h: number } {
  const xs = s.points.map((p) => p[0]);
  const ys = s.points.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  return { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 };
}
