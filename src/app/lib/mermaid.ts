// Mermaid 다이어그램: sandbox iframe 내부에선 스크립트 실행 불가 → 메인 스레드에서 SVG로 렌더 후 주입.
// 무거운 라이브러리는 최초 mermaid 블록이 있을 때만 동적 import(코드 스플리팅) → 초기 번들 제외.
// 렌더된 SVG는 sanitizeSvg 로 정화하며, srcdoc 은 정적 SVG만 담으므로 sandbox 격리가 유지된다.
import { sanitizeSvg } from "./sanitize";
import { themes } from "../themes";

let mermaidMod: Promise<typeof import("mermaid")> | null = null;
const loadMermaid = () => (mermaidMod ??= import("mermaid"));

let seq = 0;

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
  const dark = themes[themeId]?.type === "dark";
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
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
      const { svg } = await mermaid.render(`mmd-${seq++}`, src);
      const wrap = doc.createElement("div");
      wrap.className = "mermaid-rendered";
      wrap.innerHTML = sanitizeSvg(svg);
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
  return doc.body.innerHTML;
}
