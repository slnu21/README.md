// 마크다운 표 도구 — 삽입 · 셀 이동(Tab) · 파이프 정렬 · 행/열 조작 · TSV 붙여넣기 변환.
// 전부 CodeMirror Command 규약(순수 편집 로직). 표를 못 찾으면 false를 반환해 다른 키에 양보한다
// (Tab이 표 밖에서는 들여쓰기로 넘어가는 것이 이 규약에 달려 있다).
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView, type Command } from "@codemirror/view";

export type Align = "none" | "left" | "center" | "right";

/** 모노스페이스 표시 폭. CJK는 두 칸을 차지하므로 글자 수로 세면 한글 표의 파이프가 어긋난다. */
function charWidth(cp: number): number {
  return (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
    ? 2
    : 1;
}
export function strWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch.codePointAt(0)!);
  return w;
}
/** 셀 내용을 열 정렬에 맞춰 채운다 — 소스 표가 렌더 결과와 같은 방향으로 보이게. */
function pad(s: string, w: number, a: Align = "none"): string {
  const gap = Math.max(0, w - strWidth(s));
  if (a === "right") return " ".repeat(gap) + s;
  if (a === "center") {
    const l = Math.floor(gap / 2);
    return " ".repeat(l) + s + " ".repeat(gap - l);
  }
  return s + " ".repeat(gap);
}

/** 이스케이프되지 않은 `|` 로 셀 분리. 바깥 파이프는 선택 사항(GFM). */
export function splitRow(text: string): string[] {
  const t = text.trim().replace(/^\|/, "").replace(/\|\s*$/, "");
  return t.split(/(?<!\\)\|/).map((c) => c.trim());
}

/** 구분행인가(`|---|:--:|`). 표의 정체를 결정하는 줄. */
export function isDelimiter(text: string): boolean {
  const t = text.trim();
  if (!t.includes("-") || !t.includes("|")) return false;
  return splitRow(t).every((c) => /^:?-+:?$/.test(c));
}

function alignOf(cell: string): Align {
  const l = cell.startsWith(":");
  const r = cell.endsWith(":");
  return l && r ? "center" : l ? "left" : r ? "right" : "none";
}

export interface TableInfo {
  startLine: number; // 헤더 줄(1-based)
  endLine: number; // 마지막 본문 줄
  from: number;
  to: number; // 문서 오프셋
  rows: string[][]; // 헤더 + 본문(구분행 제외)
  aligns: Align[];
}

/** 커서가 놓인 표를 찾는다. 표가 아니면 null → 호출자는 false를 반환해 다른 키에 양보한다. */
export function findTable(state: EditorState, pos: number): TableInfo | null {
  const cur = state.doc.lineAt(pos);
  const hasPipe = (n: number) => n >= 1 && n <= state.doc.lines && state.doc.line(n).text.includes("|");
  if (!hasPipe(cur.number)) return null;
  // 위로 올라가며 표 시작을 찾는다.
  let start = cur.number;
  while (start > 1 && hasPipe(start - 1)) start--;
  // 두 번째 줄이 구분행이어야 표다.
  if (start + 1 > state.doc.lines || !isDelimiter(state.doc.line(start + 1).text)) return null;
  let end = start + 1;
  while (end < state.doc.lines && hasPipe(end + 1) && !isDelimiter(state.doc.line(end + 1).text)) end++;
  if (cur.number < start || cur.number > end) return null;

  const aligns = splitRow(state.doc.line(start + 1).text).map(alignOf);
  const rows: string[][] = [];
  for (let n = start; n <= end; n++) {
    if (n === start + 1) continue; // 구분행 제외
    rows.push(splitRow(state.doc.line(n).text));
  }
  return {
    startLine: start,
    endLine: end,
    from: state.doc.line(start).from,
    to: state.doc.line(end).to,
    rows,
    aligns,
  };
}

