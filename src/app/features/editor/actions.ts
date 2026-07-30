// 편집 액션 레지스트리 — 키맵·명령 팔레트·우클릭 메뉴·단축키 도움말의 **단일 진실원**.
//
// 왜 레지스트리인가: 같은 기능이 네 곳(키맵·팔레트·우클릭·도움말)에 따로 적혀 있으면 한 곳만 고쳐도
// 나머지가 낡는다. 특히 도움말이 낡으면 "없는 키를 안내"해 없는 것보다 해롭다. 여기 한 배열만 늘리면
// 네 곳에 동시 반영된다.
//
// 두 종류를 구분해 담는다:
//   · editorActions      = 우리가 바인딩하는 커맨드(키맵 생성 + 선택적으로 팔레트/우클릭 노출)
//   · inheritedShortcuts = 상류 CodeMirror·앱 전역이 제공해 **우리가 바인딩하지 않는** 키(도움말 표기 전용)
// inheritedShortcuts는 실제 동작을 소스에서 대조해 넣는다(근거는 각 항목 주석) — 추측 금지.
import type { Command } from "@codemirror/view";
import { toggleWrap, insertLink, continueList } from "./commands";

/** 도움말 그룹. 표시 순서 = 이 배열 순서. */
export const actionGroups = ["format", "editing", "lines", "find", "app"] as const;
export type ActionGroup = (typeof actionGroups)[number];

export interface EditorAction {
  id: string;
  /** i18n 키(`ed.*`). */
  labelKey: string;
  /** CodeMirror 키 스펙("Mod-b"). 없으면 팔레트/메뉴 전용 액션. */
  key?: string;
  run: Command;
  group: ActionGroup;
  /** 명령 팔레트(Ctrl+Shift+P)에 노출. */
  inPalette?: boolean;
  /** 편집기 우클릭 메뉴에 노출. */
  inContextMenu?: boolean;
}

/** 우리가 바인딩하는 편집 액션. T2~T5에서 여기에 추가하면 네 소비처에 자동 반영된다. */
export const editorActions: EditorAction[] = [
  {
    id: "fmt.bold",
    labelKey: "ed.bold",
    key: "Mod-b",
    run: toggleWrap("**"),
    group: "format",
    inPalette: true,
    inContextMenu: true,
  },
  {
    id: "fmt.italic",
    labelKey: "ed.italic",
    key: "Mod-i",
    run: toggleWrap("*"),
    group: "format",
    inPalette: true,
    inContextMenu: true,
  },
  {
    id: "fmt.code",
    labelKey: "ed.code",
    key: "Mod-e",
    run: toggleWrap("`"),
    group: "format",
    inPalette: true,
    inContextMenu: true,
  },
  {
    id: "fmt.link",
    labelKey: "ed.link",
    key: "Mod-k",
    run: insertLink,
    group: "format",
    inPalette: true,
    inContextMenu: true,
  },
  // 목록 이어쓰기는 메뉴로 부를 성질이 아니라 키 전용(도움말엔 표기된다).
  // 목록이 아니면 false를 반환해 상류 insertNewlineContinueMarkup(인용문·중첩목록)으로 넘어간다.
  { id: "edit.continueList", labelKey: "ed.continueList", key: "Enter", run: continueList, group: "editing" },
];

export interface InheritedShortcut {
  labelKey: string;
  key: string;
  group: ActionGroup;
}

/** 상류·전역이 제공하는 키(우리가 바인딩하지 않음). 저장소 어디에도 안 적혀 있던 것들 —
 *  근거: @codemirror/{commands,search,autocomplete,lang-markdown} dist 및 shell/AppShell.tsx.
 *  ⚠ 여기 적은 키는 반드시 실제로 동작해야 한다. 상류 버전을 올릴 때 함께 대조할 것. */
