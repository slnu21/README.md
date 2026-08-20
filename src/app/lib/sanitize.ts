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

// ── 지워진 href 를 흔적으로 남긴다 ───────────────────────────────────────────
// DOMPurify 는 허용 목록에 없는 스킴(javascript:·file:·obsidian: …)의 href 를 **통째로**
// 지운다. 그러면 미리보기에는 파랗게 밑줄 그어진, 그런데 눌러도 아무 일 없는 링크가 남는다 —
// 사용자가 "링크가 클릭이 안 된다"고 겪는 모양 그대로다. 지워진 값을 data-blocked-href 로
// 남겨 두면 클릭 핸들러가 무엇이었는지 말해 주거나(안내 토스트), file:// 처럼 옮길 수 있는
// 것은 로컬 경로로 바꿔 열 수 있다.
//
// 보안 경계는 그대로다 — href 를 되살리는 게 아니라 값을 data-* 로 **기록만** 한다.
// 브라우저는 data-* 를 절대 실행하지 않고, 무엇을 열지는 lib/links.ts 가 다시 판단한다.
const blockedHref = new WeakMap<Node, string>();
let hooksInstalled = false;

/** 훅은 **첫 정화 때** 단다. 모듈 로드 시점에 달면 DOM 없는 환경에서 터진다 —
 *  DOMPurify 는 window 가 없으면 `addHook` 조차 없는 축소판을 내보내고, 우리 단위 테스트는
 *  node 환경에서 돈다(이 모듈을 import 만 하는 테스트까지 같이 죽었다). */
function ensureHooks(): void {
  if (hooksInstalled || typeof DOMPurify.addHook !== "function") return;
  hooksInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    // 속성 순회 중이라 여기서 노드를 건드리지 않는다 — 값만 챙겨 두고 뒤에서 붙인다.
    if (data.attrName === "href") blockedHref.set(node, data.attrValue);
  });
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const original = blockedHref.get(node);
    if (original === undefined) return;
    blockedHref.delete(node);
    const el = node as Element;
    if (!el.hasAttribute("href")) el.setAttribute("data-blocked-href", original);
  });
}

/** 미리보기 HTML 정화(마크다운 렌더 결과). sandbox iframe 주입 전 이중 방어. */
export function sanitizeHtml(html: string): string {
  ensureHooks();
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
    // dominant-baseline: DOMPurify svg 허용목록에 이것만 빠져 있다(alignment-baseline은 있는데,
    // 그건 <text>에 적용되지 않아 대체가 안 된다). mermaid도 자체 정화에 DOMPURIFY_ATTR=
    // ["dominant-baseline"]로 예외를 두는데, 우리 2차 정화가 그걸 다시 지워 sequence·quadrant·
    // xychart·ER·class/state 노트 텍스트가 수직 중앙정렬을 잃고 baseline으로 내려앉아 도형 밖으로
    // 밀리거나 잘렸다. 표현용 속성(URL·스크립트 표면 없음)이라 허용해도 안전.
    ADD_ATTR: ["style", "class", "xmlns", "dominant-baseline"],
    // 핵심: DOMPurify 기본 HTML 통합지점은 annotation-xml 뿐이라, SVG 네임스페이스인 <foreignObject>
    // 안의 HTML(div 등)이 네임스페이스 검사에 걸려 **서브트리째 제거**된다(라벨 글자 사라짐).
    // foreignobject를 통합지점으로 등록해야 flowchart·mindmap·class·state·journey 라벨이 보존된다.
    // (스크립트 없는 sandbox iframe 주입 + DOMPurify가 script/이벤트는 계속 제거하므로 안전.)
    HTML_INTEGRATION_POINTS: { foreignobject: true, "annotation-xml": true },
  }) as unknown as string;
}
