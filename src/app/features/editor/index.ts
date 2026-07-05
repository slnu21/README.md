// Editor: CodeMirror 6 설정(마크다운 문법 하이라이트 + 테마 토큰 연동).
// React 마운트/생명주기는 shell/Editor.tsx. 색은 CSS 변수 var(--*) 사용 → 3테마 자동 대응.
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle, indentOnInput } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { toggleWrap, insertLink, continueList, smartPaste, selStateOf, type SelState } from "./commands";

export { selStateOf } from "./commands";
export type { SelState } from "./commands";

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
    // 폰트 패밀리·크기는 :root CSS 변수로 제어 → 글꼴/줌 변경이 리컨피그 없이 즉시 반영(기능 3·5).
    fontFamily: "var(--mono-font)",
    fontSize: "var(--editor-font-size, 13px)",
    lineHeight: "1.62",
    overflow: "auto",
  },
  ".cm-content": { padding: "12px 0", caretColor: "var(--accent)" },
  ".cm-gutters": { backgroundColor: "var(--bg)", color: "var(--faint)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 14px" },
  // 활성 줄 배경은 알파 합성(transparent와 혼합) → 아래 선택 레이어(z-index:-1)가 비쳐 보인다.
  // (불투명 --bg와 혼합하면 활성 줄에서 선택 영역이 가려지는 버그가 있었음)
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 7%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--accent)" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent)" },
  // 선택 대비 강화 — 활성 줄 틴트 위에서도 또렷하게(포커스 시 더 진하게).
  ".cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 22%, var(--bg))",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 32%, var(--bg))",
  },
  // 찾기/바꾸기 패널(@codemirror/search) — 테마 토큰 연동
  ".cm-panels": { backgroundColor: "var(--surface)", color: "var(--fg)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panel.cm-search": { fontFamily: "var(--ui-font)", fontSize: "12px", padding: "6px 8px" },
  ".cm-panel.cm-search label": { fontSize: "12px" },
  ".cm-textfield": {
    backgroundColor: "var(--bg)",
    color: "var(--fg)",
    border: "1px solid var(--border)",
    borderRadius: "5px",
  },
  ".cm-button": {
    backgroundColor: "var(--surface)",
    color: "var(--fg)",
    border: "1px solid var(--border)",
    borderRadius: "5px",
    backgroundImage: "none",
  },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--accent) 26%, transparent)" },
  ".cm-searchMatch-selected": { backgroundColor: "color-mix(in srgb, var(--accent) 48%, transparent)" },
});

/** 에디터 상단에 보이는 소스 줄(0-based, data-line과 일치) — 미리보기 스크롤 동기화용(기능 8). */
function topVisibleLine(view: EditorView): number {
  const rect = view.scrollDOM.getBoundingClientRect();
  const pos = view.posAtCoords({ x: rect.left + 6, y: rect.top + 6 });
  if (pos == null) return 0;
  return view.state.doc.lineAt(pos).number - 1;
}

// 마크다운 서식 단축키(T1). Mod=Ctrl(Win)/Cmd(mac). Enter=목록 이어쓰기(우선).
// defaultKeymap보다 앞에 둬야 Enter/Mod-* 가 먼저 잡힌다.
const mdKeymap = keymap.of([
  { key: "Mod-b", run: toggleWrap("**"), preventDefault: true },
  { key: "Mod-i", run: toggleWrap("*"), preventDefault: true },
  { key: "Mod-e", run: toggleWrap("`"), preventDefault: true }, // 인라인 코드
  { key: "Mod-k", run: insertLink, preventDefault: true },
  { key: "Enter", run: continueList },
]);

// 괄호/백틱 자동 닫기 — 프로즈 방해를 피해 따옴표는 제외(대명사 축약 등). 마크다운 언어데이터 위에 얹음.
const bracketConfig = Prec.highest(
  EditorState.languageData.of(() => [{ closeBrackets: { brackets: ["(", "[", "{", "`"] } }]),
);

/** 마크다운 에디터 확장 세트. 문서 변경 시 onChange(doc) 호출. onSyncLine=상단 가시줄(스크롤/편집 시).
 *  onSelState=커서/선택 상태(상태바). */
export function editorExtensions(
  onChange: (doc: string) => void,
  onSyncLine?: (line: number) => void,
  onSelState?: (s: SelState) => void,
): Extension[] {
  let raf = 0;
  const emit = (view: EditorView) => {
    if (!onSyncLine) return;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => onSyncLine(topVisibleLine(view)));
  };
  return [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    drawSelection(),
    history(),
    search({ top: true }),
    bracketConfig,
    closeBrackets(),
    indentOnInput(),
    smartPaste,
    // 서식·목록 키를 기본 키맵보다 먼저(Enter 목록 이어쓰기 우선).
    Prec.high(mdKeymap),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    markdown(),
    syntaxHighlighting(mdHighlight),
    cmTheme,
    EditorView.lineWrapping,
    // 스크롤·편집 시 상단 가시줄을 방출(rAF 스로틀) → 미리보기가 따라 스크롤.
    EditorView.domEventHandlers({ scroll: (_e, view) => emit(view) }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        onChange(u.state.doc.toString());
        emit(u.view);
      }
      if (onSelState && (u.docChanged || u.selectionSet)) {
        onSelState(selStateOf(u.view));
      }
    }),
  ];
}