/** 표를 파이프가 맞춰진 텍스트로 렌더. 열 수는 가장 긴 행에 맞춰 채운다. */
export function renderTable(rows: string[][], aligns: Align[]): string {
  const cols = Math.max(...rows.map((r) => r.length), aligns.length, 1);
  const grid = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
  const al = Array.from({ length: cols }, (_, i) => aligns[i] ?? "none");
  // 폭 하한 3 — 구분행이 최소 `---`/`:--`/`--:`/`:-:` 는 되어야 한다(모두 3칸).
  // 정렬별로 하한을 달리하면(예: 가운데는 5칸) 내용이 짧은 열의 폭이 정렬에 따라 들쭉날쭉해진다.
  const widths = al.map((_, i) => Math.max(3, ...grid.map((r) => strWidth(r[i]))));
  const line = (cells: string[]) =>
    "| " + cells.map((c, i) => pad(c, widths[i], al[i])).join(" | ") + " |";
  const delim = al.map((a, i) => {
    const w = widths[i];
    if (a === "center") return ":" + "-".repeat(w - 2) + ":";
    if (a === "left") return ":" + "-".repeat(w - 1);
    if (a === "right") return "-".repeat(w - 1) + ":";
    return "-".repeat(w);
  });
  return [line(grid[0]), "| " + delim.join(" | ") + " |", ...grid.slice(1).map(line)].join("\n");
}

/** 표를 다시 렌더하고, (row, col) 셀 내용 시작으로 커서를 옮긴다. */
function applyTable(view: EditorView, t: TableInfo, rows: string[][], aligns: Align[], row: number, col: number): boolean {
  if (!rows.length) return false;
  const text = renderTable(rows, aligns);
  view.dispatch({ changes: { from: t.from, to: t.to, insert: text }, userEvent: "input.table" });
  // 렌더 결과에서 목표 셀 위치를 다시 찾는다(폭이 바뀌어 오프셋을 미리 계산할 수 없다).
  const lines = text.split("\n");
  const li = row === 0 ? 0 : row + 1; // 구분행 건너뛰기
  if (li >= lines.length) return true;
  const target = lines[li];
  let idx = 0;
  let seen = -1;
  for (let i = 0; i < target.length; i++) {
    if (target[i] === "|" && (i === 0 || target[i - 1] !== "\\")) {
      seen++;
      if (seen === col) {
        idx = i + 2; // "| " 뒤 = 셀 내용 시작
        break;
      }
    }
  }
  const lineStart = t.from + lines.slice(0, li).reduce((n, l) => n + l.length + 1, 0);
  view.dispatch({ selection: EditorSelection.cursor(Math.min(lineStart + idx, view.state.doc.length)) });
  return true;
}

/** 커서가 있는 셀의 (행, 열). 행은 구분행을 제외한 인덱스(헤더=0). */
function cellAt(state: EditorState, t: TableInfo, pos: number): { row: number; col: number } {
  const line = state.doc.lineAt(pos);
  const row = line.number === t.startLine ? 0 : line.number - t.startLine - 1;
  const before = state.sliceDoc(line.from, pos);
  let col = -1;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === "|" && (i === 0 || before[i - 1] !== "\\")) col++;
  }
  return { row: Math.max(0, row), col: Math.max(0, col) };
}

/** 표 정렬(파이프 맞추기). */
export const formatTable: Command = (view) => {
  const t = findTable(view.state, view.state.selection.main.head);
  if (!t) return false;
  const { row, col } = cellAt(view.state, t, view.state.selection.main.head);
  return applyTable(view, t, t.rows, t.aligns, row, col);
};

/** 다음 셀로. 마지막 셀에서 누르면 행을 추가한다(표 작성의 기본 흐름). */
export const nextTableCell: Command = (view) => {
  const pos = view.state.selection.main.head;
  const t = findTable(view.state, pos);
  if (!t) return false;
  const { row, col } = cellAt(view.state, t, pos);
  const cols = Math.max(...t.rows.map((r) => r.length), t.aligns.length);
  const rows = t.rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
  let nr = row,
    nc = col + 1;
  if (nc >= cols) {
    nr++;
    nc = 0;
    if (nr >= rows.length) rows.push(Array.from({ length: cols }, () => "")); // 마지막 → 새 행
  }
  return applyTable(view, t, rows, t.aligns, nr, nc);
};

