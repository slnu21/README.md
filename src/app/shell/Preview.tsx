// 실시간 미리보기(WBS 511).
// 파이프라인: content → Web Worker(markdown-it) → DOMPurify 정화 → 샌드박스 iframe(srcdoc).
// 디바운스(previewDelay 설정, 기본 500ms). 테마 토큰을 iframe에 주입해 동기화. 로컬 이미지는 asset 프로토콜로 재작성.
// 재렌더는 srcdoc 통째 리로드 → 직전 상단 소스 줄을 저장·복원해 스크롤 위치 유지(restoreLineRef).
import {
  canSyncScroll,
  planReveal,
  restoreLineFor,
  takeRevealOnLoad,
  type PendingReveal,
} from "../lib/reveal";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TocItem } from "../lib/markdown";
import { loadMarkdown } from "../lib/markdownLazy";
import { sanitizeHtml } from "../lib/sanitize";
import { renderMermaid } from "../lib/mermaid";
import { useAppStore } from "../store";
import { readStack, BASE_READER_PX } from "../lib/fonts";
import { buildDoc, type BuildDocOpts, type FontOpts } from "../lib/renderDoc";
import { inlineImages } from "../lib/previewImages";
import { dirOf } from "../lib/paths";
import type { OpenHow } from "../lib/links";
import { annotateLinkTitles, handleLinkClick } from "../lib/previewLinks";
import { AnnotLayer } from "./AnnotLayer";
import { ANNOT_DOC_CSS } from "../lib/annot/paint";

/** 표시 펜 층 자리(lib/annot/paint.ts). 미리보기 전용 — 내보내기는 따로 정한다. */
const ANNOT_CSS = ANNOT_DOC_CSS;

// 미리보기 스크롤 위치 → 상단에 보이는 소스 줄(0-based). scrollToLine의 역보간.
function topSourceLine(doc: Document): number | null {
  const scroller = doc.scrollingElement ?? doc.documentElement;
  const els = doc.querySelectorAll<HTMLElement>("[data-line]");
  if (!els.length) return null;
  const st = scroller.scrollTop + 8; // scrollToLine의 -8 오프셋과 대칭
  let prev: HTMLElement | null = null;
  let next: HTMLElement | null = null;
  for (const el of els) {
    if (el.offsetTop <= st) prev = el;
    else {
      next = el;
      break;
    }
  }
  if (!prev) return Number(els[0].getAttribute("data-line"));
  const prevLine = Number(prev.getAttribute("data-line"));
  if (!next) return prevLine;
  const nextLine = Number(next.getAttribute("data-line"));
  const frac = next.offsetTop > prev.offsetTop ? (st - prev.offsetTop) / (next.offsetTop - prev.offsetTop) : 0;
  return prevLine + frac * (nextLine - prevLine);
}

// 소스 줄 → 렌더 위치로 스크롤(기능 8). data-line 앵커 사이 offsetTop 보간, 즉시 이동. topSourceLine의 역.
// imperative scrollToLine과 재렌더 후 스크롤 위치 복원(restoreLineRef)이 공유한다.
function scrollDocToLine(doc: Document, line: number): void {
  const scroller = doc.scrollingElement ?? doc.documentElement;
  if (!scroller) return;
  const els = doc.querySelectorAll<HTMLElement>("[data-line]");
  if (!els.length) return;
  let prev: HTMLElement | null = null;
  let next: HTMLElement | null = null;
  for (const el of els) {
    if (Number(el.getAttribute("data-line")) <= line) prev = el;
    else {
      next = el;
      break;
    }
  }
  const prevLine = prev ? Number(prev.getAttribute("data-line")) : 0;
  const prevTop = prev ? prev.offsetTop : 0;
  let target = prevTop;
  if (next) {
    const nextLine = Number(next.getAttribute("data-line"));
    const nextTop = next.offsetTop;
    const frac = nextLine > prevLine ? (line - prevLine) / (nextLine - prevLine) : 0;
    target = prevTop + frac * (nextTop - prevTop);
  }
  scroller.scrollTop = Math.max(0, target - 8);
}

export interface PreviewHandle {
  scrollToHeading(id: string): void;
  scrollToLine(line: number): void;
}

interface PreviewProps {
  content: string;
  path: string;
  themeId: string;
  onToc?: (toc: TocItem[]) => void;
  onSourceLine?: (line: number) => void; // 미리보기 스크롤 → 상단 소스 줄(양방향 동기화)
  /** 미리보기에서 로컬 파일 링크를 눌렀을 때(문서 폴더 기준으로 해석한 경로).
   *  앱에서 열지/OS에 넘길지는 호스트가 결정한다. `how` 는 수식어에서 온 목적지
   *  (맨클릭=here · Ctrl/⌘=beside · Alt=reveal). */
  onOpenPath?: (path: string, how: OpenHow) => void;
  /** 이 문서를 이 줄에 보여 달라는 요청(호스트가 경로가 맞을 때만 넘긴다). 그려진 뒤에 처리한다. */
  reveal?: { line: number; seq: number } | null;
}

