// Mermaid 다이어그램: sandbox iframe 내부에선 스크립트 실행 불가 → 메인 스레드에서 SVG로 렌더 후 주입.
// 무거운 라이브러리는 최초 mermaid 블록이 있을 때만 동적 import(코드 스플리팅) → 초기 번들 제외.
// 렌더된 SVG는 sanitizeSvg 로 정화하며, srcdoc 은 정적 SVG만 담으므로 sandbox 격리가 유지된다.
import { sanitizeSvg } from "./sanitize";
import { DIAGRAM_CTX_CSS } from "./renderDoc";
import { themes, defaultThemeId } from "../themes";

let mermaidMod: Promise<typeof import("mermaid")> | null = null;
const loadMermaid = () => (mermaidMod ??= import("mermaid"));

let seq = 0;

/** 다이어그램 전용 글꼴. mermaid 기본 스택("trebuchet ms",verdana,arial,sans-serif)에는 **한글
 *  글리프가 없어** 한글이 전부 문서별 폴백으로 해결됐다 → 측정 문서와 표시 문서가 서로 다른 face를
 *  고를 수 있어 라벨 폭이 어긋났다. 한글 face를 명시해 양쪽을 못박는다.
 *  본문 읽기 글꼴을 따라가지 않는 이유: 번들 웹폰트는 로드 대기·font-display:swap 타이밍에 따라
 *  측정 후 글꼴이 바뀔 수 있고, 그러면 지오메트리가 다시 어긋난다(v0.6.6 편집기 버그와 같은 함정). */
const DIAGRAM_FONT = `"Trebuchet MS","Malgun Gothic",Verdana,Arial,sans-serif`;

/** mermaid가 렌더·측정에 쓸 화면 밖 컨테이너(재사용 1개).
 *  mermaid.render(id, src, svgContainingElement)에 넘기면 document.body 대신 여기에 렌더하므로
 *  ① 미리보기와 동일한 상속 문맥(DIAGRAM_CTX_CSS)에서 측정되고 ② 앱 본문에 임시 SVG가 튀지 않는다. */
let stage: HTMLDivElement | null = null;
function measureStage(): HTMLDivElement {
  if (stage?.isConnected) return stage;
  stage = document.createElement("div");
  // display:none 은 금물 — 레이아웃이 죽어 getBBox/getComputedTextLength가 0을 돌려준다.
  stage.setAttribute(
    "style",
    `position:fixed;left:-99999px;top:0;width:1200px;pointer-events:none;${DIAGRAM_CTX_CSS}`,
  );
  stage.lang = document.documentElement.lang || "ko"; // 한글 폴백 face를 미리보기와 일치시킨다
  document.body.appendChild(stage);
  return stage;
}

/** SVG viewBox("minX minY W H")의 W. 못 읽으면 null → CSS가 width:auto 폴백(=맞춤과 동일 동작). */
function viewBoxWidth(svg: Element | null): number | null {
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

/** 앱 테마 5토큰 → mermaid 테마 설정. themeVariables를 존중하는 mermaid 테마는 "base" 뿐이다.
 *  기본 팔레트(흰 배경·노란 노트)는 dark/paper에서 문서와 심하게 튄다.
 *  회귀 시 되돌림: 이 호출을 `theme: t.type === "dark" ? "dark" : "default"` 한 줄로 교체. */
function diagramTheme(themeId: string) {
  const t = themes[themeId] ?? themes[defaultThemeId];
  const bg = t.tokens["--bg"];
  const fg = t.tokens["--fg"];
  const accent = t.tokens["--accent"];
  return {
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
      fontSize: "16px",
    },
  };
}

/** base64(UTF-8) → mermaid 소스. lib/markdown.ts encodeMermaidSrc 와 짝. */
function decodeMermaidSrc(b64: string): string {
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
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    // 측정 스테이지 div에도 박히는 값(mermaid가 divStyle로 씀) — themeVariables 쪽과 짝을 맞춘다.
    fontFamily: DIAGRAM_FONT,
    ...diagramTheme(themeId),
    // 다이어그램이 안 나오던 두 근본 원인은 아래에서 해결됨:
    //  1) flowchart/sequence/class/state/quadrant가 통째로 안 나오던 것 → 소스의 `-->` 등 때문에
    //     data-src가 DOMPurify(mXSS 방지)에 지워지던 문제 → markdown.ts에서 base64로 실어 해결.
    //  2) foreignObject 라벨 글자가 비던 것 → sanitize.ts에서 foreignobject를 HTML 통합지점으로 등록해 해결.
    // htmlLabels:false는 이전 설정 유지(라벨은 이제 SVG text·foreignObject 어느 쪽이든 정상 렌더).
    flowchart: { htmlLabels: false },
  });

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
