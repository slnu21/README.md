// 공유 렌더 문서 빌더 — 미리보기 iframe과 내보내기(HTML/PDF)가 함께 쓴다.
// 테마 5토큰 + PREVIEW_CSS(코드 하이라이트·수식(MathML)·mermaid 스타일 전부 인라인)로
// 자기완결 HTML 문서 문자열을 만든다. 폰트 @font-face 는 주입 대상이 다르므로 opts로 교체 가능:
//   · 미리보기 = 앱오리진 url() (FONT_FACE_CSS 기본)
//   · 내보내기 = 이식형(data URI 임베드 또는 빈 문자열)
import { themes, defaultThemeId } from "../themes";
import { FONT_FACE_CSS, BASE_READER_PX } from "./fonts";

/** 다이어그램 전용 글꼴. mermaid 기본 스택("trebuchet ms",verdana,arial,sans-serif)에는 **한글
 *  글리프가 없어** 한글이 전부 문서별 폴백으로 해결됐다 → 측정 문서와 표시 문서가 서로 다른 face를
 *  고를 수 있어 라벨 폭이 어긋났다. 한글 face를 명시해 양쪽을 못박는다.
 *  본문 읽기 글꼴을 따라가지 않는 이유: 번들 웹폰트는 로드 대기·font-display:swap 타이밍에 따라
 *  측정 후 글꼴이 바뀔 수 있고, 그러면 지오메트리가 다시 어긋난다(v0.6.6 편집기 버그와 같은 함정).
 *  lib/mermaid.ts 의 `fontFamily`·`themeVariables` 와 아래 DIAGRAM_CTX_CSS 가 **같은 리터럴**을
 *  써야 하므로 여기(공유 상수 자리)에 둔다. */
export const DIAGRAM_FONT = `"Trebuchet MS","Malgun Gothic",Verdana,Arial,sans-serif`;
export const DIAGRAM_FONT_PX = 16;

/** mermaid 측정(앱 문서)↔표시(이 문서)에서 **상속되는** 속성을 양쪽 동일하게 고정한다.
 *
 *  mermaid는 sandbox iframe 안에서 실행될 수 없어(스크립트 차단) 앱 문서에서 재고 여기서 보여준다.
 *  그런데 mermaid가 SVG에 심는 <style>은 font-family/font-size/fill/p{margin:0}까지만 고정하고
 *  line-height 등은 고정하지 않는다 → 앱 문서(line-height 없음 = normal)와 미리보기 문서
 *  (body{line-height:1.75})의 차이가 그대로 라벨 상자 오차가 되어 foreignObject 경계에서 잘렸다.
 *  text-rendering도 앱은 optimizeLegibility, 여기 기본은 auto라 글자 폭이 계통적으로 어긋났다.
 *
 *  font-family·font-size 도 함께 고정한다(v0.6.9). 지금은 mermaid가 SVG에 심는
 *  `#mmd-N{font-family;font-size}` 가 양쪽을 재워 주지만, 그 <style> 이나 svg의 id 가 정화에서
 *  사라지는 순간 측정은 --ui-font, 표시는 --read-font(세리프!)가 되어 조용히 크게 어긋난다.
 *  여기서 못박아 두면 그 단일 실패점이 사라진다(#mmd-N 이 살아 있으면 특이도상 그쪽이 이겨 무해).
 *
 *  **한쪽만 바뀌면 버그가 재발하므로 lib/mermaid.ts 측정 스테이지와 이 상수를 반드시 공유한다.** */
export const DIAGRAM_CTX_CSS =
  "line-height:normal;text-rendering:auto;letter-spacing:normal;word-spacing:normal;" +
  "font-kerning:auto;font-variant-ligatures:normal;-webkit-font-smoothing:antialiased;" +
  `font-family:${DIAGRAM_FONT};font-size:${DIAGRAM_FONT_PX}px`;

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
/* 다이어그램: 측정 문맥과 동일한 상속 속성(DIAGRAM_CTX_CSS)을 걸어 라벨 상자 오차를 없앤다.
   맞춤(기본) = flex 축소 + max-width:100% 로 카드 폭에 들어오고, --reader-zoom 은 여유가 있는
   작은 차트만 키운다(카드에 꽉 찬 차트는 이미 최대라 확대 여지가 없다 → 원본 모드를 쓴다). */
.mermaid-rendered{display:flex;justify-content:center;margin:1em 0;overflow-x:auto;${DIAGRAM_CTX_CSS}}
.mermaid-rendered svg{max-width:100%;height:auto;zoom:var(--reader-zoom,1)}
/* 원본 모드: flex 축소를 끊고(flex:none) **명시적 width**를 줘야 실제 크기가 나온다.
   max-width:none 만으로는 flex-shrink가 그대로 카드 폭으로 눌러버리고, width:auto·max-content 도
   viewBox 뿐인 인라인 SVG에선 100%로 되돌아간다(Chromium 실측). --diagram-w = lib/mermaid.ts가
   viewBox에서 읽어 래퍼에 박아 준 원본 폭. flex-start = 중앙정렬+스크롤 시 왼쪽이 잘리는 함정 회피. */
.diagram-natural .mermaid-rendered{justify-content:flex-start}
.diagram-natural .mermaid-rendered svg{flex:none;max-width:none;width:var(--diagram-w,auto)}
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
  /** 다이어그램 너비. fit=카드 폭에 축소 맞춤(기본), natural=원본 크기 + 블록 내 가로 스크롤.
   *  슬라이드·인쇄는 기본(fit)이 안전하므로 미리보기만 설정값을 넘긴다. */
  diagramWidth?: "fit" | "natural";
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
  // --reader-zoom: 다이어그램(SVG)은 절대 px 지오메트리라 font-size 확대를 못 따라간다 → 배율을 따로
  // 넘겨 .mermaid-rendered svg 가 zoom 으로 비례 확대한다. readerPx 에서 파생하므로 호출부 수정 불필요
  // (미리보기=previewZoom, 프레젠테이션=1.35, 내보내기=previewZoom 이 자동으로 맞는 값이 된다).
  const zoom = font.readerPx / BASE_READER_PX;
  const fontVars =
    `--read-font:${font.readStack};--reader-font-size:${font.readerPx.toFixed(1)}px;` +
    `--reader-zoom:${zoom.toFixed(3)};`;
  // 원본 모드는 body 클래스로 켠다(CSS 변수로는 안 된다: 원본 폭 --diagram-w 는 래퍼마다 다른데
  // :root에서 var(--diagram-w)를 참조하면 선언 위치인 :root에서 해석돼 빈 값이 된다).
  const bodyClass = opts.diagramWidth === "natural" ? ` class="diagram-natural"` : "";
  const fontFace = opts.fontFaceCss ?? FONT_FACE_CSS;
  const extra = opts.extraCss ?? "";
  // lang: mermaid 기본 글꼴 스택에 한글 글리프가 없어 한글은 문서별 폴백으로 해결된다. 앱 문서는
  // <html lang>이 있는데 srcdoc에 없으면 폴백 face가 갈려 측정↔표시 폭이 어긋난다(a11y 겸).
  const lang = document.documentElement.lang || "ko";
  return (
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">` +
    `<meta name="color-scheme" content="${theme.type}">` +
    `<style>:root{${vars}${fontVars}}${fontFace}${PREVIEW_CSS}${extra}</style></head>` +
    `<body${bodyClass}><div class="md">${bodyHtml}</div></body></html>`
  );
}
