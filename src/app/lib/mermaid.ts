// Mermaid 다이어그램: sandbox iframe 내부에선 스크립트 실행 불가 → 메인 스레드에서 SVG로 렌더 후 주입.
// 무거운 라이브러리는 최초 mermaid 블록이 있을 때만 동적 import(코드 스플리팅) → 초기 번들 제외.
// 렌더된 SVG는 sanitizeSvg 로 정화하며, srcdoc 은 정적 SVG만 담으므로 sandbox 격리가 유지된다.
import { sanitizeSvg } from "./sanitize";
import { themes } from "../themes";

let mermaidMod: Promise<typeof import("mermaid")> | null = null;
const loadMermaid = () => (mermaidMod ??= import("mermaid"));

let seq = 0;

/** HTML 내 `pre.mermaid[data-src]` placeholder를 렌더된 SVG로 치환. mermaid 블록이 없으면 원본 반환. */
export async function renderMermaid(html: string, themeId: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(doc.querySelectorAll("pre.mermaid[data-src]"));
  if (nodes.length === 0) return html;

  const mermaid = (await loadMermaid()).default;
  const dark = themes[themeId]?.type === "dark";
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
    // 라벨을 <foreignObject> 안 HTML이 아니라 SVG <text>로 렌더 → SVG 정화(sanitizeSvg)를 통과해
    // flowchart 노드 글자가 사라지지 않는다(<br/>은 mermaid가 줄바꿈 tspan으로 처리).
    flowchart: { htmlLabels: false },
  });

  for (const node of nodes) {
    const src = node.getAttribute("data-src") ?? "";
    try {
      const { svg } = await mermaid.render(`mmd-${seq++}`, src);
      const wrap = doc.createElement("div");
      wrap.className = "mermaid-rendered";
      wrap.innerHTML = sanitizeSvg(svg);
      node.replaceWith(wrap);
    } catch {
      const err = doc.createElement("pre");
      err.className = "mermaid-error";
      err.textContent = "mermaid render error";
      node.replaceWith(err);
    }
  }
  return doc.body.innerHTML;
}
