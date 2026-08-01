// Mermaid 다이어그램: sandbox iframe 내부에선 스크립트 실행 불가 → 메인 스레드에서 SVG로 렌더 후 주입.
// 무거운 라이브러리는 최초 mermaid 블록이 있을 때만 동적 import(코드 스플리팅) → 초기 번들 제외.
// 렌더된 SVG는 sanitizeSvg 로 정화하며, srcdoc 은 정적 SVG만 담으므로 sandbox 격리가 유지된다.
import { sanitizeSvg } from "./sanitize";
import { DIAGRAM_CTX_CSS, DIAGRAM_FONT, DIAGRAM_FONT_PX } from "./renderDoc";
import { themes, defaultThemeId } from "../themes";

let mermaidMod: Promise<typeof import("mermaid")> | null = null;
const loadMermaid = () => (mermaidMod ??= import("mermaid"));

let seq = 0;

/** 측정 스테이지의 id. App.css가 이 안에서 트리 행 규칙(.node)을 되돌리는 데 쓴다 —
 *  mermaid도 노드 그룹에 class="node"를 붙이기 때문(v0.6.9, 아래 measureStage 주석 참고). */
export const MEASURE_STAGE_ID = "mermaid-measure-stage";

/** mermaid가 렌더·측정에 쓸 화면 밖 컨테이너(재사용 1개).
 *  mermaid.render(id, src, svgContainingElement)에 넘기면 document.body 대신 여기에 렌더하므로
 *  ① 미리보기와 동일한 상속 문맥(DIAGRAM_CTX_CSS)에서 측정되고 ② 앱 본문에 임시 SVG가 튀지 않는다.
 *
 *  **앱 CSS 오염 주의(v0.6.9).** 이 스테이지는 앱 문서 안에 있으므로 App.css가 그대로 적용된다.
 *  mermaid는 노드 그룹에 `class="node"`를 붙이는데 워크스페이스 트리 행도 `.node`다 —
 *  `App.css .node{font-size:13px}`가 다이어그램 라벨에 걸려 **13px로 재고 미리보기에서 16px로
 *  그리게** 됐다(= 라벨 폭 123%, v0.6.8 잘림의 실제 원인). App.css 끝의 `#mermaid-measure-stage .node`
 *  규칙이 그 한 겹을 되돌린다. 새 UI 클래스명이 mermaid와 겹치면 같은 방식으로 막을 것. */
let stage: HTMLDivElement | null = null;
function measureStage(): HTMLDivElement {
  if (!stage?.isConnected) {
    stage = document.createElement("div");
    stage.id = MEASURE_STAGE_ID;
    // display:none 은 금물 — 레이아웃이 죽어 getBBox/getComputedTextLength가 0을 돌려준다.
    stage.setAttribute(
      "style",
      `position:fixed;left:-99999px;top:0;width:1200px;pointer-events:none;${DIAGRAM_CTX_CSS}`,
    );
    document.body.appendChild(stage);
  }
  // lang은 매번 갱신한다. 생성 시 한 번만 잡으면 언어 토글(App.tsx가 document.documentElement.lang을
  // 바꾼다) 이후 측정 문서와 buildDoc(renderDoc.ts)의 lang이 어긋나 한글 폴백 face가 갈린다.
  stage.lang = document.documentElement.lang || "ko";
  return stage;
}

/** SVG viewBox("minX minY W H")의 W. 못 읽으면 null → CSS가 width:auto 폴백(=맞춤과 동일 동작). */
export function viewBoxWidth(svg: Element | null): number | null {
  // HTML 파서가 SVG 속성 대소문자를 교정하지만(viewbox→viewBox) 방어적으로 둘 다 본다.
  const vb = svg?.getAttribute("viewBox") ?? svg?.getAttribute("viewbox");
  const w = vb ? Number(vb.trim().split(/[\s,]+/)[2]) : NaN;
  return Number.isFinite(w) && w > 0 ? Math.round(w) : null;
}

/** hex 두 색 선형 보간(sRGB). t = a의 비율(0~1) — App.css의 color-mix(in srgb, a t%, b)와 같은 의미.
 *  mermaid는 khroma로 색을 파생하므로 **구체적 색 문자열만** 받는다(color-mix()/var() 전달 불가). */
