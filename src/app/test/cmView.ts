// 테스트용 CodeMirror 뷰 스텁. 편집 커맨드는 view.state / view.dispatch 만 쓰므로 DOM이 필요 없다.
// (앱 코드에서 import 하지 않는다 — 테스트 전용.)
import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import type { Command, EditorView } from "@codemirror/view";

export interface StubView {
  readonly state: EditorState;
  dispatch: EditorView["dispatch"];
  readonly doc: string;
  readonly cursor: number;
}

export function stubView(doc: string, from = 0, to = from): StubView {
  let state = EditorState.create({ doc, selection: EditorSelection.range(from, to) });
  return {
    get state() {
      return state;
    },
    // 스텁은 트랜잭션 스펙만 받는다(뷰 전용 오버로드는 커맨드가 쓰지 않는다).
    dispatch: ((...specs: TransactionSpec[]) => {
      state = state.update(...specs).state;
    }) as EditorView["dispatch"],
    get doc() {
      return state.doc.toString();
    },
    get cursor() {
      return state.selection.main.head;
    },
  };
}

const asView = (v: StubView) => v as unknown as EditorView;

/** 커맨드를 돌리고 결과 문서를 돌려준다. */
export function runCmd(cmd: Command, doc: string, from = 0, to = from): string {
  const v = stubView(doc, from, to);
  cmd(asView(v));
  return v.doc;
}

/** 문서 전체를 선택해 커맨드를 돌린다(여러 줄 서식 검증용). */
export function runAll(cmd: Command, doc: string): string {
  return runCmd(cmd, doc, 0, doc.length);
}

/** 커맨드의 반환값(true=처리, false=다른 키에 양보)만 확인. */
export function retOf(cmd: Command, doc: string, from = 0, to = from): boolean {
  return cmd(asView(stubView(doc, from, to)));
}

/** 커서를 "‸" 로 표시한 문서를 받아 실행하고, 결과를 같은 표기로 돌려준다.
 *  커서 이동이 핵심인 커맨드(표 셀 이동 등)를 읽기 쉽게 검증하기 위한 표기법. */
export function runMarked(cmd: Command, marked: string): { ret: boolean; out: string } {
  const pos = marked.indexOf("‸");
  const v = stubView(marked.replace("‸", ""), pos);
  const ret = cmd(asView(v));
  const d = v.doc;
  return { ret, out: d.slice(0, v.cursor) + "‸" + d.slice(v.cursor) };
}
