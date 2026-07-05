// 자기완결(포터블) HTML 생성. 미리보기 파이프라인을 재사용하되 앱 밖에서도 열리도록:
//  · 로컬 이미지 → data URI 내장(asset URL은 CSP상 fetch 불가 → Rust로 바이트 읽음)
//  · 선택 읽기 폰트 → data URI @font-face 내장(앱오리진 url()은 앱 밖에서 깨짐)
//  · CSS/코드하이라이트/수식(MathML)/mermaid(SVG)는 buildDoc이 이미 인라인
import { createMarkdown } from "../../lib/markdown";
import { sanitizeHtml } from "../../lib/sanitize";
import { renderMermaid } from "../../lib/mermaid";
import { buildDoc } from "../../lib/renderDoc";
import { readStack, BASE_READER_PX, bundledWoff2For } from "../../lib/fonts";
import { dirOf, inlineImages } from "../../lib/previewImages";

export interface ExportParams {
  content: string;
  path: string;
  themeId: string;
  fontRead: string;
  previewZoom: number;
}

// 같은 오리진 자산을 base64로. CSP connect-src 'self' 내에서 fetch 가능(woff2는 앱 번들).
async function fetchAsBase64(url: string): Promise<string> {
  const abs = new URL(url, window.location.href).href;
  const buf = await (await fetch(abs)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// 선택 읽기 폰트를 data URI @font-face로. 시스템 폰트면 빈 문자열(스택 폴백).
async function embedFontCss(readFontId: string): Promise<string> {
  const faces = bundledWoff2For(readFontId);
  const rules = await Promise.all(
    faces.map(async (f) => {
      const b64 = await fetchAsBase64(f.url);
      return (
        `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};` +
        `font-display:swap;src:url('data:font/woff2;base64,${b64}') format('woff2')}`
      );
    }),
  );
  return rules.join("");
}

/** 자기완결 HTML 문서 문자열 생성. extraCss=인쇄용 @page 등 추가 규칙. */
export async function buildExportHtml(p: ExportParams, extraCss = ""): Promise<string> {
  const md = createMarkdown();
  const rendered = sanitizeHtml(md.render(p.content));
  const withImages = await inlineImages(rendered, dirOf(p.path));
  const withMermaid = await renderMermaid(withImages, p.themeId);
  const fontFaceCss = await embedFontCss(p.fontRead);
  const font = { readStack: readStack(p.fontRead), readerPx: BASE_READER_PX * p.previewZoom };
  return buildDoc(withMermaid, p.themeId, font, { fontFaceCss, extraCss });
}
