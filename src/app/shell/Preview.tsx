// 실시간 미리보기(WBS 511).
// 파이프라인: content → Web Worker(markdown-it) → DOMPurify 정화 → 샌드박스 iframe(srcdoc).
// 200ms 디바운스. 테마 토큰을 iframe에 주입해 동기화. 로컬 이미지는 asset 프로토콜로 재작성.
import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { convertFileSrc } from "@tauri-apps/api/core";
import { themes, defaultThemeId } from "../themes";
import { createMarkdown } from "../lib/markdown";

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

export function Preview({ content, path, themeId }: { content: string; path: string; themeId: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const pathRef = useRef(path);
  pathRef.current = path;
  const [bodyHtml, setBodyHtml] = useState("");
  // 데모/스크린샷(?demo)에서는 헤드리스 캡처 타이밍 때문에 워커 대신 메인 스레드로 즉시 렌더.
  const isDemo = new URLSearchParams(window.location.search).has("demo");

  // 워커 1회 생성. 응답을 정화(DOMPurify) 후 이미지 재작성.
  useEffect(() => {
    if (isDemo) return;
    const worker = new Worker(new URL("../workers/markdown.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent) => {
      const { id, html } = e.data as { id: number; html: string };
      if (id !== reqId.current) return; // 오래된 응답 무시
      const clean = DOMPurify.sanitize(html);
      setBodyHtml(rewriteImages(clean, dirOf(pathRef.current)));
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // content/path 변경 시 디바운스(200ms) 후 워커에 렌더 요청.
  useEffect(() => {
    if (isDemo) {
      const clean = DOMPurify.sanitize(createMarkdown().render(content));
      const body = rewriteImages(clean, dirOf(pathRef.current));
      const iframe = iframeRef.current;
      if (iframe) iframe.srcdoc = buildDoc(body, themeId);
      return;
    }
    const worker = workerRef.current;
    if (!worker) return;
    const id = ++reqId.current;
    const timer = window.setTimeout(() => worker.postMessage({ id, source: content }), 200);
    return () => window.clearTimeout(timer);
  }, [content, path]);

  // 정화된 HTML 또는 테마 변경 시 iframe 재구성.
  useEffect(() => {
    if (isDemo) return;
    const iframe = iframeRef.current;
    if (iframe) iframe.srcdoc = buildDoc(bodyHtml, themeId);
  }, [bodyHtml, themeId]);

  return <iframe ref={iframeRef} className="preview-frame" sandbox="" title="preview" />;
}
