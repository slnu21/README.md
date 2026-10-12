// 캔버스 — JSON Canvas 위의 "문서 지도"(ADR 0004). 화이트보드가 아니라 **문서로 가는 길**이다.
//
// - 파일은 디스크의 `.canvas`(옵시디언과 같은 형식). 탭 내용이 곧 JSON 이고, 고치면 그 글을 다시 써서 탭에 돌려준다 —
//   저장·자동저장·되돌리기·밖에서 고침 감지가 다른 문서와 똑같이 돈다.
// - 렌더: DOM 카드 + SVG 선 + CSS transform. **층 순서가 곧 동작**(ADR 5절): 그룹 → 선 → 카드 → 라벨 → 선 끝 손잡이.
// - 카드는 두 단계: 72% 밑이면 제목만(멀리서도 읽히게 크게), 위면 아웃라인 + 첫 문단. 본문 렌더(수식·다이어그램)는 안 한다.
// - **함정**: transform:scale 된 world 안에 overflow 를 가진 flex 항목이 있으면 크롬이 노드 묶음을 통째로 안 그린다(시안 실측) →
//   카드 안은 블록 배치만, 자르기는 카드(absolute + overflow:hidden)에 맡긴다. `probe:canvas` 가 지킨다.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store";
import { sanitizeHtml } from "../lib/sanitize";
import { loadMarkdown } from "../lib/markdownLazy";
import { openExternalUrl } from "../lib/tauri";
import {
  colorCss,
  drawable,
  newCanvasId,
  paintOrder,
  parseCanvas,
  removeEdge,
  removeNode,
  serializeCanvas,
  type CanvasDoc,
  type CanvasEdge,
  type CanvasNode,
  type Side,
} from "../lib/canvas/format";
import { anchor, curve, edgeSides, fitView, groupMembers, LOD_K, relink, snap10, snapTarget, toWorld, zoomAt, type Pt, type View } from "../lib/canvas/geometry";
import { fileCandidates, pathForNode } from "../lib/canvas/paths";
import { loadCards, vaultRoot, type CardInfo } from "../lib/canvas/cards";
import { isReadable } from "../lib/fileTypes";
import "./canvas.css";

const SIDES: Side[] = ["top", "right", "bottom", "left"];
/** 캔버스마다 마지막 시점(세션 동안) — 탭을 오가도 보던 자리. */
const views = new Map<string, View>();

type Drag =
  | { type: "pan"; cx: number; cy: number; x: number; y: number }
  | { type: "move"; sx: number; sy: number; items: { m: CanvasNode; x: number; y: number }[]; moved: boolean }
  | { type: "resize"; n: CanvasNode; sx: number; sy: number; w: number; h: number }
  | { type: "link"; from: CanvasNode; side: Side }
  | { type: "relink"; e: CanvasEdge; end: "from" | "to"; fixed: CanvasNode; side: Side };

type Sel = { kind: "node" | "edge"; id: string } | null;

interface Props {
  path: string;
  content: string;
  onChange: (next: string) => void;
  /** file 노드 더블클릭 — 그 문서를 탭으로(줄이 있으면 그 줄로). */
  onOpenFile: (absPath: string, line?: number) => void;
}

/** 마지막 렌더 비용 · 그린 횟수 — probe:canvas 가 읽는다. */
export const canvasPerf = { renders: 0 };

