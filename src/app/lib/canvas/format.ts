/**
 * JSON Canvas 1.0 (https://jsoncanvas.org/spec/1.0/, MIT) — 읽기·쓰기 (ADR 0004 1절).
 *
 * **모르는 필드는 보존한다** — 파싱한 객체를 그대로 들고 고치고 그대로 쓴다(복사해 새 모양으로 만들지 않는다).
 * 옵시디언이나 미래의 명세가 넣은 키를 우리가 지우면 안 된다. 그래서 타입은 "알려진 키 + 나머지"다.
 * 형식이 틀린 노드·선도 지우지 않는다 — 그리지 않을 뿐, 저장할 때 그대로 돌아간다(`valid*`).
 */

export type Side = "top" | "right" | "bottom" | "left";
export type End = "none" | "arrow";
export type NodeType = "text" | "file" | "link" | "group";

export interface CanvasNode {
  id: string;
  type: NodeType | string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  label?: string;
  background?: string;
  backgroundStyle?: string;
  [extra: string]: unknown;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: Side;
  toSide?: Side;
  fromEnd?: End;
  toEnd?: End;
  color?: string;
  label?: string;
  [extra: string]: unknown;
}

export interface CanvasDoc {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  [extra: string]: unknown;
}

export const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

export class CanvasParseError extends Error {}

/** 빈 글·공백이면 빈 캔버스(새로 만든 파일). JSON 이 아니면 던진다 — 조용히 빈 캔버스로 덮으면 저장 때 원본이 날아간다. */
export function parseCanvas(text: string): CanvasDoc {
  if (!text.trim()) return { nodes: [], edges: [] };
  let v: unknown;
  try {
    v = JSON.parse(text.replace(/^﻿/, ""));
  } catch (e) {
    throw new CanvasParseError(String(e));
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new CanvasParseError("not an object");
  const doc = v as CanvasDoc;
  if (doc.nodes === undefined) doc.nodes = [];
  if (doc.edges === undefined) doc.edges = [];
  if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) throw new CanvasParseError("nodes/edges must be arrays");
  return doc;
}

/** 옵시디언처럼 탭 들여쓰기. 끝 줄바꿈 없음(옵시디언과 같다 — 우리가 저장해도 diff 가 한 줄 늘지 않게). */
export function serializeCanvas(doc: CanvasDoc): string {
  return JSON.stringify(doc, null, "\t");
}

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

export function validNode(n: unknown): n is CanvasNode {
  if (!n || typeof n !== "object") return false;
  const o = n as CanvasNode;
  if (typeof o.id !== "string" || !o.id || typeof o.type !== "string") return false;
  if (!num(o.x) || !num(o.y) || !num(o.width) || !num(o.height) || o.width <= 0 || o.height <= 0) return false;
  if (o.type === "file") return typeof o.file === "string";
  if (o.type === "link") return typeof o.url === "string";
  if (o.type === "text") return typeof o.text === "string";
  return o.type === "group";
}

export function validEdge(e: unknown, ids: ReadonlySet<string>): e is CanvasEdge {
  if (!e || typeof e !== "object") return false;
  const o = e as CanvasEdge;
  return typeof o.id === "string" && ids.has(o.fromNode) && ids.has(o.toNode) && o.fromNode !== o.toNode;
}

/** 그릴 노드·선(형식이 맞는 것만). 원본 배열은 그대로 둔다. */
export function drawable(doc: CanvasDoc): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes = doc.nodes.filter(validNode);
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, edges: doc.edges.filter((e) => validEdge(e, ids)) };
}

/** 색: 프리셋 "1"~"6"(테마가 정한다) 또는 hex. 그 밖은 없는 것으로(CSS 에 문자열을 그대로 넣지 않는다). */
export function colorCss(c: unknown): string | null {
  if (typeof c !== "string") return null;
  if (/^[1-6]$/.test(c)) return `var(--canvas-c${c})`;
  if (/^#[0-9a-fA-F]{6}$/.test(c) || /^#[0-9a-fA-F]{3}$/.test(c)) return c;
  return null;
}

/** 옵시디언과 같은 모양의 id(16자리 hex). */
export function newCanvasId(): string {
  const a = new Uint8Array(8);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 노드 지우기 — 그 노드에 붙은 선도 함께(매달린 선은 옵시디언도 버린다). */
export function removeNode(doc: CanvasDoc, id: string): void {
  doc.nodes = doc.nodes.filter((n) => n?.id !== id);
  doc.edges = doc.edges.filter((e) => e?.fromNode !== id && e?.toNode !== id);
}

export function removeEdge(doc: CanvasDoc, id: string): void {
  doc.edges = doc.edges.filter((e) => e?.id !== id);
}

/** 화면에서 그룹을 늘 아래에 — 파일의 배열 순서는 건드리지 않는다(ADR 5절). */
export function paintOrder(nodes: readonly CanvasNode[]): CanvasNode[] {
  return [...nodes.filter((n) => n.type === "group"), ...nodes.filter((n) => n.type !== "group")];
}