function mix(a: string, b: string, t: number): string {
  const rgb = (h: string): number[] => {
    const s = h.replace("#", "");
    const n = s.length === 3 ? [...s].map((c) => c + c).join("") : s;
    return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  };
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const ch = (x: number, y: number) =>
    Math.round(x * t + y * (1 - t))
      .toString(16)
      .padStart(2, "0");
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`;
}

/** mermaid.initialize 인자 전체. 순수 함수라 DOM 없이 단위 테스트할 수 있다(lib/mermaid.test.ts).
 *
 *  앱 테마 5토큰 → mermaid 테마 설정. themeVariables를 존중하는 mermaid 테마는 "base" 뿐이다.
 *  기본 팔레트(흰 배경·노란 노트)는 dark/paper에서 문서와 심하게 튄다.
 *  회귀 시 되돌림: theme/themeVariables를 `theme: t.type === "dark" ? "dark" : "default"`로 교체. */
export function diagramConfig(themeId: string) {
  const t = themes[themeId] ?? themes[defaultThemeId];
  const bg = t.tokens["--bg"];
  const fg = t.tokens["--fg"];
  const accent = t.tokens["--accent"];
  return {
    startOnLoad: false,
    securityLevel: "strict" as const,
    // 측정 스테이지 div에도 박히는 값(mermaid가 divStyle로 씀) — themeVariables 쪽과 짝을 맞춘다.
    fontFamily: DIAGRAM_FONT,

    // ── 라벨을 SVG <text>로 (v0.6.9) ─────────────────────────────────────────────
    // **최상위 키가 진짜다.** mermaid 11.16.0의 labelHelper(모든 노드 셰이프 공용)는
    // `evaluate(getConfig()?.htmlLabels)` 로 **최상위만** 읽는다(chunk-ZGVPDNZ5.mjs:43).
    // 기본 설정에 최상위 htmlLabels가 없어 `evaluate(undefined)`는 true → 노드 라벨이
    // <foreignObject> HTML로 나가고, 그 폭이 앱 문서에서 잰 값으로 얼어붙은 뒤 미리보기 문서에서
    // 다시 배치돼 overflow:hidden에 잘렸다(v0.6.8).
    htmlLabels: false,
    // 아래 flowchart 키는 **중복이 아니다.** 지우지 말 것:
    //  · getEffectiveHtmlLabels(chunk-WYO6CB5R.mjs:4963)는 `htmlLabels ?? flowchart.htmlLabels ?? true`
    //    인데 flowchart.htmlLabels 기본값이 null이라, 이 줄이 없으면 간선 라벨·서브그래프 제목이 HTML이 된다.
    //  · swimlane 클러스터(:329)와 triangle 셰이프(:4136)는 flowchart.htmlLabels를 **직접** 읽는다.
    flowchart: { htmlLabels: false },

    theme: "base" as const,
    themeVariables: {
      darkMode: t.type === "dark",
      background: bg,
      primaryColor: t.tokens["--surface"], // 노드 채움 = 테마가 정한 "배경보다 살짝 뜨는 면"
      primaryTextColor: fg,
      primaryBorderColor: mix(fg, bg, 0.35),
      secondaryColor: mix(accent, bg, 0.12),
      tertiaryColor: mix(fg, bg, 0.04), // 클러스터/섹션 — 노드보다 더 옅게
      // 아래 두 개를 비우면 invert(secondary/tertiary)로 파생돼 중간 회색이 나오고,
      // 클러스터 제목(titleColor ← tertiaryTextColor)이 배경에 묻힌다.
      secondaryTextColor: fg,
      tertiaryTextColor: fg,
      lineColor: mix(fg, bg, 0.55),
      textColor: fg,
      noteBkgColor: mix(accent, bg, 0.14), // 기본값 #fff5ad(노랑)은 3테마 모두에서 튄다
      noteTextColor: fg,
      fontFamily: DIAGRAM_FONT,
      fontSize: `${DIAGRAM_FONT_PX}px`,
    },
  };
}

/** base64(UTF-8) → mermaid 소스. lib/markdown.ts encodeMermaidSrc 와 짝. */
export function decodeMermaidSrc(b64: string): string {
  if (!b64) return "";
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/** HTML 내 `pre.mermaid[data-src]` placeholder를 렌더된 SVG로 치환. mermaid 블록이 없으면 원본 반환. */
export async function renderMermaid(html: string, themeId: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(doc.querySelectorAll("pre.mermaid[data-src]"));
  if (nodes.length === 0) return html;

  const mermaid = (await loadMermaid()).default;
  // 다이어그램이 통째로 안 나오던 과거 두 원인은 아래에서 해결됨(회귀 시 함께 볼 것):
  //  1) 소스의 `-->` 등 때문에 data-src가 DOMPurify(mXSS 방지)에 지워지던 문제
  //     → markdown.ts에서 base64로 실어 해결.
  //  2) foreignObject 라벨 글자가 비던 것 → sanitize.ts에서 foreignobject를 HTML 통합지점으로 등록.
  mermaid.initialize(diagramConfig(themeId));

  for (const node of nodes) {
    const src = decodeMermaidSrc(node.getAttribute("data-src") ?? "");
    try {
      // 3번째 인자 = 렌더·측정 컨테이너. 안 넘기면 mermaid가 document.body에 임시 div를 붙여
      // **앱 문서 CSS 문맥**으로 측정하는데, 표시는 미리보기 문서라 라벨 상자가 어긋난다.
      const { svg } = await mermaid.render(`mmd-${seq++}`, src, measureStage());
      const wrap = doc.createElement("div");
      wrap.className = "mermaid-rendered";
      wrap.innerHTML = sanitizeSvg(svg);
      // 원본 너비 모드(.diagram-natural)가 쓸 실제 폭. viewBox 뿐인 인라인 SVG는 CSS만으로 원본
      // 크기를 낼 수 없어(width:auto·max-content 모두 100%로 되돌아감) 여기서 명시적 px를 넘긴다.
      const vb = viewBoxWidth(wrap.querySelector("svg"));
      if (vb) wrap.style.setProperty("--diagram-w", `${vb}px`);
      node.replaceWith(wrap);
    } catch (e) {
      // 실제 오류를 표면화 — 문법 오류·청크 로드 실패를 사용자와 개발자 모두 볼 수 있게.
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[mermaid] 렌더 실패:", src.slice(0, 120), e);
      const err = doc.createElement("pre");
      err.className = "mermaid-error";
      err.textContent = `mermaid 렌더 오류: ${msg}`;
      node.replaceWith(err);
    }
  }
  if (stage) stage.innerHTML = ""; // 렌더 실패로 남을 수 있는 잔여 서브트리 정리(스테이지는 재사용)
  return doc.body.innerHTML;
}
