// 실시간 미리보기(WBS 511).
// 파이프라인: content → Web Worker(markdown-it) → DOMPurify 정화 → 샌드박스 iframe(srcdoc).
// 200ms 디바운스. 테마 토큰을 iframe에 주입해 동기화. 로컬 이미지는 asset 프로토콜로 재작성.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createMarkdown, extractToc, type TocItem } from "../lib/markdown";
import { sanitizeHtml } from "../lib/sanitize";
import { renderMermaid } from "../lib/mermaid";
import { useAppStore } from "../store";
import { readStack, BASE_READER_PX } from "../lib/fonts";
import { buildDoc, type FontOpts } from "../lib/renderDoc";
import { dirOf, rewriteImages } from "../lib/previewImages";

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
}

export const Preview = forwardRef<PreviewHandle, PreviewProps>(function Preview(
  { content, path, themeId, onToc, onSourceLine },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const buildToken = useRef(0);
  const pathRef = useRef(path);
  pathRef.current = path;
  const onTocRef = useRef(onToc);
  onTocRef.current = onToc;
  const onSourceLineRef = useRef(onSourceLine);
  onSourceLineRef.current = onSourceLine;
  const [bodyHtml, setBodyHtml] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null); // 확대할 이미지 src(라이트박스)
  // 읽기 글꼴/줌(기능 3·5) — iframe은 격리돼 있어 buildDoc에 직접 주입한다.
  const fontRead = useAppStore((s) => s.fontRead);
  const previewZoom = useAppStore((s) => s.previewZoom);
  const readingWidth = useAppStore((s) => s.readingWidth);
  const font: FontOpts = { readStack: readStack(fontRead), readerPx: BASE_READER_PX * previewZoom };
  // 미리보기 전용 추가 CSS(내보내기엔 미적용): 이미지 확대 커서 + 리딩 폭(본문 최대 폭).
  const widthPx = readingWidth === "narrow" ? "680px" : readingWidth === "wide" ? "none" : "860px";
  const previewExtra =
    "img{cursor:zoom-in}" +
    (widthPx === "none" ? "" : `.md{max-width:${widthPx};margin-left:auto;margin-right:auto}`);
  // 데모/스크린샷(?demo)에서는 헤드리스 캡처 타이밍 때문에 워커 대신 메인 스레드로 즉시 렌더.
  const isDemo = new URLSearchParams(window.location.search).has("demo");

  // 아웃라인 클릭 → iframe 내부 헤딩으로 스크롤. sandbox="allow-same-origin"(allow-scripts 미포함) 필요.
  useImperativeHandle(
    ref,
    () => ({
      scrollToHeading(id: string) {
        const doc = iframeRef.current?.contentDocument;
        doc?.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
      // 소스 줄 → 렌더 위치로 스크롤(기능 8). data-line 앵커 사이 offsetTop 보간, 즉시 이동.
      scrollToLine(line: number) {
        const doc = iframeRef.current?.contentDocument;
        const scroller = doc?.scrollingElement ?? doc?.documentElement;
        if (!doc || !scroller) return;
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
      const clean = sanitizeHtml(html);
      setBodyHtml(rewriteImages(clean, dirOf(pathRef.current)));
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [isDemo]);

  // content/path 변경 시 디바운스(200ms) 후 워커에 렌더 요청.
  useEffect(() => {
    if (isDemo) {
      const iframe = iframeRef.current;
      try {
        const md = createMarkdown();
        onTocRef.current?.(extractToc(md, content));
        const body = rewriteImages(sanitizeHtml(md.render(content)), dirOf(pathRef.current));
        if (iframe) iframe.srcdoc = buildDoc(body, themeId, font, { extraCss: previewExtra });
      } catch (err) {
        if (iframe)
          iframe.srcdoc = buildDoc("<pre>DEMO ERROR: " + String(err) + "</pre>", themeId, font, {
            extraCss: previewExtra,
          });
      }
      return;
    }
    const worker = workerRef.current;
    if (!worker) return;
    const id = ++reqId.current;
    const timer = window.setTimeout(() => worker.postMessage({ id, source: content }), 200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, path, isDemo]);

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
      iframe.srcdoc = buildDoc(finalBody, themeId, font, { extraCss: previewExtra });
    })();
    return () => {
      cancelled = true;
    };
    // font(readStack/readerPx)는 fontRead·previewZoom 파생 → 이들 변경 시 재빌드. readingWidth도 CSS 파생.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyHtml, themeId, isDemo, fontRead, previewZoom, readingWidth]);

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
  //  · 우클릭(브라우저 기본 메뉴) 억제  · 이미지 클릭 → 라이트박스.
  function onIframeLoad() {
    const doc = iframeRef.current?.contentDocument;
    const win = iframeRef.current?.contentWindow;
    if (!doc) return;
    doc.addEventListener("contextmenu", (e) => e.preventDefault());
    doc.addEventListener("click", (e) => {
      const el = e.target as HTMLElement | null;
      if (el?.tagName === "IMG") {
        const src = (el as HTMLImageElement).currentSrc || el.getAttribute("src") || "";
        if (src) setLightbox(src);
      }
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
      {lightbox && (
        <div className="lightbox" role="dialog" aria-label="image" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </>
  );
});
