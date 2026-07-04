// DOMPurify 정화 설정 중앙화. 워커 렌더·demo·mermaid SVG 경로가 공유한다.
// 미리보기는 sandbox iframe에 주입되어 스크립트가 원천 차단되지만, 이중 방어로 정화한다.
import DOMPurify from "dompurify";

// KaTeX MathML 출력에서 DOMPurify 기본 허용목록이 빠뜨리는 태그(semantics/annotation 등)를 보강.
const MATHML_TAGS = [
  "math", "semantics", "annotation", "annotation-xml", "mrow", "mi", "mo", "mn",
  "ms", "mtext", "mspace", "msup", "msub", "msubsup", "mfrac", "msqrt", "mroot",
  "munder", "mover", "munderover", "mtable", "mtr", "mtd", "mpadded", "mphantom",
  "menclose", "mstyle", "merror", "mglyph",
];

const CONFIG = {
  // eq/eqn = markdown-it-texmath 래퍼 요소
  ADD_TAGS: [...MATHML_TAGS, "eq", "eqn"],
  ADD_ATTR: [
    // MathML 속성
    "encoding", "display", "mathvariant", "displaystyle", "scriptlevel",
    "stretchy", "accent", "accentunder", "columnalign", "rowspacing", "columnspacing",
    "open", "close", "separators", "fence", "lspace", "rspace", "width", "linethickness",
    // task-list 체크박스
    "checked", "disabled", "type",
    // 스크롤 동기화 소스라인(기능 8). DOMPurify 기본이 data-* 를 허용하지만 명시적으로 보존.
    "data-line",
  ],
};

/** 미리보기 HTML 정화(마크다운 렌더 결과). sandbox iframe 주입 전 이중 방어. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, CONFIG) as unknown as string;
}

/** mermaid 등에서 생성된 SVG 정화. foreignObject/인라인 style 허용. */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["foreignObject"],
    ADD_ATTR: ["style"],
  }) as unknown as string;
}
