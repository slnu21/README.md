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

// ── 줄 단위 접두어(블록 서식) ─────────────────────────────────────────────────
// 인라인 마커(toggleWrap)와 달리 블록 서식은 "줄 앞 접두어"를 다뤄야 한다. 제목·인용·목록이
// 전부 이 형태이고 서로 배타적이므로(제목이면서 인용일 수는 있으나 제목 레벨은 하나) 한 헬퍼로 묶는다.

/** 줄에서 기존 블록 접두어를 벗겨 (들여쓰기, 접두어, 본문)으로 분해. */
function splitPrefix(text: string): { indent: string; prefix: string; body: string } {
  // 순서 주의: 인용(>) → 제목(#) → 목록. 인용 안의 제목("> # x")도 다룰 수 있게 인용을 먼저 본다.
  const m = /^(\s*)((?:>\s?)*)(#{1,6}\s+|(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/.exec(text);
  if (!m) return { indent: "", prefix: "", body: text };
  const indent = m[1];
  const prefix = (m[2] ?? "") + (m[3] ?? "");
  return { indent, prefix, body: text.slice(indent.length + prefix.length) };
}

/** 접두어에서 인용(`> `) 부분만 떼어낸다. 제목·목록 토글이 인용 안에서도 인용을 보존하도록. */
function quoteOf(prefix: string): string {
  return /^((?:>\s?)*)/.exec(prefix)?.[1] ?? "";
}

/** 선택이 걸친 모든 줄의 블록 접두어를 `next`가 돌려주는 접두어로 **교체**한다.
 *  토글 해제는 호출자가 "빈 접두어(또는 인용만)"를 돌려주는 식으로 명시한다
 *  — "같은 값이면 제거" 같은 암묵 규약을 두면 인용 접두어까지 함께 날아간다.
 *  빈 줄은 건드리지 않는다(문단 사이 빈 줄에 마커가 붙는 것을 막는다). */
function mapLinePrefix(next: (prefix: string, i: number) => string): Command {
  return (view) => {
    const { state } = view;
    const range = state.selection.main;
    const first = state.doc.lineAt(range.from);
    const last = state.doc.lineAt(range.to);
    const changes: { from: number; to: number; insert: string }[] = [];
    let i = 0;
    for (let n = first.number; n <= last.number; n++) {
      const line = state.doc.line(n);
      if (!line.text.trim()) continue; // 빈 줄 건너뜀
      const { indent, prefix, body } = splitPrefix(line.text);
      const insert = indent + next(prefix, i++) + body;
      if (insert !== line.text) changes.push({ from: line.from, to: line.to, insert });
    }
    if (!changes.length) return false;
    view.dispatch({ changes, scrollIntoView: true, userEvent: "input.format" });
    return true;
  };
}

/** 제목 레벨 토글. 같은 레벨을 다시 누르면 해제(Ctrl+0은 확대 초기화가 점유해 별도 해제 키 없음).
 *  다른 레벨이나 목록 위에서 누르면 그 서식을 제목으로 바꾼다. 인용은 보존. */
export function toggleHeading(level: number): Command {
  const marker = "#".repeat(level) + " ";
  return mapLinePrefix((prefix) => {
    const quote = quoteOf(prefix);
    return prefix.slice(quote.length) === marker ? quote : quote + marker;
  });
}

/** 인용문 `> ` 토글. 이미 인용이면 한 단계만 벗긴다(중첩 인용 지원). */
export const toggleQuote: Command = mapLinePrefix((prefix) =>
  /^>\s?/.test(prefix) ? prefix.replace(/^>\s?/, "") : "> " + prefix,
);

/** 목록 토글. kind별 마커를 넣고, 이미 같은 종류면 해제. 인용은 보존.
 *  ordered는 선택 줄마다 1,2,3…으로 번호를 매긴다. */
export function toggleList(kind: "bullet" | "ordered" | "task"): Command {
  return mapLinePrefix((prefix, i) => {
    const quote = quoteOf(prefix);
    const rest = prefix.slice(quote.length);
    const want = kind === "bullet" ? "- " : kind === "ordered" ? `${i + 1}. ` : "- [ ] ";
    // 같은 종류면 해제 — 번호 목록은 숫자가 줄마다 달라 형태로 비교한다.
    // 체크박스를 불릿보다 먼저 판정해야 "- [ ] "가 불릿으로 오인되지 않는다.
    const same =
      kind === "task"
        ? /^[-*+]\s+\[[ xX]\]\s+$/.test(rest)
        : kind === "bullet"
          ? /^[-*+]\s+$/.test(rest)
          : /^\d+[.)]\s+$/.test(rest);
    return quote + (same ? "" : want);
  });
}

