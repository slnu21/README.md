/**
 * 캔버스 기하 — 연결점 · 자동 변 · 선 곡선 · 달라붙기 · 화면↔세계 좌표 (ADR 0004 4·5절, 시안 canvas.html 에서 옮김).
 */
import type { CanvasEdge, CanvasNode, Side } from "./format";

export type Pt = [number, number];

const NORM: Record<Side, Pt> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

export function anchor(n: CanvasNode, side: Side): Pt {
  switch (side) {
    case "top":
      return [n.x + n.width / 2, n.y];
    case "bottom":
      return [n.x + n.width / 2, n.y + n.height];
    case "left":
      return [n.x, n.y + n.height / 2];
    default:
      return [n.x + n.width, n.y + n.height / 2];
  }
}

/** 변이 저장 안 된 선의 자동 변(옵시디언과 같은 규칙 — 중심끼리 더 먼 축). */
export function autoSides(a: CanvasNode, b: CanvasNode): [Side, Side] {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ["right", "left"] : ["left", "right"]) : dy > 0 ? ["bottom", "top"] : ["top", "bottom"];
}

export function edgeSides(e: CanvasEdge, a: CanvasNode, b: CanvasNode): [Side, Side] {
  const [as, bs] = autoSides(a, b);
  return [e.fromSide ?? as, e.toSide ?? bs];
}

/** 연결점에서 변의 바깥쪽으로 나가는 베지어. 화살표 머리와 라벨 자리(중점)도 함께. */
export function curve(p: Pt, s1: Side, q: Pt, s2: Side | null): { d: string; arrow: string; mid: Pt } {
  const dist = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const c = Math.max(30, Math.min(160, dist * 0.4));
  const n1 = NORM[s1];
  const n2: Pt = s2 ? NORM[s2] : [-(q[0] - p[0]) / (dist || 1), -(q[1] - p[1]) / (dist || 1)];
  const c1: Pt = [p[0] + n1[0] * c, p[1] + n1[1] * c];
  const c2: Pt = [q[0] + n2[0] * c, q[1] + n2[1] * c];
  const mid: Pt = [(p[0] + 3 * c1[0] + 3 * c2[0] + q[0]) / 8, (p[1] + 3 * c1[1] + 3 * c2[1] + q[1]) / 8];
  const f = (v: number) => v.toFixed(1);
  const d = `M${f(p[0])},${f(p[1])} C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(q[0])},${f(q[1])}`;
  const ang = Math.atan2(q[1] - c2[1], q[0] - c2[0]);
  const L = 11;
  const W = 5.5;
  const arrow =
    `M${f(q[0])},${f(q[1])} L${f(q[0] - L * Math.cos(ang) + W * Math.sin(ang))},${f(q[1] - L * Math.sin(ang) - W * Math.cos(ang))} ` +
    `L${f(q[0] - L * Math.cos(ang) - W * Math.sin(ang))},${f(q[1] - L * Math.sin(ang) + W * Math.cos(ang))}Z`;
  return { d, arrow, mid };
}

export function nearestSide(n: CanvasNode, x: number, y: number): Side {
  const d: [Side, number][] = [
    ["left", Math.abs(x - n.x)],
    ["right", Math.abs(x - n.x - n.width)],
    ["top", Math.abs(y - n.y)],
    ["bottom", Math.abs(y - n.y - n.height)],
  ];
  d.sort((a, b) => a[1] - b[1]);
  return d[0][0];
}

/** (x,y) 의 노드 — 그룹보다 카드, 같은 종류면 위(배열 뒤)에 있는 것. */
export function nodeAt(nodes: readonly CanvasNode[], x: number, y: number, except?: CanvasNode | null, pad = 0): CanvasNode | null {
  const hits = nodes.filter((n) => n !== except && x >= n.x - pad && x <= n.x + n.width + pad && y >= n.y - pad && y <= n.y + n.height + pad);
  return hits.filter((n) => n.type !== "group").pop() ?? hits.pop() ?? null;
}

/** 끌고 있는 선 끝이 붙을 곳 — 카드 밖 `pad`(세계 좌표)까지, 가장 가까운 변의 연결점. */
export function snapTarget(nodes: readonly CanvasNode[], x: number, y: number, except: CanvasNode | null, pad: number): { node: CanvasNode; side: Side } | null {
  const node = nodeAt(nodes, x, y, except, pad);
  return node ? { node, side: nearestSide(node, x, y) } : null;
}

/** 선 끝을 다른 연결점으로 옮긴다. **반대쪽 끝의 변을 지금 자리에 고정해 저장한다** — 변 없는 선은 자동 계산이라
 *  한쪽을 옮기면 반대쪽 출발 변까지 바뀐다(시안에서 사용자가 "출발지가 제멋대로"로 짚음, ADR 4절). */
export function relink(e: CanvasEdge, end: "from" | "to", target: CanvasNode, side: Side, fixedSide: Side): void {
  if (end === "from") {
    e.fromNode = target.id;
    e.fromSide = side;
    e.toSide = fixedSide;
  } else {
    e.toNode = target.id;
    e.toSide = side;
    e.fromSide = fixedSide;
  }
}

/** 그룹 안에 **완전히** 들어 있는 노드(그룹을 옮기면 같이 간다 — 옵시디언과 같은 동작). */
export function groupMembers(nodes: readonly CanvasNode[], g: CanvasNode): CanvasNode[] {
  return nodes.filter((m) => m !== g && m.x >= g.x && m.y >= g.y && m.x + m.width <= g.x + g.width && m.y + m.height <= g.y + g.height);
}

export interface View {
  x: number;
  y: number;
  k: number;
}

export const MIN_K = 0.15;
export const MAX_K = 2.5;
/** 이 배율 밑이면 카드는 제목만(ADR 3절). */
export const LOD_K = 0.72;

export function toWorld(v: View, px: number, py: number): Pt {
  return [(px - v.x) / v.k, (py - v.y) / v.k];
}

/** (px,py)(뷰포트 안 좌표)를 중심으로 확대·축소. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
  return { x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k, k };
}

/** 전부 보이게(뷰포트 W×H). 노드가 없으면 원점 100%. */
export function fitView(nodes: readonly CanvasNode[], W: number, H: number, pad = 60): View {
  if (!nodes.length) return { x: W / 2, y: H / 2, k: 1 };
  const x0 = Math.min(...nodes.map((n) => n.x));
  const x1 = Math.max(...nodes.map((n) => n.x + n.width));
  const y0 = Math.min(...nodes.map((n) => n.y - 30));
  const y1 = Math.max(...nodes.map((n) => n.y + n.height));
  const k = Math.max(MIN_K, Math.min(1.2, Math.min((W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0))));
  return { x: (W - (x1 - x0) * k) / 2 - x0 * k, y: (H - (y1 - y0) * k) / 2 - y0 * k, k };
}

export const snap10 = (v: number) => Math.round(v / 10) * 10;
