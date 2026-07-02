// 실시간 미리보기(WBS 511).
// 파이프라인: content → Web Worker(markdown-it) → DOMPurify 정화 → 샌드박스 iframe(srcdoc).
// 200ms 디바운스. 테마 토큰을 iframe에 주입해 동기화. 로컬 이미지는 asset 프로토콜로 재작성.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { themes, defaultThemeId } from "../themes";
import { createMarkdown, extractToc, type TocItem } from "../lib/markdown";
import { sanitizeHtml } from "../lib/sanitize";
import { renderMermaid } from "../lib/mermaid";

// iframe 내부(리더) 스타일. 폰트는 오프라인 시스템 폰트, 색은 주입된 5토큰 사용.
const PREVIEW_CSS = `
*{box-sizing:border-box}
html,body{margin:0}
body{padding:34px 40px 72px;background:var(--bg);color:var(--fg);
  font-family:"Palatino Linotype","Book Antiqua",Georgia,"Times New Roman",serif;
  font-size:16px;line-height:1.75;-webkit-font-smoothing:antialiased}
.md{max-width:720px;margin:0 auto}
h1,h2,h3,h4,h5{font-weight:600;line-height:1.25;margin:1.6em 0 .6em}
h1{font-size:1.95em;margin-top:0;letter-spacing:-.01em}
h2{font-size:1.45em;border-bottom:1px solid var(--border);padding-bottom:.25em}
h3{font-size:1.2em}
p{margin:0 0 1em}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
ul,ol{padding-left:1.5em;margin:0 0 1em}
li{margin:.25em 0}
blockquote{margin:0 0 1em;padding:.2em 0 .2em 1em;border-left:3px solid var(--accent);
  color:color-mix(in srgb,var(--fg) 62%,var(--bg));font-style:italic}
code{font-family:"Cascadia Code","Cascadia Mono",ui-monospace,Consolas,monospace;
  font-size:.86em;background:color-mix(in srgb,var(--accent) 12%,var(--bg));
  color:color-mix(in srgb,var(--accent) 55%,var(--fg));padding:.12em .4em;border-radius:5px}
pre{background:color-mix(in srgb,var(--fg) 5%,var(--bg));border:1px solid var(--border);
  border-radius:8px;padding:14px 16px;overflow:auto;margin:0 0 1em}
pre code{background:none;color:inherit;padding:0;font-size:.85em}
table{border-collapse:collapse;width:100%;margin:0 0 1em;
  font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;font-size:.95em}
th,td{border:1px solid var(--border);padding:7px 11px;text-align:left}
thead th{background:var(--surface)}
img{max-width:100%;height:auto;border-radius:6px}
hr{border:none;border-top:1px solid var(--border);margin:1.6em 0}
h1:first-child,h2:first-child,h3:first-child{margin-top:0}
.task-list-item{list-style:none}
.task-list-item-checkbox{margin:0 .5em 0 -1.4em}
.footnotes{font-size:.9em;color:color-mix(in srgb,var(--fg) 78%,var(--bg));border-top:1px solid var(--border);margin-top:2.4em;padding-top:.4em}
.footnotes ol{padding-left:1.4em}
.footnote-ref a,.footnote-backref{text-decoration:none;color:var(--accent)}
mark{background:color-mix(in srgb,var(--accent) 22%,var(--bg));color:inherit;padding:.05em .2em;border-radius:3px}
ins{text-decoration:underline}
sub,sup{font-size:.75em;line-height:0}
abbr[title]{text-decoration:underline dotted;cursor:help}
dl dt{font-weight:600;margin-top:.7em}
dl dd{margin:0 0 .4em 1.3em}
.callout{border-left:4px solid var(--accent);border-radius:0 6px 6px 0;padding:.4em 1em;margin:1em 0;background:color-mix(in srgb,var(--accent) 8%,var(--bg))}
.callout>:first-child{margin-top:0}
.callout>:last-child{margin-bottom:0}
.callout.warning{border-color:#d97706;background:color-mix(in srgb,#d97706 8%,var(--bg))}
.callout.tip{border-color:#059669;background:color-mix(in srgb,#059669 8%,var(--bg))}
.hljs{background:transparent;color:inherit}
.hljs-comment,.hljs-quote{color:color-mix(in srgb,var(--fg) 45%,var(--bg));font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-section,.hljs-doctag,.hljs-type,.hljs-name,.hljs-strong{color:color-mix(in srgb,var(--accent) 80%,var(--fg));font-weight:600}
.hljs-string,.hljs-title,.hljs-attr,.hljs-attribute,.hljs-symbol,.hljs-bullet,.hljs-addition,.hljs-template-tag,.hljs-template-variable{color:color-mix(in srgb,var(--accent) 52%,var(--fg))}
.hljs-number,.hljs-meta,.hljs-built_in,.hljs-variable,.hljs-params,.hljs-selector-id,.hljs-selector-class{color:color-mix(in srgb,var(--fg) 82%,var(--bg))}
.hljs-deletion{color:#c0392b}
.hljs-emphasis{font-style:italic}
math{font-size:1.02em}
math[display="block"],eqn{display:block;margin:1em 0;text-align:center;overflow-x:auto}
eq{padding:0 .1em}
.mermaid-rendered{display:flex;justify-content:center;margin:1em 0}
.mermaid-rendered svg{max-width:100%;height:auto}
.mermaid-error{color:#c0392b}
`;

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

function buildDoc(bodyHtml: string, themeId: string): string {
  const theme = themes[themeId] ?? themes[defaultThemeId];
  const vars = Object.entries(theme.tokens)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="color-scheme" content="${theme.type}">` +
    `<style>:root{${vars}}${PREVIEW_CSS}</style></head>` +
    `<body><div class="md">${bodyHtml}</div></body></html>`
  );
}

export interface PreviewHandle {
  scrollToHeading(id: string): void;
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
        if (iframe) iframe.srcdoc = buildDoc(body, themeId);
      } catch (err) {
        if (iframe) iframe.srcdoc = buildDoc("<pre>DEMO ERROR: " + String(err) + "</pre>", themeId);
      }
      return;
    }
    const worker = workerRef.current;
    if (!worker) return;
    const id = ++reqId.current;
    const timer = window.setTimeout(() => worker.postMessage({ id, source: content }), 200);
    return () => window.clearTimeout(timer);
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
      iframe.srcdoc = buildDoc(finalBody, themeId);
    })();
    return () => {
      cancelled = true;
    };
  }, [bodyHtml, themeId, isDemo]);

  return <iframe ref={iframeRef} className="preview-frame" sandbox="allow-same-origin" title="preview" />;
});
