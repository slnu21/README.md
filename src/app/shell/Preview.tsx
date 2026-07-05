// 실시간 미리보기(WBS 511).
// 파이프라인: content → Web Worker(markdown-it) → DOMPurify 정화 → 샌드박스 iframe(srcdoc).
// 200ms 디바운스. 테마 토큰을 iframe에 주입해 동기화. 로컬 이미지는 asset 프로토콜로 재작성.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { createMarkdown, extractToc, type TocItem } from "../lib/markdown";
import { sanitizeHtml } from "../lib/sanitize";
import { renderMermaid } from "../lib/mermaid";
import { useAppStore } from "../store";
import { readStack, BASE_READER_PX } from "../lib/fonts";
import { buildDoc, type FontOpts } from "../lib/renderDoc";

function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(0, i) : "";
}

function joinPath(dir: string, rel: string): string {
  // 절대 경로(드라이브/슬래시 시작)는 그대로, 상대 경로는 문서 폴더 기준.
  if (/^[a-zA-Z]:[\\/]/.test(rel) || rel.startsWith("/") || rel.startsWith("\\")) return rel;
  const clean = rel.replace(/^\.[\\/]/, "");
  return dir ? `${dir}/${clean}` : clean;
}

// 로컬(상대/절대 파일) 이미지 src → Tauri asset URL. 원격/데이터 URL은 그대로.
function rewriteImages(html: string, fileDir: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (!src || /^(https?:|data:|blob:|asset:)/i.test(src)) return;
    try {
      img.setAttribute("src", convertFileSrc(joinPath(fileDir, src)));
    } catch {
      /* 변환 실패 시 원본 유지 */
    }
  });
  return doc.body.innerHTML;
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
}

export const Preview = forwardRef<PreviewHandle, PreviewProps>(function Preview(
  { content, path, themeId, onToc },
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
  const [bodyHtml, setBodyHtml] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null); // 확대할 이미지 src(라이트박스)
  // 읽기 글꼴/줌(기능 3·5) — iframe은 격리돼 있어 buildDoc에 직접 주입한다.
  const fontRead = useAppStore((s) => s.fontRead);
  const previewZoom = useAppStore((s) => s.previewZoom);
  const font: FontOpts = { readStack: readStack(fontRead), readerPx: BASE_READER_PX * previewZoom };
  // 미리보기 전용 추가 CSS(이미지에 확대 커서) — 내보내기엔 미적용.
  const previewExtra = "img{cursor:zoom-in}";
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
    // font(readStack/readerPx)는 fontRead·previewZoom 파생 → 이들 변경 시 재빌드.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyHtml, themeId, isDemo, fontRead, previewZoom]);

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
    if (!doc) return;
    doc.addEventListener("contextmenu", (e) => e.preventDefault());
    doc.addEventListener("click", (e) => {
      const el = e.target as HTMLElement | null;
      if (el?.tagName === "IMG") {
        const src = (el as HTMLImageElement).currentSrc || el.getAttribute("src") || "";
        if (src) setLightbox(src);
      }
    });
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