export const inheritedShortcuts: InheritedShortcut[] = [
  // lang-markdown markdownKeymap (markdown()이 addKeymap 기본값 true로 자동 추가)
  { labelKey: "ed.continueQuote", key: "Enter", group: "editing" },
  { labelKey: "ed.deleteMarkup", key: "Backspace", group: "editing" },
  // @codemirror/commands defaultKeymap — 마크다운 언어에 commentTokens(<!-- -->)가 있어 동작
  { labelKey: "ed.htmlComment", key: "Mod-/", group: "editing" },
  { labelKey: "ed.blankLine", key: "Mod-Enter", group: "editing" },
  { labelKey: "ed.moveLine", key: "Alt-ArrowUp / Alt-ArrowDown", group: "lines" },
  { labelKey: "ed.copyLine", key: "Shift-Alt-ArrowUp / Shift-Alt-ArrowDown", group: "lines" },
  { labelKey: "ed.deleteLine", key: "Mod-Shift-k", group: "lines" },
  { labelKey: "ed.indent", key: "Mod-] / Mod-[", group: "lines" },
  { labelKey: "ed.selectLine", key: "Alt-l", group: "lines" },
  { labelKey: "ed.multiCursor", key: "Mod-Alt-ArrowUp / Mod-Alt-ArrowDown", group: "lines" },
  { labelKey: "ed.matchBracket", key: "Mod-Shift-\\", group: "lines" },
  { labelKey: "ed.simplify", key: "Escape", group: "lines" },
  // @codemirror/search searchKeymap
  { labelKey: "ed.find", key: "Mod-f", group: "find" },
  { labelKey: "ed.findNext", key: "F3 / Mod-g", group: "find" },
  { labelKey: "ed.findPrev", key: "Shift-F3 / Mod-Shift-g", group: "find" },
  { labelKey: "ed.nextOccurrence", key: "Mod-d", group: "find" },
  { labelKey: "ed.allOccurrences", key: "Mod-Shift-l", group: "find" },
  { labelKey: "ed.gotoLine", key: "Mod-Alt-g", group: "find" },
  { labelKey: "ed.docBounds", key: "Mod-Home / Mod-End", group: "find" },
  // @codemirror/commands historyKeymap
  { labelKey: "ed.undo", key: "Mod-z", group: "editing" },
  { labelKey: "ed.redo", key: "Mod-y", group: "editing" },
  // 앱 전역 — shell/AppShell.tsx
  { labelKey: "ed.quickOpen", key: "Mod-p", group: "app" },
  { labelKey: "ed.palette", key: "Mod-Shift-p", group: "app" },
  { labelKey: "ed.globalFind", key: "Mod-Shift-h", group: "app" },
  { labelKey: "ed.save", key: "Mod-s", group: "app" },
  { labelKey: "ed.zoom", key: "Mod-= / Mod-- / Mod-0", group: "app" },
  // @codemirror/commands — Tab이 포커스를 옮기는 접근성 기본값의 탈출구
  { labelKey: "ed.tabFocus", key: "Ctrl-m", group: "app" },
];

/** CodeMirror 키 스펙 → 표시용 문자열. "Mod-Shift-k"·"Shift-Mod-k" → 둘 다 "Ctrl+Shift+K".
 *
 *  CodeMirror의 normalizeKeyName은 수식어 순서를 무시하므로(상류는 "Shift-Mod-k", 우리는
 *  "Mod-Shift-k"로 적어도 같은 키다) 표시도 순서에 의존하지 않게 **Ctrl→Shift→Alt로 정렬**한다.
 *  Mod은 Windows에서 Ctrl(이 앱은 Windows 전용 배포). " / "로 나열된 대안 키는 각각 변환한다. */
export function keyHint(spec: string): string {
  const ARROWS: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
  };
  const MOD_ORDER = ["Ctrl", "Shift", "Alt"];
  return spec
    .split(" / ")
    .map((alt) => {
      // 마지막 조각이 실제 키, 앞은 전부 수식어. "-"로 끝나는 키(Mod--)를 위해 뒤에서 자른다.
      const parts = alt.split(/-(?!$)/);
      const base = parts.pop() ?? "";
      const mods = parts.map((m) => (m === "Mod" ? "Ctrl" : m));
      mods.sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
      const key = ARROWS[base] ?? (base.length === 1 ? base.toUpperCase() : base);
      return [...mods, key].join("+");
    })
    .join(" / ");
}
