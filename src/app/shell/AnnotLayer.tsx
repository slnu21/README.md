// 표시 펜 — 미리보기 위에 형광펜·색연필·점 표시와 메모를 단다(ADR 0003).
//
// 그리기는 **iframe 문서 안 SVG 층 둘**(.md 안 — 글자 밑/위). 위치는 렌더마다 다시 잰다: 저장된 것은
// 스냅샷 원문의 글자 범위이고(lib/annot), 지금 판으로 옮긴 범위를 블록의 글자 지도로 DOM Range 로 바꿔
// getClientRects 로 줄 상자를 얻는다 — 그래서 폭·줌·글꼴·테마·분할이 바뀌어도 따라간다.
// 사람이 만지는 것(펜 트레이·툴팁·여백 ＋·메모 레일·요약 알약)은 **부모 문서**에 있다 — iframe 은
// 스크립트 없는 샌드박스라 그 안에 상호작용 UI 를 둘 수 없고, 메모 글을 iframe 에 넣지 않는다.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store";
import { themes, defaultThemeId } from "../themes";
import { settingsGetAll, settingsSet } from "../lib/tauri";
import { annotBackend, newAnnotId, type AnnotationPatch, type AnnotationSet } from "../lib/annot/api";
import { DocIndex } from "../lib/annot/dom";
import { drawMark } from "../lib/annot/draw";
import { paintMarks, type Geom } from "../lib/annot/paint";
import { markPalette } from "../lib/annot/palette";
import {
  BLOCK_STYLES,
  COLORS,
  MEANINGS_KEY,
  POINT_STYLES,
  RANGE_STYLES,
  kindOf,
  parseMeanings,
  type AnnotColor,
  type AnnotKind,
  type AnnotStyle,
  type Meanings,
} from "../lib/annot/pens";
import { makeQuote, plainQuote } from "../lib/annot/quote";
import { canonicalText } from "../lib/annot/relocate";
import { resolveAll, summarize, type Resolved } from "../lib/annot/resolve";
import { reviewSummary } from "../lib/annot/summary";

/** 툴팁이 뜨기까지 머무르는 시간(ADR 7절). */
const HOVER_MS = 450;
/** 레일 폭 + 여유. 이보다 좁으면 펼쳐도 툴팁으로(폭을 재서 정한다). */
const RAIL_W = 300;
const RAIL_GAP = 20;
const RAIL_CARD_GUESS = 120; // 재기 전 첫 배치
const RAIL_CARD_GAP = 10;