/** 체크박스 `[ ]`↔`[x]` 토글. 체크박스 항목이 아니면 false(다른 키에 양보). */
export const toggleCheckbox: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  const first = state.doc.lineAt(range.from);
  const last = state.doc.lineAt(range.to);
  const changes: { from: number; to: number; insert: string }[] = [];
  for (let n = first.number; n <= last.number; n++) {
    const line = state.doc.line(n);
    const m = /^(\s*(?:>\s?)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/.exec(line.text);
    if (!m) continue;
    const from = line.from + m[1].length;
    changes.push({ from, to: from + 1, insert: m[2] === " " ? "x" : " " });
  }
  if (!changes.length) return false;
  view.dispatch({ changes, userEvent: "input.format" });
  return true;
};

/** 번호 목록 재번호 매기기 — 항목을 지우거나 옮겨 번호가 어긋난 연속 블록을 1부터 다시 매긴다.
 *  커서가 걸친 목록 블록(빈 줄 또는 비목록 줄 전까지)만 대상. */
export const renumberList: Command = (view) => {
  const { state } = view;
  const isOrdered = (t: string) => /^(\s*(?:>\s?)*)(\d+)([.)]\s+)/.exec(t);
  const cur = state.doc.lineAt(state.selection.main.head);
  if (!isOrdered(cur.text)) return false;
  // 블록 경계 탐색
  let start = cur.number;
  while (start > 1 && isOrdered(state.doc.line(start - 1).text)) start--;
  let end = cur.number;
  while (end < state.doc.lines && isOrdered(state.doc.line(end + 1).text)) end++;
  const changes: { from: number; to: number; insert: string }[] = [];
  let i = 1;
  for (let n = start; n <= end; n++) {
    const line = state.doc.line(n);
    const m = isOrdered(line.text)!;
    const want = String(i++);
    if (m[2] !== want) {
      const from = line.from + m[1].length;
      changes.push({ from, to: from + m[2].length, insert: want });
    }
  }
  if (!changes.length) return false;
  view.dispatch({ changes, userEvent: "input.format" });
  return true;
};

/** 코드블록으로 감싸기 — 선택을 ```…``` 로 두르고 언어 자리를 선택 상태로 남긴다.
 *  이미 펜스로 감싸져 있으면 벗긴다. */
export const toggleCodeBlock: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  const first = state.doc.lineAt(range.from);
  const last = state.doc.lineAt(range.to);
  const prev = first.number > 1 ? state.doc.line(first.number - 1) : null;
  const nextLine = last.number < state.doc.lines ? state.doc.line(last.number + 1) : null;
  // 벗기기: 선택 바로 위/아래가 펜스
  if (prev && nextLine && /^\s*```/.test(prev.text) && /^\s*```\s*$/.test(nextLine.text)) {
    view.dispatch({
      changes: [
        { from: prev.from, to: first.from, insert: "" },
        { from: last.to, to: nextLine.to, insert: "" },
      ],
      userEvent: "input.format",
    });
    return true;
  }
  const body = state.sliceDoc(first.from, last.to);
  const insert = "```\n" + body + "\n```";
  view.dispatch({
    changes: { from: first.from, to: last.to, insert },
    // "```" 뒤(언어 자리)에 커서 — 바로 언어를 타이핑할 수 있게
    selection: EditorSelection.cursor(first.from + 3),
    scrollIntoView: true,
    userEvent: "input.format",
  });
  return true;
};

/** 수평선 삽입 — 현재 줄 아래에 빈 줄로 감싼 `---`. */
export const insertHorizontalRule: Command = (view) => {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const insert = (line.text.trim() ? "\n\n" : "") + "---\n";
  view.dispatch({
    changes: { from: line.to, insert },
    selection: EditorSelection.cursor(line.to + insert.length),
    scrollIntoView: true,
    userEvent: "input.format",
  });
  return true;
};

/** 하드 개행(Shift+Enter) — 마크다운에서 줄바꿈을 강제하는 줄 끝 공백 2개 + 개행.
 *  줄 끝에 이미 공백이 있으면 정리하고 정확히 2개로 맞춘다. */
export const insertHardBreak: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);
  // 커서 앞의 기존 후행 공백을 흡수해 공백이 3개 이상 쌓이는 것을 막는다.
  const before = state.sliceDoc(line.from, range.head);
  const trimmed = before.replace(/[ \t]+$/, "");
  const from = line.from + trimmed.length;
  view.dispatch({
    changes: { from, to: range.to, insert: "  \n" },
    selection: EditorSelection.cursor(from + 3),
    scrollIntoView: true,
    userEvent: "input.format",
  });
  return true;
};

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
