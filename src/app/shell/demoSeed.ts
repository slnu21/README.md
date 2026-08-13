// 스크린샷·데모용 시드. URL에 ?demo=1 이 있을 때만 store를 샘플 콘텐츠로 채운다.
// 실제 앱(Tauri) 로드에는 이 파라미터가 없으므로 동작하지 않는다(무해).
// 파라미터: ?demo=1&theme=light|dark|paper&lang=ko|en
import { useAppStore } from "../store";
import type { DirEntryNode } from "../lib/tauri";

const SAMPLE = [
  "# README.md",
  "",
  "**README.md** — a lightweight, **100% offline** Markdown reader & editor.",
  "",
  "## Features",
  "- [x] Live split preview",
  "- [x] Code highlighting, math & diagrams",
  "- [ ] Export to HTML / PDF",
  "",
  "Inline `code`, ==highlight==, H~2~O, x^2^, and math $E = mc^2$.",
  "",
  "## Code",
  "```ts",
  "export function render(src: string): string {",
  "  return md.render(src); // syntax highlighted",
  "}",
  "```",
  "",
  "## Math",
  "$$",
  "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}",
  "$$",
  "",
  "::: tip",
  "Write on the left, read on the right — instantly.",
  ":::",
  "",
  "| Theme | Mood    |",
  "| ----- | ------- |",
  "| Light | crisp   |",
  "| Dark  | focused |",
  "",
  "Needs a footnote[^1].",
  "",
  "[^1]: Footnotes render at the bottom.",
].join("\n");

// 두 번째 문서 — 리딩 분할(나란히 보기)을 데모·레이아웃 프로브에서 확인하려면 탭이 둘 필요하다.
const SAMPLE2 = [
  "# Guide",
  "",
  "## 나란히 보기",
  "리딩 모드에서 탭을 우클릭해 **옆에 나란히 열기**를 고르면 두 문서를 좌우로 놓고 읽습니다.",
  "",
  "## Side by side",
  "In reading mode, right-click a tab and choose **Open beside** to read two documents at once.",
  "",
  "> 가운데 손잡이를 끌어 폭을 조절하고, 더블클릭하면 반반으로 돌아갑니다.",
].join("\n");

const TREE: DirEntryNode = {
  name: "docs",
  path: "C:/docs",
  isDir: true,
  children: [
    { name: "README.md", path: "C:/docs/README.md", isDir: false, children: [] },
    { name: "guide.md", path: "C:/docs/guide.md", isDir: false, children: [] },
    {
      name: "notes",
      path: "C:/docs/notes",
      isDir: true,
      children: [{ name: "ideas.md", path: "C:/docs/notes/ideas.md", isDir: false, children: [] }],
    },
  ],
};

export function applyDemoFromUrl(): void {
  const q = new URLSearchParams(window.location.search);
  if (!q.has("demo")) return;
  const s = useAppStore.getState();
  const theme = q.get("theme");
  if (theme) s.setTheme(theme);
  const lang = q.get("lang");
  if (lang) s.setLanguage(lang);
  s.addFolder(TREE);
  // guide 를 먼저 열고 README 를 나중에 열어 README 가 활성이 되게 한다(openFile 이 활성을 가져간다).
  s.openFile("C:/docs/guide.md", SAMPLE2);
  s.openFile("C:/docs/README.md", SAMPLE);
}