/** 알약 글 — 0 인 항목은 안 쓴다("메모 2 · 바뀜 0 · 위치 잃음 0" 은 읽을 것이 셋인데 뜻은 하나다). */
function pillText(sum: { total: number; notes: number; changed: number; gone: number }, t: (k: string, o?: Record<string, unknown>) => string): string {
  const parts = [
    sum.notes ? t("annot.pillNotes", { n: sum.notes }) : "",
    sum.changed ? t("annot.pillChanged", { n: sum.changed }) : "",
    sum.gone ? t("annot.pillGone", { n: sum.gone }) : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : t("annot.pillShort", { total: sum.total });
}


type Tray =
  | { mode: "range"; x: number; y: number; start: number; end: number }
  | { mode: "point"; x: number; y: number; start: number; end: number }
  | { mode: "edit"; x: number; y: number; id: string };

interface Props {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  path: string;
  content: string;
  /** iframe 이 새 문서를 불러올 때마다 바뀐다(Preview 의 onLoad). */
  loadSeq: number;
  themeId: string;
}

/** 마지막 그리기 시간 — `probe:annot` 이 질감 켬/끔 비용을 잰다(앱 동작에는 안 쓴다). */
export const annotPerf = { lastDrawMs: 0, draws: 0 };
/** 마지막으로 만든 리뷰 요약 — 헤드리스 프로브는 클립보드를 못 읽는다. */
export const lastSummary = { text: "" };

let meaningsCache: Meanings | null = null;

/** 지금 아는 펜의 뜻(사용자가 바꾼 것만) — 내보내기·요약 복사가 화면 범례와 같은 말을 쓰게. */
export function currentMeanings(): Meanings {
  return meaningsCache ?? {};
}
async function loadMeanings(): Promise<Meanings> {
  if (meaningsCache) return meaningsCache;
  try {
    const rows = await settingsGetAll();
    meaningsCache = parseMeanings(rows.find(([k]) => k === MEANINGS_KEY)?.[1]);
  } catch {
    meaningsCache = {};
  }
  return meaningsCache;
}

export function AnnotLayer({ iframeRef, path, content, loadSeq, themeId }: Props) {
  const { t, i18n } = useTranslation();
  const texture = useAppStore((s) => s.annotTexture);
  const railOn = useAppStore((s) => s.annotRail);
  const setRail = useAppStore((s) => s.setAnnotRail);
  const dirty = useAppStore((s) => s.tabs.find((tb) => tb.path === path)?.dirty ?? false);

  const [set, setSet] = useState<AnnotationSet>({ annotations: [], snapshots: [] });
  const [meanings, setMeanings] = useState<Meanings>({});
  const [tray, setTray] = useState<Tray | null>(null);
  const [memo, setMemo] = useState("");
  const [color, setColor] = useState<AnnotColor>("yellow");
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const [plus, setPlus] = useState<{ x: number; y: number; start: number; end: number } | null>(null);
  const [legend, setLegend] = useState(false);
  // 겹쳐 그릴 자리(iframe·.md 상자) — 레일·알약 배치용. 스크롤·크기 변화 때 갱신.
  const [frame, setFrame] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [md, setMd] = useState<{ left: number; top: number; right: number } | null>(null);
  const [geomRev, setGeomRev] = useState(0);
  // 레일 카드의 실제 높이(그린 뒤 잰다) — 메모 길이·바뀜 상자에 따라 두세 배까지 다르다.
  const [cardH, setCardH] = useState<ReadonlyMap<string, number>>(new Map());
  const railRef = useRef<HTMLElement | null>(null);

  const canon = useMemo(() => canonicalText(content), [content]);
  const resolved = useMemo(() => resolveAll(set, content), [set, content]);
  const byId = useMemo(() => new Map(resolved.map((r) => [r.ann.id, r])), [resolved]);
  const geomRef = useRef(new Map<string, Geom>());
  const indexRef = useRef<DocIndex | null>(null);
  // 리스너는 iframe 문서가 바뀔 때만 단다 — 최신 값은 ref 로 읽는다.
  const live = useRef({ resolved, canon, dirty, tray });
  live.current = { resolved, canon, dirty, tray };
  const hoverTimer = useRef(0);
  const leaveTimer = useRef(0);

  const palette = useMemo(() => markPalette(themes[themeId] ?? themes[defaultThemeId]), [themeId]);
  const paletteVars = useMemo(() => {
    const v: Record<string, string> = {};
    for (const c of COLORS) {
      v[`--mark-${c}-ink`] = palette[c].ink;
      v[`--mark-${c}-lead`] = palette[c].lead;
    }
    return v as CSSProperties;
  }, [palette]);

  const meaningOf = useCallback((s: AnnotStyle) => meanings[s] ?? t(`annot.meaning.${s}`), [meanings, t]);

  // ── 불러오기 ──
  useEffect(() => {
    let alive = true;
    setTray(null);
    setTip(null);
    void annotBackend()
      .list(path)
      .then((s) => alive && setSet(s))
      .catch(() => alive && setSet({ annotations: [], snapshots: [] }));
    void loadMeanings().then((m) => alive && setMeanings(m));
    return () => {
      alive = false;
    };
  }, [path]);

  const docOf = () => iframeRef.current?.contentDocument ?? null;

  const measure = useCallback(() => {
    const f = iframeRef.current;
    const doc = docOf();
    const mdEl = doc?.querySelector<HTMLElement>(".md");
    if (!f || !mdEl) return;
    const fr = f.getBoundingClientRect();
    const mr = mdEl.getBoundingClientRect();
    setFrame({ left: fr.left, top: fr.top, width: fr.width, height: fr.height });
    setMd({ left: mr.left, top: mr.top, right: mr.right });
  }, [iframeRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 그리기 ──
  const draw = useCallback(() => {
    const doc = docOf();
    const mdEl = doc?.querySelector<HTMLElement>(".md");
    if (!doc || !mdEl) return;
    const t0 = performance.now();
    const { geoms, index } = paintMarks(doc, canon, resolved, texture);
    indexRef.current = index;
    geomRef.current = geoms;
    annotPerf.lastDrawMs = performance.now() - t0;
    annotPerf.draws++;
    measure();
    setGeomRev((n) => n + 1);
  }, [canon, resolved, texture, measure]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    draw();
  }, [draw, loadSeq]);

  // 크기 변화(폭·글꼴 로드·이미지 로드) → 다시 잰다. 테마·줌은 문서를 새로 그리므로 loadSeq 가 맡는다.
  useEffect(() => {
    const doc = docOf();
    const mdEl = doc?.querySelector<HTMLElement>(".md");
    const win = doc?.defaultView;
    if (!doc || !mdEl || !win) return;
    let raf = 0;
    const again = () => {
      win.cancelAnimationFrame(raf);
      raf = win.requestAnimationFrame(() => draw());
    };
    const ro = new (win as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver(again);
    ro.observe(mdEl);
    void doc.fonts?.ready.then(again);
    const onWin = () => measure();
    window.addEventListener("resize", onWin);
    return () => {
      ro.disconnect();
      win.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWin);
    };
  }, [loadSeq, draw, measure]); // eslint-disable-line react-hooks/exhaustive-deps

  // 레일 자리 — 펼쳤고 카드 + 레일이 들어갈 폭이면 카드를 왼쪽으로 비켜 오른쪽에 레일 자리를 만든다
  // (가운데 정렬 카드의 남는 폭만으로는 1600px 창에서도 레일이 안 들어간다). 안 들어가면 그대로 두고
  // 툴팁으로 — 중단점이 아니라 실제 폭을 잰다. 카드 안 표시는 카드 기준 좌표라 다시 그릴 필요가 없다.
  useEffect(() => {
    const doc = docOf();
    const mdEl = doc?.querySelector<HTMLElement>(".md");
    const f = iframeRef.current;
    if (!mdEl || !f) return;
    const hasMarks = set.annotations.length > 0;
    // **비키기 전 폭으로** 잰다 — 비킨 카드는 그만큼 좁아져서 언제나 "들어간다"고 나온다(probe:annot).
    mdEl.style.marginRight = "";
    mdEl.style.marginLeft = "";
    const natural = mdEl.offsetWidth;
    const fits = f.clientWidth - 28 >= natural + RAIL_W + RAIL_GAP;
    if (railOn && hasMarks && fits) {
      mdEl.style.marginRight = `${RAIL_W + RAIL_GAP}px`;
      mdEl.style.marginLeft = "auto";
    } else {
      mdEl.style.marginRight = "";
      mdEl.style.marginLeft = "";
    }
    measure();
  }, [railOn, loadSeq, frame?.width, set.annotations.length, measure]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── iframe 안 이벤트 ──
  const hitTest = useCallback((x: number, y: number): string | null => {
    const doc = docOf();
    const mdEl = doc?.querySelector<HTMLElement>(".md");
    if (!mdEl) return null;
    const mr = mdEl.getBoundingClientRect();
    const px = x - mr.left - mdEl.clientLeft;
    const py = y - mr.top - mdEl.clientTop;
    let hit: string | null = null;
    for (const [id, g] of geomRef.current) {
      const r = live.current.resolved.find((q) => q.ann.id === id);
      if (!r) continue;
      if (r.ann.kind === "point" && g.mx != null) {
        const l = g.lines[0];
        if (Math.hypot(px - g.mx, py - (l.y + l.h / 2)) <= 13) hit = id;
        continue;
      }
      if (r.ann.kind === "block" && g.mx != null) {
        const l = g.lines[0];
        if (Math.abs(px - g.mx - 3) <= 8 && py >= l.y && py <= l.y + l.h) hit = id;
        continue;
      }
      for (const l of g.lines) if (px >= l.x - 3 && px <= l.x + l.w + 3 && py >= l.y - 2 && py <= l.y + l.h + 4) hit = id;
    }
    return hit;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const doc = docOf();
    const f = iframeRef.current;
    if (!doc || !f) return;
    const toView = (x: number, y: number) => {
      const fr = f.getBoundingClientRect();
      return { x: fr.left + x, y: fr.top + y };
    };
    const onUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const sel = doc.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!doc.querySelector(".md")?.contains(range.commonAncestorContainer)) return;
      const src = indexRef.current?.selectionToSource(range);
      const r = range.getBoundingClientRect();
      const at = toView(r.left + r.width / 2, r.bottom + 8);
      if (!src || src.end <= src.start) {
        useAppStore.getState().showNotice(t("annot.notRangeable"));
        return;
      }
      setMemo("");
      setTray({ mode: "range", x: at.x, y: at.y, start: src.start, end: src.end });
    };
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      // 문서 자체(Document)에는 closest 가 없다 — iframe 은 다른 realm 이라 instanceof 도 못 쓴다.
      if (typeof el?.closest === "function" && el.closest("a")) return; // 링크가 이긴다
      const sel = doc.getSelection();
      if (sel && !sel.isCollapsed) return;
      const id = hitTest(e.clientX, e.clientY);
      if (!id) {
        setTray(null);
        return;
      }
      const a = live.current.resolved.find((q) => q.ann.id === id)?.ann;
      setMemo(a?.note ?? "");
      if (a) setColor(a.color);
      const at = toView(e.clientX, e.clientY + 14);
      setTip(null);
      setTray({ mode: "edit", x: at.x, y: at.y, id });
    };
    const onMove = (e: MouseEvent) => {
      // 여백 ＋ — 머무른 블록의 첫 줄 왼쪽
      const target = e.target as Node | null;
      const b = indexRef.current?.blockOf(target);
      if (b && !(e.buttons & 1)) {
        const mdEl = doc.querySelector<HTMLElement>(".md");
        const r = b.el.getBoundingClientRect();
        if (mdEl) {
          const mr = mdEl.getBoundingClientRect();
          const cs = doc.defaultView?.getComputedStyle(mdEl);
          const padL = cs ? parseFloat(cs.paddingLeft) || 0 : 0;
          const at = toView(mr.left + mdEl.clientLeft + padL - 30, r.top + 2);
          setPlus({ x: at.x, y: at.y, start: b.start, end: b.end });
        }
      }
      // 툴팁 — 메모가 있거나 바뀐 표시에 머무르면
      window.clearTimeout(hoverTimer.current);
      const id = hitTest(e.clientX, e.clientY);
      if (!id) {
        leaveTimer.current = window.setTimeout(() => setTip(null), 250);
        return;
      }
      window.clearTimeout(leaveTimer.current);
      const r = live.current.resolved.find((q) => q.ann.id === id);
      if (!r || (!r.ann.note && r.state !== "changed")) return;
      const at = toView(e.clientX, e.clientY + 16);
      hoverTimer.current = window.setTimeout(() => setTip({ id, x: at.x, y: at.y }), HOVER_MS);
    };
    const onScroll = () => {
      setTray(null);
      setTip(null);
      setPlus(null);
      measure();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTray(null);
        setTip(null);
      }
    };
    // Esc 는 부모 문서에서도 — 트레이 단추를 누른 뒤엔 포커스가 부모에 있다.
    window.addEventListener("keydown", onKey);
    doc.addEventListener("mouseup", onUp);
    doc.addEventListener("click", onClick);
    doc.addEventListener("mousemove", onMove);
    doc.addEventListener("keydown", onKey);
    doc.defaultView?.addEventListener("scroll", onScroll);
    return () => {
      doc.removeEventListener("mouseup", onUp);
      doc.removeEventListener("click", onClick);
      doc.removeEventListener("mousemove", onMove);
      doc.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onKey);
      doc.defaultView?.removeEventListener("scroll", onScroll);
    };
  }, [loadSeq, hitTest, measure, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 만들기·고치기 ──
  const fail = (e: unknown) => useAppStore.getState().showNotice(t("annot.failed", { detail: String(e) }), "error");

  async function create(kind: AnnotKind, style: AnnotStyle, start: number, end: number) {
    if (dirty) {
      useAppStore.getState().showNotice(t("annot.dirty"));
      return;
    }
    // 블록 표시는 블록 소스의 끝 줄바꿈을 뺀다.
    let e = end;
    while (e > start && /\s/.test(canon[e - 1])) e--;
    const q = makeQuote(canon, start, e);
    try {
      const { annotation, snapshot } = await annotBackend().add({
        id: newAnnotId(),
        path,
        kind,
        style,
        color,
        srcStart: start,
        srcEnd: e,
        quote: q.quote,
        prefix: q.prefix,
        suffix: q.suffix,
        note: memo.trim() || null,
      });
      setSet((s) => ({
        annotations: [...s.annotations, annotation],
        snapshots: s.snapshots.some((x) => x.id === snapshot.id) ? s.snapshots : [...s.snapshots, snapshot],
      }));
      docOf()?.getSelection()?.removeAllRanges();
      setTray((tr) => (tr ? { mode: "edit", x: tr.x, y: tr.y, id: annotation.id } : null));
    } catch (err) {
      fail(err);
    }
  }

  async function patch(id: string, p: AnnotationPatch) {
    try {
      const a = await annotBackend().update(id, p);
      setSet((s) => ({ ...s, annotations: s.annotations.map((x) => (x.id === id ? a : x)) }));
    } catch (err) {
      fail(err);
    }
  }

  async function remove(id: string) {
    try {
      await annotBackend().remove(id);
      setSet((s) => ({ ...s, annotations: s.annotations.filter((x) => x.id !== id) }));
      setTray(null);
    } catch (err) {
      fail(err);
    }
  }

  // [리뷰 요약 복사] — 브리지 없이도 같은 리뷰 고리(칠한 문장 + 뜻 + 메모 → 채팅창).
  async function copySummary() {
    const md = reviewSummary(path, resolved, {
      title: (p) => t("annot.summaryTitle", { name: p.split(/[\/]/).pop() ?? p }),
      meaning: meaningOf,
      state: (s) => t(`annot.state.${s}`),
      line: (n) => t("annot.lineN", { n }),
      goneNote: t("annot.goneNote"),
    });
    try {
      await navigator.clipboard.writeText(md);
      useAppStore.getState().showNotice(t("annot.copied"));
    } catch (err) {
      fail(err);
    }
    lastSummary.text = md;
  }

  async function saveMeaning(style: AnnotStyle, text: string) {
    const next = { ...meanings, [style]: text.trim() || undefined };
    if (!text.trim()) delete next[style];
    setMeanings(next);
    meaningsCache = next;
    try {
      await settingsSet(MEANINGS_KEY, JSON.stringify(next));
    } catch {
      /* 브라우저(프로브)에는 설정 저장소가 없다 */
    }
  }

  // ── 그리는 것 ──
  const sum = summarize(resolved);
  // md 는 iframe 안 좌표 — 오른쪽 남는 폭이 레일 + 여유보다 넓어야 펼친다.
  const railFits = !!frame && !!md && frame.width - md.right >= RAIL_W + RAIL_GAP;
  const showRail = railOn && railFits;

  const sample = (style: AnnotStyle, c: AnnotColor, w = 40, h = 22) => {
    const line = style === "bar" ? { x: 0, y: 2, w: 0, h: h - 4 } : { x: 7, y: 4, w: w - 14, h: h - 9 };
    const d = drawMark({ id: `s-${style}-${c}`, style, color: c, lines: [line], mx: style === "bar" ? w / 2 - 3 : w / 2 }, false);
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ overflow: "visible" }}>
        <rect x={8} y={h / 2 - 2.5} width={w - 16} height={5} rx={2} fill="currentColor" opacity={0.18} />
        <g dangerouslySetInnerHTML={{ __html: d.under + d.over }} />
      </svg>
    );
  };

  const card = (r: Resolved, opts: { inRail: boolean }) => {
    const a = r.ann;
    const ver = new Date(a.createdAt).toLocaleString(i18n.language === "ko" ? "ko-KR" : "en-US");
    return (
      <>
        <div className="annot-card-head">
          {sample(a.style, a.color, 30, 18)}
          <span className="annot-meaning">{meaningOf(a.style)}</span>
          <span className={`annot-chip ${r.state}`}>{t(`annot.state.${r.state}`)}</span>
        </div>
        {r.state === "changed" ? (
          <div className="annot-diff">
            <div className="was">
              <span className="tag">{t("annot.was")}</span>
              {plainQuote(r.before)}
            </div>
            <div className="now">
              <span className="tag">{t("annot.now")}</span>
              {plainQuote(r.after)}
            </div>
          </div>
        ) : (
          <p className="annot-q">“{plainQuote(r.state === "gone" ? r.before : r.after)}”</p>
        )}
        {a.note && (
          <p className="annot-note">
            {r.badge ? <b>{r.badge}. </b> : null}
            {a.note}
          </p>
        )}
        <div className="annot-card-foot">
          <span>{ver}</span>
          {(r.state === "changed" || a.resolved) && (
            <button type="button" onClick={() => void patch(a.id, { resolved: !a.resolved })}>
              {a.resolved ? t("annot.unresolve") : t("annot.resolve")}
            </button>
          )}
          {(r.state === "changed" || r.state === "gone") && (
            <button type="button" onClick={() => useAppStore.getState().requestHistory(path, a.snapshotId)}>
              {t("annot.viewVersion")}
            </button>
          )}
          {opts.inRail && (
            <button type="button" className="danger" onClick={() => void remove(a.id)}>
              {t("annot.delete")}
            </button>
          )}
        </div>
      </>
    );
  };

  const trayAnn = tray?.mode === "edit" ? byId.get(tray.id)?.ann : undefined;
  const trayStyles: readonly AnnotStyle[] =
    tray?.mode === "range" ? RANGE_STYLES : tray?.mode === "point" ? [...POINT_STYLES, ...BLOCK_STYLES] : trayAnn ? (trayAnn.kind === "range" ? RANGE_STYLES : [...POINT_STYLES, ...BLOCK_STYLES]) : [];

  void geomRev; // 레일 위치는 그린 뒤의 기하를 쓴다

  // 레일 카드 배치(겹치지 않게 아래로 민다).
  const railCards: { r: Resolved; top: number }[] = [];
  const lostCards: Resolved[] = [];
  if (showRail && frame && md) {
    let floor = 8;
    const list = resolved
      .filter((r) => r.state !== "gone" && (r.ann.note || r.state === "changed") && geomRef.current.has(r.ann.id))
      .sort((p, q) => geomRef.current.get(p.ann.id)!.lines[0].y - geomRef.current.get(q.ann.id)!.lines[0].y);
    for (const r of list) {
      const want = md.top + geomRef.current.get(r.ann.id)!.lines[0].y - 8;
      const top = Math.max(want, floor);
      railCards.push({ r, top });
      floor = top + (cardH.get(r.ann.id) ?? RAIL_CARD_GUESS) + RAIL_CARD_GAP;
    }
    lostCards.push(...resolved.filter((r) => r.state === "gone"));
  }

  const lastCard = railCards[railCards.length - 1];
  const lostTop = lastCard ? lastCard.top + (cardH.get(lastCard.r.ann.id) ?? RAIL_CARD_GUESS) + RAIL_CARD_GAP * 2 : 8;

  // 그린 카드의 높이를 재서 다음 배치에 쓴다. 바뀐 것이 있을 때만 상태를 올린다 — 같은 값을 다시 넣으면 끝없이 그린다.
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let changed = false;
    const next = new Map(cardH);
    rail.querySelectorAll<HTMLElement>("[data-annot-card]").forEach((el) => {
      const id = el.dataset.annotCard!;
      const h = Math.ceil(el.offsetHeight);
      if (next.get(id) !== h) {
        next.set(id, h);
        changed = true;
      }
    });
    if (changed) setCardH(next);
  });

  const tipR = tip ? byId.get(tip.id) : undefined;

  return (
    <div className="annot-root" style={paletteVars}>
      {sum.total > 0 && frame && (
        <div className="annot-pillbar" style={{ left: frame.left + frame.width - 16, top: frame.top + 10 }}>
          <button type="button" className="annot-pill" aria-expanded={showRail} onClick={() => setRail(!railOn)} title={railOn ? t("annot.collapse") : t("annot.expand")}>
            {pillText(sum, t)} ›
          </button>
          <button type="button" className="annot-pill" aria-expanded={legend} onClick={() => setLegend((v) => !v)}>
            {t("annot.legend")}
          </button>
          <button type="button" className="annot-pill" onClick={() => void copySummary()} title={t("annot.copySummary")}>
            {t("annot.copySummary")}
          </button>
          {railOn && !railFits && <span className="annot-narrow">{t("annot.narrow")}</span>}
        </div>
      )}

      {legend && frame && (
        <section className="annot-legend" style={{ left: frame.left + frame.width - 16, top: frame.top + 44 }}>
          <h3>{t("annot.legend")}</h3>
          <p>{t("annot.legendHint")}</p>
          <ul>
            {[...RANGE_STYLES, ...POINT_STYLES, ...BLOCK_STYLES].map((s) => (
              <li key={s}>
                {sample(s, "yellow", 34, 20)}
                <span className="annot-penname">{t(`annot.pen.${s}`)}</span>
                <input
                  aria-label={t(`annot.pen.${s}`)}
                  defaultValue={meaningOf(s)}
                  maxLength={80}
                  onBlur={(e) => void saveMeaning(s, e.currentTarget.value === t(`annot.meaning.${s}`) ? "" : e.currentTarget.value)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {plus && !tray && (
        <button
          type="button"
          className="annot-plus"
          style={{ left: plus.x, top: plus.y }}
          title={t("annot.addPoint")}
          aria-label={t("annot.addPoint")}
          onClick={() => {
            setMemo("");
            setTray({ mode: "point", x: plus.x + 30, y: plus.y + 26, start: plus.start, end: plus.end });
          }}
        >
          ＋
        </button>
      )}

      {tray && (
        <div className="annot-tray" role="dialog" aria-label={t("annot.penTray")} style={{ left: tray.x, top: tray.y }} onMouseDown={(e) => e.stopPropagation()}>
          {dirty && tray.mode !== "edit" ? (
            <p className="annot-dirty">{t("annot.dirty")}</p>
          ) : (
            <>
              <div className="annot-row">
                {trayStyles.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="annot-pen"
                    aria-pressed={trayAnn?.style === s}
                    title={`${t(`annot.pen.${s}`)} — ${meaningOf(s)}`}
                    aria-label={t(`annot.pen.${s}`)}
                    onClick={() => {
                      if (tray.mode === "edit") void patch(tray.id, { style: s });
                      else void create(kindOf(s), s, tray.start, tray.end);
                    }}
                  >
                    {sample(s, trayAnn?.color ?? color)}
                  </button>
                ))}
                <span className="annot-vsep" />
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="annot-dot"
                    aria-pressed={(trayAnn?.color ?? color) === c}
                    aria-label={t(`annot.color.${c}`)}
                    title={t(`annot.color.${c}`)}
                    style={{ background: palette[c].ink, borderColor: palette[c].lead }}
                    onClick={() => {
                      setColor(c);
                      if (tray.mode === "edit") void patch(tray.id, { color: c });
                    }}
                  />
                ))}
                {tray.mode === "edit" && (
                  <button type="button" className="annot-tbtn danger" onClick={() => void remove(tray.id)}>
                    {t("annot.delete")}
                  </button>
                )}
              </div>
              <div className="annot-row">
                <input
                  className="annot-memo"
                  placeholder={t("annot.memoPlaceholder")}
                  aria-label={t("annot.memo")}
                  value={memo}
                  maxLength={10000}
                  onChange={(e) => setMemo(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setTray(null);
                    if (e.key === "Enter" && tray.mode === "edit") {
                      void patch(tray.id, { note: memo.trim() || null });
                      setTray(null);
                    }
                  }}
                />
                {tray.mode === "edit" && (
                  <button
                    type="button"
                    className="annot-tbtn"
                    onClick={() => {
                      void patch(tray.id, { note: memo.trim() || null });
                      setTray(null);
                    }}
                  >
                    {t("annot.save")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tip && tipR && !tray && (
        <div
          className="annot-card annot-tip"
          role="tooltip"
          style={{ left: tip.x, top: tip.y }}
          onMouseEnter={() => window.clearTimeout(leaveTimer.current)}
          onMouseLeave={() => setTip(null)}
        >
          {card(tipR, { inRail: false })}
        </div>
      )}

      {showRail && frame && md && (
        <aside ref={railRef} className="annot-rail" aria-label={t("annot.list")} style={{ left: frame.left + md.right + RAIL_GAP, top: frame.top, width: RAIL_W, height: frame.height }}>
          {railCards.map(({ r, top }) => (
            <div key={r.ann.id} data-annot-card={r.ann.id} className={`annot-card${r.ann.resolved ? " resolved" : ""}`} style={{ top }}>
              {card(r, { inRail: true })}
            </div>
          ))}
          {lostCards.length > 0 && (
            <div className="annot-lost" style={{ top: lostTop }}>
              <h4>{t("annot.lost")}</h4>
              {lostCards.map((r) => (
                <div key={r.ann.id} className="annot-card static">
                  {card(r, { inRail: true })}
                </div>
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
