/**
 * 내보내기에 표시·메모를 담는다(ADR 0003 9절 — 기본 꺼짐).
 *
 * - **HTML** = 글자를 감싸는 **CSS 표시**(`span.annot-x`). 받는 사람이 창 폭을 바꾸면 구운 SVG 는 어긋난다 —
 *   한 번 만들고 끝나는 문서라 DOM 을 감싸도 된다. 점 표시·세로줄은 블록에 클래스.
 * - **PDF** = HTML 과 같은 CSS 표시(ADR 은 SVG 굽기였다 — 인쇄 쪽 폭이 대화상자에서 정해져 미리 잰 좌표를 믿을 수 없다).
 * - **메모** = 두 형식 모두 본문 끝 번호 절. 화면의 ①② 와 같은 번호(resolve.ts).
 * 해결됨·사라짐은 기본 제외, 바뀜은 지금 판에 표시하고 메모 절에 "원래 문장이 수정됨".
 */
import { DocIndex, domRange } from "./dom";
import type { Resolved } from "./resolve";
import { rangeable, sourceToRendered } from "./sourceMap";
import type { AnnotStyle } from "./pens";

export interface ExportTexts {
  notesTitle: string;
  meaning: (style: AnnotStyle) => string;
  changedNote: string;
}

/** 내보낼 표시 — 해결됨·사라짐 제외. */
export function exportable(rs: readonly Resolved[]): Resolved[] {
  return rs.filter((r) => !r.ann.resolved && r.state !== "gone");
}

/** HTML 내보내기용 CSS — 색은 이미 :root 에 있는 --mark-* (renderDoc). */
export const EXPORT_MARK_CSS =
  ".annot-x{--mk-ink:transparent;--mk-lead:currentColor;border-radius:2px}" +
  ["yellow", "orange", "pink", "green", "blue"].map((c) => `.annot-c-${c}{--mk-ink:var(--mark-${c}-ink);--mk-lead:var(--mark-${c}-lead)}`).join("") +
  ".annot-highlight{background:var(--mk-ink)}" +
  ".annot-underline{text-decoration:underline 2px var(--mk-lead);text-underline-offset:3px}" +
  ".annot-wavy{text-decoration:underline wavy 1.5px var(--mk-lead);text-underline-offset:3px}" +
  ".annot-strike{text-decoration:line-through 2px var(--mk-lead)}" +
  ".annot-circle{outline:1.5px solid var(--mk-lead);outline-offset:2px;border-radius:1em}" +
  ".annot-pt{position:relative}.annot-pt::before{position:absolute;inset-inline-start:-1.6em;color:var(--mk-lead);font-weight:700}" +
  ".annot-pt-star::before{content:'★'}.annot-pt-question::before{content:'?'}.annot-pt-exclaim::before{content:'!'}.annot-pt-check::before{content:'✓'}" +
  ".annot-pt-bar{box-shadow:inset 4px 0 0 var(--mk-ink);padding-inline-start:.6em}" +
  ".annot-n{font-size:.7em;color:var(--prose-muted);margin-inline-start:.15em}" +
  ".annot-notes{margin-top:2.4em;border-top:1px solid var(--prose-rule);padding-top:.6em;font-size:.92em}" +
  ".annot-notes blockquote{margin:.2em 0 .3em}";