export const Preview = forwardRef<PreviewHandle, PreviewProps>(function Preview(
  { content, path, themeId, onToc, onSourceLine, onOpenPath, reveal },
  ref,
) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const buildToken = useRef(0);
  const restoreLineRef = useRef<number | null>(null); // 재렌더(srcdoc 리로드) 직전 상단 소스 줄 → 로드 후 복원
  const pathRef = useRef(path);
  pathRef.current = path;
  // 줄 보여 주기(reveal)는 **이 문서가 실제로 그려진 iframe** 에서만 맞다. 탭을 막 바꾼 순간의 iframe 은
  // 아직 앞 문서다 → 어느 경로의 HTML 이 들어 있는지(bodyPath → srcPath → loadedPath)를 따라간다.
  const bodyPathRef = useRef<string | null>(null);
  const srcPathRef = useRef<string | null>(null);
  const loadedPathRef = useRef<string | null>(null);
  const inFlightRef = useRef(false); // srcdoc 을 넣고 load 를 아직 못 받은 동안
  const pendingRevealRef = useRef<PendingReveal | null>(null);
  const handledRevealRef = useRef(0);
  const onTocRef = useRef(onToc);
  onTocRef.current = onToc;
  const onSourceLineRef = useRef(onSourceLine);
  onSourceLineRef.current = onSourceLine;
  const onOpenPathRef = useRef(onOpenPath);
  onOpenPathRef.current = onOpenPath;
  const [bodyHtml, setBodyHtml] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null); // 확대할 이미지 src(라이트박스)
  const [loadSeq, setLoadSeq] = useState(0); // iframe 문서가 바뀔 때마다 — 표시 펜 층이 다시 붙는다
  // **지금 iframe 에 그려진 글**(편집 중인 버퍼가 아니라). 표시 펜은 이 글로 위치를 계산해야 DOM 과 맞는다 —
  // 버퍼로 계산하면 새 렌더가 오기 전(디바운스·워커) 옛 DOM 위에 새 글의 위치를 그려 표시가 튄다(probe:annot).
  const [loadedContent, setLoadedContent] = useState("");
  const reqContentRef = useRef<{ id: number; content: string }>({ id: 0, content: "" });
  const bodyContentRef = useRef("");
  const srcContentRef = useRef("");
  // 읽기 글꼴/줌(기능 3·5) — iframe은 격리돼 있어 buildDoc에 직접 주입한다.
  // 사용자 테마 파일을 다시 불러오면 themeId 는 그대로고 **내용만** 바뀜다 → 재빌드 신호는 이것이다.
  const themeRev = useAppStore((s) => s.themeRev);
  const fontRead = useAppStore((s) => s.fontRead);
  const previewZoom = useAppStore((s) => s.previewZoom);
  const readingWidth = useAppStore((s) => s.readingWidth);
  const diagramWidth = useAppStore((s) => s.diagramWidth); // mermaid 너비 — 맞춤(축소) | 원본(가로 스크롤)
  const previewDelay = useAppStore((s) => s.previewDelay); // 재렌더 디바운스(ms) — 설정에서 조절
  const textDirection = useAppStore((s) => s.textDirection); // 글 방향 — 문서 루트 dir + 모드(CSS)

  const font: FontOpts = { readStack: readStack(fontRead), readerPx: BASE_READER_PX * previewZoom };
  // 미리보기 전용 추가 CSS(내보내기엔 미적용): 이미지 확대 커서 + 리딩 폭(본문 최대 폭).
  const widthPx = readingWidth === "narrow" ? "680px" : readingWidth === "wide" ? "none" : "860px";
  const previewExtra =
    ANNOT_CSS +
    "img{cursor:zoom-in}" +
    (widthPx === "none" ? "" : `.md{max-width:${widthPx};margin-left:auto;margin-right:auto}`);
  // 세 buildDoc 호출(데모 2 + 정규 1)이 같은 옵션을 쓰도록 한 곳에 모은다.
  const docOpts: BuildDocOpts = { extraCss: previewExtra, diagramWidth, textDirection };
  // 데모/스크린샷(?demo)에서는 헤드리스 캡처 타이밍 때문에 워커 대신 메인 스레드로 즉시 렌더.
  // 단 `&worker` 가 붙으면 데모여도 진짜 경로(워커)를 탄다 — 성능 프로브가 실제 렌더 비용을 재야 한다.
  const isDemo = (() => {
    const q = new URLSearchParams(window.location.search);
    return q.has("demo") && !q.has("worker");
  })();

  // 아웃라인 클릭 → iframe 내부 헤딩으로 스크롤. sandbox="allow-same-origin"(allow-scripts 미포함) 필요.
  useImperativeHandle(
    ref,
    () => ({
      scrollToHeading(id: string) {
        const doc = iframeRef.current?.contentDocument;
        doc?.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
      // 소스 줄 → 렌더 위치로 스크롤(기능 8).
      scrollToLine(line: number) {
        const doc = iframeRef.current?.contentDocument;
        if (doc && canSyncScroll(loadedPathRef.current, pathRef.current)) scrollDocToLine(doc, line);
      },
    }),
    [],
  );

  // 워커 1회 생성. 응답을 정화(DOMPurify) 후 이미지 재작성 + 아웃라인 전달.
  useEffect(() => {
    if (isDemo) return;
    const worker = new Worker(new URL("../workers/markdown.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent) => {
      const { id, html, toc } = e.data as { id: number; html: string; toc: TocItem[] };
      if (id !== reqId.current) return; // 오래된 응답 무시
      onTocRef.current?.(toc);
      const source = reqContentRef.current.id === id ? reqContentRef.current.content : "";
      const clean = sanitizeHtml(html);
      void inlineImages(clean, dirOf(pathRef.current)).then((withImg) => {
        if (id !== reqId.current) return; // 인라인(비동기) 후 최신 요청만 반영
        bodyPathRef.current = pathRef.current;
        bodyContentRef.current = source;
        setBodyHtml(withImg);
      });
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [isDemo]);

  // 데모 경로: 메인 스레드에서 즉시 렌더해 srcdoc 까지 한 번에. 아래 재구성 이펙트를 타지 않으므로
  // 문서 옵션(글 방향)에 직접 의존한다 — RTL 프로브가 모드를 오가며 잰다.
  useEffect(() => {
    if (!isDemo) return;
    const iframe = iframeRef.current;
    void (async () => {
      try {
        const { createMarkdown, extractToc } = await loadMarkdown();
        const md = createMarkdown();
        onTocRef.current?.(extractToc(md, content));
        const body = await inlineImages(sanitizeHtml(md.render(content)), dirOf(pathRef.current));
        srcContentRef.current = content;
        if (iframe) iframe.srcdoc = buildDoc(body, themeId, font, docOpts);
      } catch (err) {
        if (iframe)
          iframe.srcdoc = buildDoc(
            "<pre>DEMO ERROR: " + String(err) + "</pre>",
            themeId,
            font,
            docOpts,
          );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, path, isDemo, textDirection]);

  // content/path 변경 시 디바운스(previewDelay ms) 후 워커에 렌더 요청.
  useEffect(() => {
    if (isDemo) return;
    const worker = workerRef.current;
    if (!worker) return;
    const id = ++reqId.current;
    const timer = window.setTimeout(() => {
      reqContentRef.current = { id, content };
      worker.postMessage({ id, source: content });
    }, previewDelay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, path, isDemo, previewDelay]);

  // 정화된 HTML/테마 변경 시 iframe 재구성. mermaid(있으면)는 메인스레드 렌더 후 주입(비동기+레이스 가드).
  useEffect(() => {
    if (isDemo) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const token = ++buildToken.current;
    let cancelled = false;
    void (async () => {
      const finalBody = await renderMermaid(bodyHtml, themeId);
      if (cancelled || token !== buildToken.current) return;
      // srcdoc 재대입은 iframe 문서를 통째로 리로드 → scrollTop 0 초기화. 직전 상단 소스 줄을
      // 저장했다가 onIframeLoad에서 복원해 "맨 위로 튐"을 막는다(테마/글꼴/줌 변경 시에도 위치 보존).
      // 같은 문서를 다시 그릴 때만 — 다른 문서면 새 문서는 맨 위에서(restoreLineFor).
      restoreLineRef.current = restoreLineFor({
        loadedPath: loadedPathRef.current,
        nextPath: bodyPathRef.current,
        top: iframe.contentDocument ? topSourceLine(iframe.contentDocument) : null,
      });
      srcPathRef.current = bodyPathRef.current;
      srcContentRef.current = bodyContentRef.current;
      inFlightRef.current = true;
      iframe.srcdoc = buildDoc(finalBody, themeId, font, docOpts);
    })();
    return () => {
      cancelled = true;
    };
    // font(readStack/readerPx)는 fontRead·previewZoom 파생 → 이들 변경 시 재빌드. readingWidth도 CSS 파생.
    // diagramWidth·textDirection은 docOpts 파생(문서 body 클래스·.md dir) — 수동 관리 배열이라
    // 빠뜨리면 즉시 반영되지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyHtml, themeId, themeRev, isDemo, fontRead, previewZoom, readingWidth, diagramWidth, textDirection]);

  // 줄 보여 주기 — 이미 이 문서가 그려져 있으면 지금, 아니면(또는 다시 그리는 중이면) 다음 load 에서.
  useEffect(() => {
    if (!reveal || reveal.seq === handledRevealRef.current) return;
    handledRevealRef.current = reveal.seq;
    const doc = iframeRef.current?.contentDocument;
    const plan = planReveal({
      line: reveal.line,
      path: pathRef.current,
      loadedPath: loadedPathRef.current,
      inFlight: inFlightRef.current,
    });
    if (plan.now && doc) scrollDocToLine(doc, reveal.line);
    pendingRevealRef.current = plan.pending;
  }, [reveal?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // 미뤄 둔 요청의 문서를 그리기 전에 다른 탭으로 옮겨 갔으면 버린다 — 몇 시간 뒤 그 문서를 다시
  // 열었을 때 화면이 그 줄로 튀면 안 된다.
  useEffect(() => {
    if (pendingRevealRef.current && pendingRevealRef.current.path !== path) pendingRevealRef.current = null;
  }, [path]);

  // Esc로 라이트박스 닫기.
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox]);

  // srcdoc 로드 때마다 iframe 문서에 리스너 부착(별도 문서 → 부모 전역 리스너 못 잡음).
  // same-origin(allow-same-origin)이라 스크립트 주입 없이 부착 가능:
  //  · 우클릭(브라우저 기본 메뉴) 억제  · 이미지 클릭 → 라이트박스  · 링크 클릭 가로채기.
  function onIframeLoad() {
    const doc = iframeRef.current?.contentDocument;
    const win = iframeRef.current?.contentWindow;
    if (!doc) return;
    setLoadedContent(srcContentRef.current);
    setLoadSeq((n) => n + 1);
    // 리로드로 0이 된 스크롤을 직전 위치(소스 줄)로 복원. 아래 scroll 리스너 부착 전에 해서
    // 프로그램적 스크롤이 역동기화(onSourceLine) 에코를 유발하지 않도록 한다.
    loadedPathRef.current = srcPathRef.current;
    inFlightRef.current = false;
    // 줄 보여 주기 요청이 이 문서 것이면 그것이 직전 위치 복원을 이긴다.
    const revealAt = takeRevealOnLoad(pendingRevealRef.current, loadedPathRef.current);
    if (revealAt != null) {
      pendingRevealRef.current = null;
      restoreLineRef.current = null;
      scrollDocToLine(doc, revealAt);
    } else if (restoreLineRef.current != null) {
      scrollDocToLine(doc, restoreLineRef.current);
      restoreLineRef.current = null;
    }
    doc.addEventListener("contextmenu", (e) => e.preventDefault());
    // 링크에 목적지를 title 로 달아 둔다 — 누르기 전에 어디로 가는지 보인다.
    annotateLinkTitles(doc, pathRef.current);
    doc.addEventListener("click", (e) => {
      const el = e.target as HTMLElement | null;
      // 이미지는 링크로 감싸여 있을 수 있다(`[![alt](img)](url)`). 그때는 링크가 이긴다 —
      // 감싼 사람이 "눌러서 이동"을 의도한 것이고, 확대는 감싸지 않은 이미지에만 준다.
      if (el?.tagName === "IMG" && !el.closest("a")) {
        const src = (el as HTMLImageElement).currentSrc || el.getAttribute("src") || "";
        if (src) setLightbox(src);
        return;
      }
      handleLinkClick(e, pathRef.current, {
        anchor: (id) => doc.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
        path: (abs, how) => onOpenPathRef.current?.(abs, how),
        ignored: (href) => useAppStore.getState().showNotice(t("link.unsupported", { href })),
        urlFailed: (_url, detail) =>
          useAppStore.getState().showNotice(t("link.openFailed", { detail }), "error"),
      });
    });
    // 미리보기 스크롤 → 상단 소스 줄 방출(rAF 스로틀). 새 srcdoc마다 문서 교체 → 옛 리스너 자동 소멸.
    if (win) {
      let raf = 0;
      win.addEventListener("scroll", () => {
        if (!onSourceLineRef.current) return;
        if (raf) win.cancelAnimationFrame(raf);
        raf = win.requestAnimationFrame(() => {
          const line = topSourceLine(doc);
          if (line != null) onSourceLineRef.current?.(line);
        });
      });
    }
  }

  return (
    <>
      <iframe
        ref={iframeRef}
        className="preview-frame"
        sandbox="allow-same-origin"
        title="preview"
        onLoad={onIframeLoad}
      />
      <AnnotLayer iframeRef={iframeRef} path={path} content={loadedContent} loadSeq={loadSeq} themeId={themeId} />
      {lightbox && (
        <div className="lightbox" role="dialog" aria-label="image" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </>
  );
});
