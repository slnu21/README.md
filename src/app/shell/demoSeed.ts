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
  s.openFile("C:/docs/README.md", SAMPLE);
}