/** 메모 절(HTML 문자열이 아니라 노드로 — 메모 글은 textContent 로만 들어간다). */
export function appendNotes(doc: Document, root: Element, rs: readonly Resolved[], tx: ExportTexts): void {
  const items = exportable(rs).filter((r) => r.ann.note && r.badge);
  if (!items.length) return;
  const sec = doc.createElement("section");
  sec.className = "annot-notes";
  const h = doc.createElement("h2");
  h.textContent = tx.notesTitle;
  sec.appendChild(h);
  const ol = doc.createElement("ol");
  for (const r of items) {
    const li = doc.createElement("li");
    li.value = r.badge!;
    const head = doc.createElement("strong");
    head.textContent = tx.meaning(r.ann.style);
    li.appendChild(head);
    const q = doc.createElement("blockquote");
    q.textContent = r.after;
    li.appendChild(q);
    if (r.state === "changed") {
      const c = doc.createElement("p");
      c.textContent = `${tx.changedNote}: “${r.before}”`;
      li.appendChild(c);
    }
    const n = doc.createElement("p");
    n.textContent = r.ann.note!;
    li.appendChild(n);
    ol.appendChild(li);
  }
  sec.appendChild(ol);
  root.appendChild(sec);
}

/**
 * 렌더된 본문 HTML 에 CSS 표시를 감싼다. `bodyHtml` 은 정화가 끝난 마크업, `canon` 은 그것을 그린 글(정규화).
 * 감싸는 요소는 앱이 만든 span·sup 뿐이고 클래스는 열거값이다.
 */
export function wrapMarks(
  bodyHtml: string,
  canon: string,
  rs: readonly Resolved[],
  opts: { marks: boolean; notes: boolean },
  tx: ExportTexts,
): string {
  const withNotes = opts.notes;
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body><div class="md">${bodyHtml}</div></body></html>`, "text/html");
  const root = doc.querySelector(".md")!;
  const idx = new DocIndex(doc, canon);
  // 뒤에서부터 감싼다 — 앞에서 감싸면 같은 블록의 뒤 표시가 쓸 텍스트 노드가 쪼개져도 렌더 위치는 그대로라 괜찮지만,
  // 글자 지도(블록당 한 번 만든 것)는 textContent 기준이라 순서와 무관하다. 그래도 겹친 범위가 안쪽부터 감싸이게.
  for (const r of opts.marks ? [...exportable(rs)].reverse() : []) {
    const a = r.ann;
    const cls = `annot-c-${a.color}`;
    if (a.kind !== "range") {
      const b = idx.leaves(r.start, Math.max(r.start + 1, r.end))[0];
      if (b) b.el.classList.add("annot-pt", `annot-pt-${a.style}`, cls);
      continue;
    }
    let last: Node | null = null;
    for (const b of idx.leaves(r.start, r.end)) {
      if (!rangeable(b.el)) continue;
      const rr = sourceToRendered(idx.map(b), Math.max(r.start, b.start), Math.min(r.end, b.end));
      if (!rr) continue;
      const range = domRange(b.el, rr.start, rr.end);
      if (!range) continue;
      for (const t of textNodesIn(range)) {
        const span = doc.createElement("span");
        span.className = `annot-x annot-${a.style} ${cls}`;
        t.parentNode!.insertBefore(span, t);
        span.appendChild(t);
        last = span;
      }
    }
    if (withNotes && a.note && r.badge && last) {
      const sup = doc.createElement("sup");
      sup.className = "annot-n";
      sup.textContent = String(r.badge);
      last.parentNode!.insertBefore(sup, last.nextSibling);
    }
  }
  if (withNotes) appendNotes(doc, root, rs, tx);
  return root.innerHTML;
}

/** Range 안 텍스트 노드들 — 양끝은 잘라서(splitText) 범위만 남긴다. */
function textNodesIn(range: Range): Text[] {
  const doc = range.startContainer.ownerDocument!;
  let { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = range;
  if (sc.nodeType === 3 && so > 0) {
    const tail = (sc as Text).splitText(so);
    if (ec === sc) {
      ec = tail;
      eo -= so;
    }
    sc = tail;
    so = 0;
  }
  if (ec.nodeType === 3 && eo < (ec as Text).length) (ec as Text).splitText(eo);
  const out: Text[] = [];
  const root = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode! : range.commonAncestorContainer;
  const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let on = false;
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    if (n === sc) on = true;
    if (on && n.data.length) out.push(n);
    if (n === ec) break;
  }
  return out;
}
