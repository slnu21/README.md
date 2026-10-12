/**
 * 표시 펜 — 미리보기 iframe 문서 쪽 글루. 순수 로직(diff·글자 지도·도형)은 옆 파일들에 있고 여기는
 * DOM 만 다룬다(그래서 vitest 가 아니라 `probe:annot` 이 실브라우저에서 잰다).
 *
 * 블록 = `data-line`·`data-line-end` 를 가진 요소(렌더러가 찍는다). 범위가 걸친 블록 중 **더 안쪽에 걸친
 * 블록이 없는 것**(잎)마다 소스 ↔ 렌더 글자 지도를 만들어 DOM Range 로 바꾼다.
 */
import { lineStarts, rangeable, renderedToSource, sourceToRendered, alignRendered, visibleChars } from "./sourceMap";
import { mergeLines, type LineBox } from "./draw";

export interface BlockInfo {
  el: HTMLElement;
  /** 소스 범위 [start, end) — 블록 줄들의 처음과 끝(끝 줄바꿈 포함). */
  start: number;
  end: number;
}

export class DocIndex {
  readonly blocks: BlockInfo[];
  private maps = new Map<HTMLElement, Int32Array>();
  constructor(
    readonly doc: Document,
    /** 정규화한 지금 판(canonicalText) — 렌더러가 그린 그 글. */
    readonly src: string,
  ) {
    const ls = lineStarts(src);
    const at = (line: number) => (line < ls.length ? ls[line] : src.length);
    this.blocks = [];
    const root = doc.querySelector(".md");
    if (!root) return;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-line][data-line-end]"))) {
      const a = Number(el.getAttribute("data-line"));
      const b = Number(el.getAttribute("data-line-end"));
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
      this.blocks.push({ el, start: at(a), end: at(b) });
    }
  }

  /** 렌더 글자 → 소스 위치 지도(블록마다 한 번). */
  map(b: BlockInfo): Int32Array {
    let m = this.maps.get(b.el);
    if (!m) {
      m = alignRendered(visibleChars(this.src, b.start, b.end), b.el.textContent ?? "");
      this.maps.set(b.el, m);
    }
    return m;
  }

  /** [s,e) 에 걸친 잎 블록들(문서 순서). */
  leaves(s: number, e: number): BlockInfo[] {
    const hit = this.blocks.filter((b) => b.start < e && b.end > s);
    return hit.filter((b) => !hit.some((o) => o !== b && b.el.contains(o.el)));
  }

  /** 노드를 품은 가장 안쪽 블록. */
  blockOf(node: Node | null): BlockInfo | null {
    let best: BlockInfo | null = null;
    for (const b of this.blocks) if (node && b.el.contains(node) && (!best || best.el.contains(b.el))) best = b;
    return best;
  }

  /** 소스 범위 → 줄 상자(기준 상자 `base` 의 왼쪽 위가 0,0). 범위 펜이 못 붙는 블록은 건너뛴다. */
  rangeRects(s: number, e: number, base: { left: number; top: number }): LineBox[] {
    const out: LineBox[] = [];
    for (const b of this.leaves(s, e)) {
      if (!rangeable(b.el)) continue;
      const r = sourceToRendered(this.map(b), Math.max(s, b.start), Math.min(e, b.end));
      if (!r) continue;
      const range = domRange(b.el, r.start, r.end);
      if (!range) continue;
      for (const c of Array.from(range.getClientRects())) {
        out.push({ x: c.left - base.left, y: c.top - base.top, w: c.width, h: c.height });
      }
    }
    return mergeLines(out);
  }

  /** 블록 상자(점·세로줄) — 블록의 첫 줄과 전체 상자. */
  blockBox(b: BlockInfo, base: { left: number; top: number }): { first: LineBox; box: LineBox } {
    const r = b.el.getBoundingClientRect();
    const box = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    const cs = b.el.ownerDocument.defaultView?.getComputedStyle(b.el);
    const lh = cs ? parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6 : 24;
    const padTop = cs ? parseFloat(cs.paddingTop) || 0 : 0;
    return { first: { x: box.x, y: box.y + padTop, w: box.w, h: Math.min(box.h, lh) }, box };
  }

  /** 사용자가 고른 DOM Range → 소스 범위. 양끝이 다른 블록이어도 된다. */
  selectionToSource(range: Range): { start: number; end: number } | null {
    const a = this.blockOf(range.startContainer);
    const z = this.blockOf(range.endContainer);
    if (!a || !z || !rangeable(a.el) || !rangeable(z.el)) return null;
    const sOff = offsetIn(a.el, range.startContainer, range.startOffset);
    const eOff = offsetIn(z.el, range.endContainer, range.endOffset);
    if (sOff == null || eOff == null) return null;
    const sm = this.map(a);
    const em = this.map(z);
    const s = a === z ? renderedToSource(sm, sOff, eOff) : null;
    if (a === z) return s;
    const s1 = renderedToSource(sm, sOff, sm.length);
    const e1 = renderedToSource(em, 0, eOff);
    if (!s1 || !e1 || e1.end <= s1.start) return null;
    return { start: s1.start, end: e1.end };
  }
}

/** 요소 안 렌더 글자 위치 → DOM Range(텍스트 노드를 따라간다 — textContent 와 같은 순서). */
export function domRange(el: HTMLElement, start: number, end: number): Range | null {
  const doc = el.ownerDocument;
  const w = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let sNode: Text | null = null;
  let sOff = 0;
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    const L = n.data.length;
    if (!sNode && start <= pos + L) {
      sNode = n;
      sOff = start - pos;
    }
    if (sNode && end <= pos + L) {
      const r = doc.createRange();
      r.setStart(sNode, sOff);
      r.setEnd(n, end - pos);
      return r;
    }
    pos += L;
  }
  return null;
}

/** (컨테이너, 오프셋) → 요소 안 렌더 글자 위치. */
function offsetIn(el: HTMLElement, node: Node, off: number): number | null {
  if (!el.contains(node) && node !== el) return null;
  const r = el.ownerDocument.createRange();
  r.selectNodeContents(el);
  r.setEnd(node, off);
  return r.toString().length;
}
