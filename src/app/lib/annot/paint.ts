/**
 * 표시를 문서에 그린다 — 미리보기(AnnotLayer)와 PDF 인쇄 문서가 같은 함수를 쓴다(인쇄도 화면과 같은 질감).
 * `.md` 안에 SVG 두 층(글자 밑 / 위)을 만들어 채운다. `.md` 가 쌓임 맥락이어야 한다(`ANNOT_DOC_CSS`).
 */
import { DocIndex } from "./dom";
import { drawMark, layerInner, type LineBox } from "./draw";
import type { Resolved } from "./resolve";

/** 표시 층 자리 CSS — `.md` 가 쌓임 맥락이 되어야 글자 *밑* 층(z-index:-1)이 카드 배경 위·글자 아래에 온다. */
export const ANNOT_DOC_CSS =
  ".md{position:relative;z-index:0}" +
  ".annot-layer{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}" +
  ".annot-under{z-index:-1}.annot-over{z-index:1}";

export interface Geom {
  lines: LineBox[];
  mx?: number;
}

export function paintMarks(doc: Document, canon: string, resolved: readonly Resolved[], texture: boolean): { geoms: Map<string, Geom>; index: DocIndex | null } {
  const geoms = new Map<string, Geom>();
  const mdEl = doc.querySelector<HTMLElement>(".md");
  if (!mdEl) return { geoms, index: null };
  const idx = new DocIndex(doc, canon);
  const mr = mdEl.getBoundingClientRect();
  const base = { left: mr.left + mdEl.clientLeft, top: mr.top + mdEl.clientTop };
  const cs = doc.defaultView?.getComputedStyle(mdEl);
  const padL = cs ? parseFloat(cs.paddingLeft) || 0 : 0;
  const under: string[] = [];
  const over: string[] = [];
  const slots = new Map<number, number>();
  for (const r of resolved) {
    if (r.state === "gone") continue;
    const a = r.ann;
    let g: Geom | null = null;
    if (a.kind === "range") {
      const lines = idx.rangeRects(r.start, r.end, base);
      if (lines.length) g = { lines };
    } else {
      const b = idx.leaves(r.start, Math.max(r.start + 1, r.end))[0] ?? null;
      if (b) {
        const { first, box } = idx.blockBox(b, base);
        if (a.kind === "block") g = { lines: [box], mx: padL - 14 };
        else {
          const key = Math.round(first.y);
          const k = slots.get(key) ?? 0;
          slots.set(key, k + 1);
          g = { lines: [first], mx: padL - 26 - k * 22 };
        }
      }
    }
    if (!g) continue;
    geoms.set(a.id, g);
    const d = drawMark({ id: a.id, style: a.style, color: a.color, lines: g.lines, mx: g.mx, badge: r.badge }, texture);
    if (d.under) under.push(d.under);
    if (d.over) over.push(d.over);
  }
  const W = mdEl.clientWidth;
  const H = mdEl.clientHeight;
  for (const [cls, parts, isUnder] of [
    ["annot-under", under, true],
    ["annot-over", over, false],
  ] as const) {
    let svg = mdEl.querySelector<SVGSVGElement>(`:scope > svg.${cls}`);
    if (!svg) {
      svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", `annot-layer ${cls}`);
      svg.setAttribute("aria-hidden", "true");
      if (isUnder) mdEl.insertBefore(svg, mdEl.firstChild);
      else mdEl.appendChild(svg);
    }
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    // 앱이 만든 정적 마크업(숫자·열거값·var())만 — 문서 글·메모는 안 들어간다.
    svg.innerHTML = layerInner(parts);
  }
  return { geoms, index: idx };
}
