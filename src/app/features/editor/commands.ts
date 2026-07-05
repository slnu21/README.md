// 에디터 작성 도구(T1) — 마크다운 서식 커맨드·자동 목록 이어쓰기·스마트 붙여넣기·커서 상태.
// 전부 CodeMirror 6 Command((view)=>boolean) 규약. 색/UI 없음(순수 편집 로직).
import { EditorSelection, type Extension } from "@codemirror/state";
import { EditorView, type Command } from "@codemirror/view";

/** 링크/스마트 붙여넣기 URL 판별(http(s)·mailto·www.). */
const URL_RE = /^(?:https?:\/\/|mailto:|www\.)\S+$/i;

/** 선택 텍스트를 마커로 감싸기/풀기 토글. 선택이 없으면 마커만 넣고 커서를 가운데에.
 *  이미 감싸져 있으면(선택 안쪽 또는 바로 바깥) 마커 제거. before/after 미지정 시 대칭. */
export function toggleWrap(before: string, after = before): Command {
  return (view) => {
    const { state } = view;
    const tr = state.changeByRange((range) => {
      const { from, to } = range;
      const inner = state.sliceDoc(from, to);
      // 1) 선택 안쪽이 이미 마커로 시작·끝 → 벗기기
      if (
        inner.length >= before.length + after.length &&
        inner.startsWith(before) &&
        inner.endsWith(after)
      ) {
        const stripped = inner.slice(before.length, inner.length - after.length);
        return {
          changes: { from, to, insert: stripped },
          range: EditorSelection.range(from, from + stripped.length),
        };
      }
      // 2) 선택 바로 바깥이 마커 → 벗기기
      const outerFrom = from - before.length;
      const outerTo = to + after.length;
      if (
        outerFrom >= 0 &&
        outerTo <= state.doc.length &&
        state.sliceDoc(outerFrom, from) === before &&
        state.sliceDoc(to, outerTo) === after
      ) {
        return {
          changes: { from: outerFrom, to: outerTo, insert: inner },
          range: EditorSelection.range(outerFrom, outerFrom + inner.length),
        };
      }
      // 3) 감싸기 — 선택이 있으면 감싼 텍스트를 선택 유지, 없으면 커서를 마커 사이에
      return {
        changes: [
          { from, insert: before },
          { from: to, insert: after },
        ],
        range: EditorSelection.range(from + before.length, to + before.length),
      };
    });
    view.dispatch(tr, { scrollIntoView: true, userEvent: "input" });
    return true;
  };
}

/** 링크 삽입(Ctrl/Cmd+K). 선택이 URL이면 `[](url)`(커서=텍스트), 아니면 `[텍스트](url)`(url 선택). */
export const insertLink: Command = (view) => {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const sel = state.sliceDoc(range.from, range.to);
    if (URL_RE.test(sel.trim())) {
      const insert = `[](${sel})`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + 1), // "[" 뒤 = 텍스트 자리
      };
    }
    const insert = `[${sel}](url)`;
    const urlFrom = range.from + 1 + sel.length + 2; // "[텍스트](" 뒤
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(urlFrom, urlFrom + 3), // "url" 선택
    };
  });
  view.dispatch(tr, { scrollIntoView: true, userEvent: "input" });
  return true;
};

// 목록 마커: 들여쓰기 + (불릿 | 번호+구분) + 공백 + (체크박스). 예: "- ", "  1) ", "- [ ] ".
const LIST_RE = /^(\s*)(?:([-*+])|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/;

/** Enter 시 목록 이어쓰기. 빈 항목이면 마커 제거(목록 종료), 아니면 다음 줄 마커 생성.
 *  선택이 있거나 목록이 아니면 false → 기본 개행에 위임. */
export const continueList: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;
  const line = state.doc.lineAt(range.head);
  const m = LIST_RE.exec(line.text);
  if (!m) return false;
  const [full, indent, bullet, num, delim, space, checkbox] = m;
  // 커서가 마커 영역 안(들여쓰기·마커 앞)이면 기본 개행
  if (range.head < line.from + full.length) return false;
  const rest = line.text.slice(full.length);
  // 빈 항목에서 Enter → 마커 제거하고 들여쓰기만 남김(목록 탈출)
  if (rest.trim() === "") {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: EditorSelection.cursor(line.from + indent.length),
      userEvent: "delete.list",
    });
    return true;
  }
  // 다음 줄 마커: 번호는 +1, 체크박스는 항상 미체크로 새로.
  const nextMarker = bullet
    ? indent + bullet + space + (checkbox ? "[ ] " : "")
    : indent + (parseInt(num, 10) + 1) + delim + space + (checkbox ? "[ ] " : "");
  view.dispatch({
    changes: { from: range.head, insert: "\n" + nextMarker },
    selection: EditorSelection.cursor(range.head + 1 + nextMarker.length),
    scrollIntoView: true,
    userEvent: "input.list",
  });
  return true;
};

/** 스마트 붙여넣기: 선택 위로 URL을 붙이면 `[선택](url)` 링크로. 그 외는 기본 붙여넣기. */
export const smartPaste: Extension = EditorView.domEventHandlers({
  paste(event, view) {
    const text = event.clipboardData?.getData("text/plain");
    if (!text) return false;
    const url = text.trim();
    if (!URL_RE.test(url)) return false;
    const range = view.state.selection.main;
    if (range.empty) return false; // 선택 없으면 일반 붙여넣기
    const sel = view.state.sliceDoc(range.from, range.to);
    if (URL_RE.test(sel.trim())) return false; // 선택 자체가 URL이면 그대로
    const insert = `[${sel}](${url})`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.cursor(range.from + insert.length),
      userEvent: "input.paste",
    });
    event.preventDefault();
    return true;
  },
});

/** 상태바용 커서/선택 상태. line/col은 1-based, selChars=선택된 총 글자수. */
export interface SelState {
  line: number;
  col: number;
  selChars: number;
}

export function selStateOf(view: EditorView): SelState {
  const st = view.state;
  const head = st.selection.main.head;
  const ln = st.doc.lineAt(head);
  const selChars = st.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0);
  return { line: ln.number, col: head - ln.from + 1, selChars };
}
