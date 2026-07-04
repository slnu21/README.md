// 공유 렌더 문서 빌더 — 미리보기 iframe과 내보내기(HTML/PDF)가 함께 쓴다.
// 테마 5토큰 + PREVIEW_CSS(코드 하이라이트·수식(MathML)·mermaid 스타일 전부 인라인)로
// 자기완결 HTML 문서 문자열을 만든다. 폰트 @font-face 는 주입 대상이 다르므로 opts로 교체 가능:
//   · 미리보기 = 앱오리진 url() (FONT_FACE_CSS 기본)
//   · 내보내기 = 이식형(data URI 임베드 또는 빈 문자열)
import { themes, defaultThemeId } from "../themes";
import { FONT_FACE_CSS } from "./fonts";

// iframe/문서 내부(리더) 스타일. 색은 주입된 5토큰 사용, 폰트는 --read-font(주입) + 시스템 폴백.
export const PREVIEW_CSS = `
*{box-sizing:border-box}
html,body{margin:0}
body{padding:14px 14px 40px;background:color-mix(in srgb,var(--bg) 92%,#000);color:var(--fg);
  font-family:var(--read-font,"Palatino Linotype","Book Antiqua",Georgia,"Times New Roman",serif);
  font-size:var(--reader-font-size,16px);line-height:1.75;-webkit-font-smoothing:antialiased}
/* 조판 시트: 페인 폭을 따라 넓어지는 카드(얇은 매트 여백) → 에디터와 시각적 구분 */
.md{margin:0;background:var(--bg);border:1px solid var(--border);
  border-radius:10px;padding:32px 44px 44px;
  box-shadow:0 1px 2px rgba(0,0,0,.05),0 10px 30px rgba(0,0,0,.05)}
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

export interface FontOpts {
  readStack: string;
  readerPx: number;
}

export interface BuildDocOpts {
  /** 폰트 @font-face 규칙. 기본=앱오리진 FONT_FACE_CSS(미리보기). 내보내기는 이식형 전달. */
  fontFaceCss?: string;
  /** 추가 CSS(예: 인쇄용 @page 여백). PREVIEW_CSS 뒤에 붙는다. */
  extraCss?: string;
}

/** 본문 HTML을 자기완결 HTML 문서 문자열로 감싼다(테마·폰트·PREVIEW_CSS 인라인). */
export function buildDoc(
  bodyHtml: string,
  themeId: string,
  font: FontOpts,
  opts: BuildDocOpts = {},
): string {
  const theme = themes[themeId] ?? themes[defaultThemeId];
  const vars = Object.entries(theme.tokens)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
  // 격리 문서 → 읽기 글꼴/줌을 CSS 변수로 직접 주입(기능 3·5).
  const fontVars = `--read-font:${font.readStack};--reader-font-size:${font.readerPx.toFixed(1)}px;`;
  const fontFace = opts.fontFaceCss ?? FONT_FACE_CSS;
  const extra = opts.extraCss ?? "";
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="color-scheme" content="${theme.type}">` +
    `<style>:root{${vars}${fontVars}}${fontFace}${PREVIEW_CSS}${extra}</style></head>` +
    `<body><div class="md">${bodyHtml}</div></body></html>`
  );
}