/** 이전 셀로. 첫 셀이면 표를 정렬만 하고 머문다. */
export const prevTableCell: Command = (view) => {
  const pos = view.state.selection.main.head;
  const t = findTable(view.state, pos);
  if (!t) return false;
  const { row, col } = cellAt(view.state, t, pos);
  const cols = Math.max(...t.rows.map((r) => r.length), t.aligns.length);
  let nr = row,
    nc = col - 1;
  if (nc < 0) {
    nr = Math.max(0, row - 1);
    nc = row === 0 ? 0 : cols - 1;
  }
  return applyTable(view, t, t.rows, t.aligns, nr, nc);
};

/** 3×3 표 삽입. 커서는 첫 헤더 셀. */
export const insertTable: Command = (view) => {
  const state = view.state;
  const line = state.doc.lineAt(state.selection.main.head);
  const rows = [
    ["열 1", "열 2", "열 3"],
    ["", "", ""],
    ["", "", ""],
  ];
  const body = renderTable(rows, ["none", "none", "none"]);
  const prefix = line.text.trim() ? "\n\n" : "";
  const insert = prefix + body + "\n";
  view.dispatch({
    changes: { from: line.to, insert },
    selection: EditorSelection.cursor(line.to + prefix.length + 2), // 첫 셀 내용 시작
    scrollIntoView: true,
    userEvent: "input.table",
  });
  return true;
};

/** 행/열 조작 — 커서 위치 기준. */
function editTable(fn: (g: { rows: string[][]; aligns: Align[]; row: number; col: number; cols: number }) => {
  rows: string[][];
  aligns: Align[];
  row: number;
  col: number;
} | null): Command {
  return (view) => {
    const pos = view.state.selection.main.head;
    const t = findTable(view.state, pos);
    if (!t) return false;
    const { row, col } = cellAt(view.state, t, pos);
    const cols = Math.max(...t.rows.map((r) => r.length), t.aligns.length);
    const rows = t.rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
    const aligns = Array.from({ length: cols }, (_, i) => t.aligns[i] ?? ("none" as Align));
    const next = fn({ rows, aligns, row, col, cols });
    if (!next) return false;
    return applyTable(view, t, next.rows, next.aligns, next.row, next.col);
  };
}

export const addRowBelow = editTable(({ rows, aligns, row, col, cols }) => {
  rows.splice(Math.max(1, row + 1), 0, Array.from({ length: cols }, () => ""));
  return { rows, aligns, row: Math.max(1, row + 1), col };
});

export const deleteRow = editTable(({ rows, aligns, row, col }) => {
  if (row === 0) return null; // 헤더는 지우지 않는다(표가 깨진다). 본문이 다 비는 건 유효한 표.
  rows.splice(row, 1);
  return { rows, aligns, row: Math.min(row, rows.length - 1), col };
});

export const addColumnRight = editTable(({ rows, aligns, row, col }) => {
  rows.forEach((r) => r.splice(col + 1, 0, ""));
  aligns.splice(col + 1, 0, "none");
  return { rows, aligns, row, col: col + 1 };
});

export const deleteColumn = editTable(({ rows, aligns, row, col, cols }) => {
  if (cols <= 1) return null;
  rows.forEach((r) => r.splice(col, 1));
  aligns.splice(col, 1);
  return { rows, aligns, row, col: Math.max(0, col - 1) };
});

/** 열 정렬 지정(`:---` / `:---:` / `---:`). */
export function setColumnAlign(a: Align): Command {
  return editTable(({ rows, aligns, row, col }) => {
    aligns[col] = a;
    return { rows, aligns, row, col };
  });
}

/** TSV(스프레드시트에서 복사) → 마크다운 표. 첫 행을 헤더로 삼는다. */
export const tablePaste: Extension = EditorView.domEventHandlers({
  paste(event, view) {
    const text = event.clipboardData?.getData("text/plain");
    if (!text || !text.includes("\t")) return false;
    const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
    if (lines.length < 2) return false; // 한 줄짜리는 그냥 텍스트로 둔다
    const rows = lines.map((l) => l.split("\t").map((c) => c.trim().replace(/\|/g, "\\|")));
    const cols = Math.max(...rows.map((r) => r.length));
    if (cols < 2) return false;
    const insert = renderTable(rows, Array.from({ length: cols }, () => "none" as Align));
    const range = view.state.selection.main;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.cursor(range.from + insert.length),
      scrollIntoView: true,
      userEvent: "input.paste",
    });
    event.preventDefault();
    return true;
  },
});
