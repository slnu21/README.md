// Editor: CodeMirror 6 설정(마크다운 문법 하이라이트 + 테마 토큰 연동).
// React 마운트/생명주기는 shell/Editor.tsx. 색은 CSS 변수 var(--*) 사용 → 3테마 자동 대응.
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// 마크다운 문법 하이라이트 — 색은 테마 토큰(var) 사용.
const mdHighlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--accent)", fontWeight: "600" },
  { tag: t.strong, color: "var(--fg)", fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: t.url, color: "var(--muted)" },
  { tag: t.monospace, color: "var(--tok-code)" },
  { tag: t.quote, color: "var(--muted)", fontStyle: "italic" },
  { tag: [t.list, t.processingInstruction], color: "var(--muted)" },
  { tag: t.contentSeparator, color: "var(--muted)" },
]);

// 에디터 UI 테마 — 색/폰트는 var()로 3테마 자동 대응.
const cmTheme = EditorView.theme({
  "&": { color: "var(--fg)", backgroundColor: "var(--bg)", height: "100%" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--mono-font)",
    fontSize: "13px",
    lineHeight: "1.62",
    overflow: "auto",
  },
  ".cm-content": { padding: "12px 0", caretColor: "var(--accent)" },
  ".cm-gutters": { backgroundColor: "var(--bg)", color: "var(--faint)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 14px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 6%, var(--bg))" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--accent)" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 20%, var(--bg))",
  },
});

/** 마크다운 에디터 확장 세트. 문서 변경 시 onChange(doc) 호출. */
export function editorExtensions(onChange: (doc: string) => void): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown(),
    syntaxHighlighting(mdHighlight),
    cmTheme,
    EditorView.lineWrapping,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onChange(u.state.doc.toString());
    }),
  ];
}
