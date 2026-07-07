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

/** mermaid 등에서 생성된 SVG 정화. foreignObject + 내부 표시용 HTML 라벨 허용.
 *  htmlLabels를 끄면 대개 foreignObject 자체가 안 나오지만, 일부 다이어그램(class/state 등)이
 *  foreignObject를 강제할 때 라벨 글자가 사라지지 않도록 양성 HTML 태그를 허용한다(no-scripts 샌드박스라 안전). */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    // svg + html 프로파일을 **함께** → <foreignObject> 안 HTML 라벨(div/span/텍스트) 태그를 허용.
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ["foreignObject"],
    ADD_ATTR: ["style", "class", "xmlns"],
    // 핵심: DOMPurify 기본 HTML 통합지점은 annotation-xml 뿐이라, SVG 네임스페이스인 <foreignObject>
    // 안의 HTML(div 등)이 네임스페이스 검사에 걸려 **서브트리째 제거**된다(라벨 글자 사라짐).
    // foreignobject를 통합지점으로 등록해야 flowchart·mindmap·class·state·journey 라벨이 보존된다.
    // (스크립트 없는 sandbox iframe 주입 + DOMPurify가 script/이벤트는 계속 제거하므로 안전.)
    HTML_INTEGRATION_POINTS: { foreignobject: true, "annotation-xml": true },
  }) as unknown as string;
}