export function CanvasView({ path, content, onChange, onOpenFile }: Props) {
  const { t } = useTranslation();
  const inbox = useAppStore((s) => s.inbox);
  const tabs = useAppStore((s) => s.tabs);
  const recent = useAppStore((s) => s.recent);
  const vpRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<CanvasDoc>({ nodes: [], edges: [] });
  const written = useRef<string | null>(null);
  const [rev, setRev] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(() => views.get(path) ?? { x: 80, y: 80, k: 1 });
  const [sel, setSel] = useState<Sel>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [temp, setTemp] = useState<{ p: Pt; side: Side; q: Pt; qSide: Side | null } | null>(null);
  const [snapAt, setSnapAt] = useState<{ id: string; side: Side } | null>(null);
  const [cards, setCards] = useState<Map<string, CardInfo>>(new Map());
  const [vault, setVault] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [labelEdit, setLabelEdit] = useState<string | null>(null);
  const [mdHtml, setMdHtml] = useState<Map<string, string>>(new Map());
  const space = useRef(false);
  canvasPerf.renders++;

  // ── 탭 내용 ↔ 문서 ──
  useEffect(() => {
    if (content === written.current) return; // 내가 쓴 것이 돌아온 것
    try {
      docRef.current = parseCanvas(content);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
    setRev((r) => r + 1);
  }, [content]);

  const commit = useCallback(() => {
    const text = serializeCanvas(docRef.current);
    written.current = text;
    onChange(text);
    setRev((r) => r + 1);
  }, [onChange]);

  useEffect(() => {
    views.set(path, view);
  }, [path, view]);

  // 처음 열면 전부 보이게(기억한 시점이 없을 때만). **기억 여부는 마운트 때 잰다** — 시점을 기억하는 이펙트가 먼저
  // 돌아 views 에 넣으므로, 여기서 views.has 를 보면 언제나 "기억함"이라 처음에도 안 맞췄다(probe:canvas 가 잡음).
  const remembered = useRef(views.has(path));
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || remembered.current || !vpRef.current) return;
    const { nodes } = drawable(docRef.current);
    if (!nodes.length && rev === 0) return;
    fitted.current = true;
    const r = vpRef.current.getBoundingClientRect();
    setView(fitView(nodes, r.width, r.height));
  }, [rev, path]);

  useEffect(() => {
    void vaultRoot(path).then(setVault);
  }, [path]);

  const { nodes, edges } = useMemo(() => drawable(docRef.current), [rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // ── file 카드 정보(색인에서) ──
  const fileKey = nodes
    .filter((n) => n.type === "file")
    .map((n) => n.file)
    .sort()
    .join("\n");
  useEffect(() => {
    const files = [...new Set(nodes.filter((n) => n.type === "file").map((n) => n.file as string))];
    let alive = true;
    void loadCards(files.map((file) => ({ file, candidates: fileCandidates(file, path, vault) })))
      .then((list) => alive && setCards(new Map(list.map((c) => [c.file, c]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fileKey, vault, path]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── text 노드 마크다운(html:false + DOMPurify) ──
  const textKey = nodes
    .filter((n) => n.type === "text")
    .map((n) => n.text)
    .join("\u0000");
  useEffect(() => {
    let alive = true;
    void loadMarkdown().then(({ createTextNodeMarkdown }) => {
      if (!alive) return;
      const md = createTextNodeMarkdown();
      const m = new Map<string, string>();
      for (const n of nodes) if (n.type === "text") m.set(n.text as string, sanitizeHtml(md.render(n.text as string)));
      setMdHtml(m);
    });
    return () => {
      alive = false;
    };
  }, [textKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const lod = view.k < LOD_K ? 0 : 1;
  const inboxSet = useMemo(() => new Set(inbox.map((i) => i.realPath.toLowerCase())), [inbox]);

  // ── 좌표 ──
  const world = (cx: number, cy: number): Pt => {
    const r = vpRef.current!.getBoundingClientRect();
    return toWorld(view, cx - r.left, cy - r.top);
  };

  // ── 포인터 ──
  const cap = (e: RPointerEvent) => {
    try {
      vpRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* 이미 놓았다 */
    }
  };

  function onPointerDown(e: RPointerEvent<HTMLDivElement>) {
    const target = e.target as Element;
    if (target.closest("textarea, input, .canvas-toolbar, .canvas-selbar, .canvas-picker")) return;
    if (e.button === 1 || space.current) {
      setDrag({ type: "pan", cx: e.clientX, cy: e.clientY, x: view.x, y: view.y });
      cap(e);
      return;
    }
    if (e.button !== 0) return;
    const [wx, wy] = world(e.clientX, e.clientY);
    const knob = target.closest<SVGElement>("[data-knob]");
    if (knob) {
      // 선택한 선의 끝을 옮긴다. 반대쪽 변은 지금 자리로 고정한다(relink).
      const ed = edges.find((x) => x.id === knob.dataset.edge);
      const a = ed && byId.get(ed.fromNode);
      const b = ed && byId.get(ed.toNode);
      if (ed && a && b) {
        const [s1, s2] = edgeSides(ed, a, b);
        const end = knob.dataset.knob as "from" | "to";
        setDrag({ type: "relink", e: ed, end, fixed: end === "from" ? b : a, side: end === "from" ? s2 : s1 });
        cap(e);
      }
      return;
    }
    const h = target.closest<HTMLElement>(".cv-h");
    if (h) {
      const n = byId.get(h.closest<HTMLElement>(".cv-node")!.dataset.id!);
      if (n) setDrag({ type: "link", from: n, side: h.dataset.side as Side });
      cap(e);
      return;
    }
    const rz = target.closest<HTMLElement>(".cv-rz");
    if (rz) {
      const n = byId.get(rz.closest<HTMLElement>(".cv-node")!.dataset.id!);
      if (n) {
        setSel({ kind: "node", id: n.id });
        setDrag({ type: "resize", n, sx: wx, sy: wy, w: n.width, h: n.height });
      }
      cap(e);
      return;
    }
    const eg = target.closest<SVGElement>("[data-edge-id]");
    if (eg) {
      setSel({ kind: "edge", id: eg.dataset.edgeId! });
      return;
    }
    const nodeEl = target.closest<HTMLElement>(".cv-node");
    if (nodeEl) {
      const n = byId.get(nodeEl.dataset.id!);
      if (!n) return;
      setSel({ kind: "node", id: n.id });
      const members = n.type === "group" ? groupMembers(nodes, n) : [];
      setDrag({ type: "move", sx: wx, sy: wy, items: [n, ...members].map((m) => ({ m, x: m.x, y: m.y })), moved: false });
      cap(e);
      return;
    }
    setSel(null);
    setPicker(false);
    setDrag({ type: "pan", cx: e.clientX, cy: e.clientY, x: view.x, y: view.y });
    cap(e);
  }

  function onPointerMove(e: RPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const [wx, wy] = world(e.clientX, e.clientY);
    if (drag.type === "pan") {
      setView((v) => ({ ...v, x: drag.x + e.clientX - drag.cx, y: drag.y + e.clientY - drag.cy }));
    } else if (drag.type === "move") {
      for (const it of drag.items) {
        it.m.x = snap10(it.x + wx - drag.sx);
        it.m.y = snap10(it.y + wy - drag.sy);
      }
      drag.moved = true;
      setRev((r) => r + 1);
    } else if (drag.type === "resize") {
      drag.n.width = Math.max(160, snap10(drag.w + wx - drag.sx));
      drag.n.height = Math.max(60, snap10(drag.h + wy - drag.sy));
      setRev((r) => r + 1);
    } else {
      const from = drag.type === "link" ? drag.from : drag.fixed;
      const tg = snapTarget(nodes, wx, wy, from, 28 / view.k);
      setSnapAt(tg ? { id: tg.node.id, side: tg.side } : null);
      setTemp({ p: anchor(from, drag.side), side: drag.side, q: tg ? anchor(tg.node, tg.side) : [wx, wy], qSide: tg?.side ?? null });
    }
  }

  function onPointerUp(e: RPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    setTemp(null);
    setSnapAt(null);
    const [wx, wy] = world(e.clientX, e.clientY);
    if (d.type === "link") {
      const tg = snapTarget(nodes, wx, wy, d.from, 28 / view.k);
      if (tg) {
        docRef.current.edges.push({ id: newCanvasId(), fromNode: d.from.id, fromSide: d.side, toNode: tg.node.id, toSide: tg.side, toEnd: "arrow" });
        commit();
      }
    } else if (d.type === "relink") {
      const tg = snapTarget(nodes, wx, wy, d.fixed, 28 / view.k);
      if (tg) {
        relink(d.e, d.end, tg.node, tg.side, d.side);
        commit();
      }
    } else if ((d.type === "move" && d.moved) || d.type === "resize") {
      commit();
    }
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if ((e.target as Element).closest("textarea, .canvas-picker")) return;
    const r = vpRef.current!.getBoundingClientRect();
    if (e.ctrlKey) setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top));
    else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
  }

  // 휠 기본 동작(페이지 확대)을 막으려면 passive:false 로 직접 단다.
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const stop = (e: WheelEvent) => {
      if (!(e.target as Element).closest("textarea, .canvas-picker")) e.preventDefault();
    };
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as Element;
    if (target.closest("textarea, input, .canvas-toolbar, .canvas-selbar, .canvas-picker")) return;
    const nodeEl = target.closest<HTMLElement>(".cv-node");
    const n = nodeEl ? byId.get(nodeEl.dataset.id!) : undefined;
    if (!n || n.type === "group") {
      const [wx, wy] = world(e.clientX, e.clientY);
      const nn: CanvasNode = { id: newCanvasId(), type: "text", text: "", x: snap10(wx - 140), y: snap10(wy - 50), width: 280, height: 120 };
      docRef.current.nodes.push(nn);
      commit();
      setSel({ kind: "node", id: nn.id });
      setEditing(nn.id);
      return;
    }
    if (n.type === "text") setEditing(n.id);
    else if (n.type === "file") openFileNode(n);
    else if (n.type === "link") void openExternalUrl(n.url as string).catch(() => {});
  }

  function openFileNode(n: CanvasNode) {
    const info = cards.get(n.file as string);
    if (!info?.path) {
      useAppStore.getState().showNotice(t("canvas.missing", { file: n.file }));
      return;
    }
    const sub = typeof n.subpath === "string" ? n.subpath.replace(/^#/, "") : "";
    const line = sub ? info.outline.find((o) => o.text === sub)?.line : undefined;
    onOpenFile(info.path, line);
  }

  // ── 키보드 ──
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if ((e.target as Element).closest("textarea, input")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && sel) {
      if (sel.kind === "node") removeNode(docRef.current, sel.id);
      else removeEdge(docRef.current, sel.id);
      setSel(null);
      commit();
      e.preventDefault();
    } else if (e.key === "Escape") {
      setSel(null);
      setPicker(false);
    } else if (e.key === " ") {
      space.current = true;
    }
  }
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === " ") space.current = false;
  };

  // ── 만들기 ──
  function center(): Pt {
    const r = vpRef.current!.getBoundingClientRect();
    return toWorld(view, r.width / 2, r.height / 2);
  }
  function addText() {
    const [cx, cy] = center();
    const nn: CanvasNode = { id: newCanvasId(), type: "text", text: "", x: snap10(cx - 140), y: snap10(cy - 60), width: 280, height: 120 };
    docRef.current.nodes.push(nn);
    commit();
    setSel({ kind: "node", id: nn.id });
    setEditing(nn.id);
  }
  function addFile(abs: string) {
    const [cx, cy] = center();
    const nn: CanvasNode = { id: newCanvasId(), type: "file", file: pathForNode(abs, path, vault), x: snap10(cx - 200), y: snap10(cy - 140), width: 400, height: 280 };
    docRef.current.nodes.push(nn);
    commit();
    setSel({ kind: "node", id: nn.id });
    setPicker(false);
  }
  function fit() {
    const r = vpRef.current!.getBoundingClientRect();
    setView(fitView(nodes, r.width, r.height));
  }

  // ── 그리기 ──
  const selNode = sel?.kind === "node" ? byId.get(sel.id) : undefined;
  const selEdge = sel?.kind === "edge" ? edges.find((x) => x.id === sel.id) : undefined;

  const edgeEls: React.ReactNode[] = [];
  const labelEls: React.ReactNode[] = [];
  const knobEls: React.ReactNode[] = [];
  for (const ed of edges) {
    const a = byId.get(ed.fromNode)!;
    const b = byId.get(ed.toNode)!;
    const [s1, s2] = edgeSides(ed, a, b);
    const p = anchor(a, s1);
    const q = anchor(b, s2);
    const c = curve(p, s1, q, s2);
    const back = curve(q, s2, p, s1);
    const col = colorCss(ed.color) ?? "var(--canvas-edge)";
    const on = selEdge?.id === ed.id;
    edgeEls.push(
      <g key={ed.id} data-edge-id={ed.id} className={on ? "sel" : ""}>
        <path className="cv-e" d={c.d} style={{ stroke: col }} />
        {ed.toEnd !== "none" && <path d={c.arrow} style={{ fill: col }} />}
        {ed.fromEnd === "arrow" && <path d={back.arrow} style={{ fill: col }} />}
        <path className="cv-hit" d={c.d} />
      </g>,
    );
    if (ed.label) {
      labelEls.push(
        <div key={ed.id} className="cv-elabel" style={{ left: c.mid[0], top: c.mid[1] }} data-edge-id={ed.id}>
          {String(ed.label)}
        </div>,
      );
    }
    if (on) {
      for (const [end, pt] of [
        ["from", p],
        ["to", q],
      ] as const) {
        knobEls.push(<circle key={end} className="cv-knob" data-knob={end} data-edge={ed.id} cx={pt[0]} cy={pt[1]} r={7 / view.k} />);
      }
    }
  }
  if (temp) {
    const c = curve(temp.p, temp.side, temp.q, temp.qSide);
    edgeEls.push(<path key="temp" className="cv-temp" d={c.d} />);
  }

  const nodeEl = (n: CanvasNode) => {
    const style: CSSProperties & Record<string, string | number> = { left: n.x, top: n.y, width: n.width, height: n.height };
    const c = colorCss(n.color);
    if (c) style["--nc"] = c;
    const isSel = selNode?.id === n.id;
    const handles = (
      <>
        {SIDES.map((s) => (
          <span key={s} className={`cv-h ${s}${snapAt?.id === n.id && snapAt.side === s ? " snap" : ""}`} data-side={s} />
        ))}
        <span className="cv-rz" />
      </>
    );
    let body: React.ReactNode = null;
    let missing = false;
    if (n.type === "group") {
      body = <div className="cv-glabel">{n.label ? String(n.label) : t("canvas.group")}</div>;
    } else if (n.type === "file") {
      const info = cards.get(n.file as string);
      missing = !!info && !info.path;
      const title = info?.title ?? String(n.file).split(/[\\/]/).pop();
      const badge = info?.path && inboxSet.has(info.path.toLowerCase()) ? <span className="cv-badge" title={t("inbox.title")} /> : null;
      body = (
        <div className="cv-card">
          <div className="cv-head">
            <span className="cv-ico">{String(n.file).toLowerCase().endsWith(".canvas") ? "▦" : "md"}</span>
            <span className="cv-title">{title}</span>
            {badge}
          </div>
          <div className="cv-path">
            {String(n.file)}
            {n.subpath ? ` ${String(n.subpath)}` : ""}
          </div>
          {missing ? (
            <p className="cv-missing">{t("canvas.missingCard")}</p>
          ) : (
            <div className="cv-lod1">
              <ul className="cv-outline">
                {(info?.outline ?? []).filter((o, i) => !(i === 0 && o.level === 1 && o.text === title)).map((o, i) => (
                  <li key={i} className={`h${o.level}`}>
                    {o.text}
                  </li>
                ))}
              </ul>
              {info?.excerpt ? <p className="cv-excerpt">{info.excerpt}</p> : null}
            </div>
          )}
          <div className="cv-far">
            {title}
            {badge}
          </div>
        </div>
      );
    } else if (n.type === "text") {
      const first = ((n.text as string).split("\n").find((l) => l.trim()) ?? "").replace(/^#+\s*/, "");
      body = (
        <div className="cv-card">
          {editing === n.id ? (
            <textarea
              className="cv-textedit"
              autoFocus
              defaultValue={n.text as string}
              spellCheck={false}
              placeholder={t("canvas.textPlaceholder")}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") (e.currentTarget as HTMLTextAreaElement).blur();
              }}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                setEditing(null);
                if (!v.trim()) {
                  removeNode(docRef.current, n.id);
                  setSel(null);
                } else n.text = v;
                commit();
              }}
            />
          ) : (
            // 남이 쓴 마크다운 — html:false + DOMPurify 를 거친 결과만(ADR 9절).
            <div className="cv-textbody" dangerouslySetInnerHTML={{ __html: mdHtml.get(n.text as string) ?? "" }} />
          )}
          <div className="cv-far">{first}</div>
        </div>
      );
    } else if (n.type === "link") {
      let host = String(n.url);
      try {
        host = new URL(String(n.url)).host;
      } catch {
        /* 주소가 아니면 그대로 */
      }
      body = (
        <div className="cv-card">
          <div className="cv-head">
            <span className="cv-ico">url</span>
            <span className="cv-title">{host}</span>
          </div>
          <div className="cv-lod1">
            <p className="cv-url">{String(n.url)}</p>
            <p className="cv-off">{t("canvas.offline")}</p>
          </div>
          <div className="cv-far">{host}</div>
        </div>
      );
    } else {
      body = <div className="cv-card cv-unknown">{String(n.type)}</div>;
    }
    return (
      <div key={n.id} className={`cv-node cv-${n.type}${isSel ? " sel" : ""}${missing ? " missing" : ""}${c ? " colored" : ""}`} data-id={n.id} style={style}>
        {body}
        {handles}
      </div>
    );
  };

  const ordered = paintOrder(nodes);
  const groups = ordered.filter((n) => n.type === "group");
  const others = ordered.filter((n) => n.type !== "group");

  // 선택 막대 자리(뷰포트 좌표).
  let barAt: Pt | null = null;
  if (selNode) barAt = [selNode.x * view.k + view.x + (selNode.width * view.k) / 2, selNode.y * view.k + view.y - 12];
  else if (selEdge) {
    const a = byId.get(selEdge.fromNode)!;
    const b = byId.get(selEdge.toNode)!;
    const [s1, s2] = edgeSides(selEdge, a, b);
    const m = curve(anchor(a, s1), s1, anchor(b, s2), s2).mid;
    barAt = [m[0] * view.k + view.x, m[1] * view.k + view.y - 16];
  }

  const setColor = (c: string | null) => {
    const o = (selNode ?? selEdge) as { color?: string } | undefined;
    if (!o) return;
    if (c) o.color = c;
    else delete o.color;
    commit();
  };

  const pickable = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of [...tabs.map((tb) => tb.path), ...recent]) {
      if (p === path || !isReadable(p) || seen.has(p.toLowerCase())) continue;
      seen.add(p.toLowerCase());
      out.push(p);
    }
    return out.slice(0, 40);
  }, [tabs, recent, path]);

  if (error) {
    return (
      <div className="canvas-view canvas-error" role="alert">
        <p>{t("canvas.parseError")}</p>
        <code>{error}</code>
      </div>
    );
  }

  return (
    <div
      ref={vpRef}
      className={`canvas-view${drag?.type === "pan" ? " panning" : ""}${drag && (drag.type === "link" || drag.type === "relink") ? " linking" : ""}`}
      tabIndex={0}
      aria-label={t("canvas.title")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      style={
        {
          "--k": view.k,
          backgroundSize: `${24 * view.k}px ${24 * view.k}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        } as CSSProperties
      }
    >
      <div className={`canvas-world lod${lod}`} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <div className="cv-groups">{groups.map(nodeEl)}</div>
        <svg className="cv-edges" width="1" height="1" aria-hidden="true">
          {edgeEls}
        </svg>
        <div className="cv-cards">{others.map(nodeEl)}</div>
        <div className="cv-labels">{labelEls}</div>
        <svg className="cv-knobs" width="1" height="1">
          {knobEls}
        </svg>
      </div>

      <div className="canvas-toolbar" role="toolbar" aria-label={t("canvas.title")}>
        <button type="button" onClick={addText}>
          {t("canvas.addText")}
        </button>
        <button type="button" aria-expanded={picker} onClick={() => setPicker((v) => !v)}>
          {t("canvas.addFile")}
        </button>
        <button type="button" onClick={fit}>
          {t("canvas.fit")}
        </button>
        <span className="cv-zoom">
          {Math.round(view.k * 100)}% · {lod ? t("canvas.lodOutline") : t("canvas.lodTitle")}
        </span>
      </div>

      {picker && (
        <div className="canvas-picker" role="listbox" aria-label={t("canvas.addFile")}>
          {pickable.length === 0 && <p>{t("canvas.pickEmpty")}</p>}
          {pickable.map((p) => (
            <button key={p} type="button" role="option" aria-selected={false} onClick={() => addFile(p)} title={p}>
              {p.split(/[\\/]/).pop()}
              <small>{p}</small>
            </button>
          ))}
        </div>
      )}

      {barAt && (
        <div className="canvas-selbar" style={{ left: barAt[0], top: barAt[1] }} onPointerDown={(e) => e.stopPropagation()}>
          {["1", "2", "3", "4", "5", "6"].map((c) => (
            <button key={c} type="button" className="cv-dot" style={{ background: `var(--canvas-c${c})` }} aria-label={t("canvas.color", { n: c })} onClick={() => setColor(c)} />
          ))}
          <button type="button" className="cv-dot none" aria-label={t("canvas.noColor")} onClick={() => setColor(null)} />
          {selNode?.type === "file" && (
            <button type="button" onClick={() => openFileNode(selNode)}>
              {t("canvas.open")}
            </button>
          )}
          {selEdge &&
            (labelEdit === selEdge.id ? (
              <input
                autoFocus
                className="cv-labelin"
                defaultValue={selEdge.label ? String(selEdge.label) : ""}
                placeholder={t("canvas.label")}
                onBlur={(e) => {
                  const v = e.currentTarget.value.trim();
                  if (v) selEdge.label = v;
                  else delete selEdge.label;
                  setLabelEdit(null);
                  commit();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                }}
              />
            ) : (
              <button type="button" onClick={() => setLabelEdit(selEdge.id)}>
                {t("canvas.label")}
              </button>
            ))}
          {selEdge && (
            <button
              type="button"
              onClick={() => {
                const e = selEdge;
                [e.fromNode, e.toNode] = [e.toNode, e.fromNode];
                const fs = e.fromSide;
                const ts = e.toSide;
                if (ts) e.fromSide = ts;
                else delete e.fromSide;
                if (fs) e.toSide = fs;
                else delete e.toSide;
                commit();
              }}
            >
              {t("canvas.flip")}
            </button>
          )}
          {selEdge && (
            <button
              type="button"
              aria-pressed={selEdge.toEnd !== "none"}
              onClick={() => {
                selEdge.toEnd = selEdge.toEnd === "none" ? "arrow" : "none";
                commit();
              }}
            >
              {t("canvas.arrow")}
            </button>
          )}
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (selNode) removeNode(docRef.current, selNode.id);
              else if (selEdge) removeEdge(docRef.current, selEdge.id);
              setSel(null);
              commit();
            }}
          >
            {t("canvas.delete")}
          </button>
        </div>
      )}
    </div>
  );
}
