import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { runMarked } from "../../test/cmView";
import {
  addColumnRight,
  addRowBelow,
  deleteColumn,
  deleteRow,
  findTable,
  formatTable,
  isDelimiter,
  nextTableCell,
  prevTableCell,
  renderTable,
  setColumnAlign,
  splitRow,
  strWidth,
} from "./tables";

const TBL = ["| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n");

describe("파싱", () => {
  it("셀 분리", () => expect(splitRow("| a | b |")).toEqual(["a", "b"]));
  it("바깥 파이프가 없어도", () => expect(splitRow("a | b")).toEqual(["a", "b"]));
  it("이스케이프된 파이프는 셀 경계가 아니다", () =>
    expect(splitRow("| a \\| b | c |")).toEqual(["a \\| b", "c"]));
  it("구분행 인식", () => expect(isDelimiter("| --- | :---: |")).toBe(true));
  it("본문은 구분행이 아니다", () => expect(isDelimiter("| a | b |")).toBe(false));
  it("하이픈이 없으면 구분행이 아니다", () => expect(isDelimiter("| | |")).toBe(false));
});

// 모노스페이스에서 CJK는 두 칸 — 글자 수로 세면 한글 표의 파이프가 어긋난다.
describe("표시 폭", () => {
  it("영문", () => expect(strWidth("abc")).toBe(3));
  it("한글은 2칸", () => expect(strWidth("한글")).toBe(4));
  it("혼합", () => expect(strWidth("a한b")).toBe(4));
});

describe("renderTable", () => {
  it("폭 맞춤 + 구분행 최소 3칸", () =>
    expect(
      renderTable(
        [
          ["a", "bb"],
          ["ccc", "d"],
        ],
        ["none", "none"],
      ),
    ).toBe(["| a   | bb  |", "| --- | --- |", "| ccc | d   |"].join("\n")));

  it("한글 폭 반영", () =>
    expect(
      renderTable(
        [
          ["이름", "값"],
          ["가", "1"],
        ],
        ["none", "none"],
      ),
    ).toBe(["| 이름 | 값  |", "| ---- | --- |", "| 가   | 1   |"].join("\n")));

  // 구분행 표기 + 셀 내용도 열 정렬을 따른다(소스 표가 렌더 결과와 같은 방향으로 보이게).
  it("정렬 표기와 내용 정렬", () =>
    expect(renderTable([["a", "b", "c"]], ["left", "center", "right"])).toBe(
      ["| a   |  b  |   c |", "| :-- | :-: | --: |"].join("\n"),
    ));
});

describe("findTable", () => {
  it("표 안이면 찾는다", () =>
    expect(findTable(EditorState.create({ doc: TBL }), 3)).not.toBeNull());
  it("헤더/본문 범위", () => {
    const t = findTable(EditorState.create({ doc: TBL }), 3)!;
    expect([t.startLine, t.endLine]).toEqual([1, 3]);
  });
  it("구분행이 없으면 표가 아니다", () =>
    expect(findTable(EditorState.create({ doc: "문장\n| 파이프만 |" }), 6)).toBeNull());
  it("평문이면 null", () => expect(findTable(EditorState.create({ doc: "문장" }), 1)).toBeNull());
});

describe("Tab 셀 이동", () => {
  // 이 false 반환에 "표 밖에서는 Tab이 들여쓰기" 동작이 걸려 있다.
  it("표 밖에서는 false — 들여쓰기로 양보", () =>
    expect(runMarked(nextTableCell, "그냥 ‸문장").ret).toBe(false));
  it("다음 셀로", () =>
    expect(runMarked(nextTableCell, "| a‸ | b |\n| --- | --- |\n| 1 | 2 |").out).toBe(
      "| a   | ‸b   |\n| --- | --- |\n| 1   | 2   |",
    ));
  it("행 끝 → 다음 행 첫 셀", () =>
    expect(runMarked(nextTableCell, "| a | b‸ |\n| --- | --- |\n| 1 | 2 |").out).toBe(
      "| a   | b   |\n| --- | --- |\n| ‸1   | 2   |",
    ));
  it("마지막 셀 → 새 행 추가", () =>
    expect(runMarked(nextTableCell, "| a | b |\n| --- | --- |\n| 1 | 2‸ |").out).toBe(
      "| a   | b   |\n| --- | --- |\n| 1   | 2   |\n| ‸    |     |",
    ));
  it("Shift+Tab 이전 셀", () =>
    expect(runMarked(prevTableCell, "| a | ‸b |\n| --- | --- |\n| 1 | 2 |").out).toBe(
      "| ‸a   | b   |\n| --- | --- |\n| 1   | 2   |",
    ));
});

describe("정렬·행열 조작", () => {
  it("정렬 맞추기", () =>
    expect(runMarked(formatTable, "| a‸ | bbbb |\n| --- | --- |\n| 1 | 2 |").out).toBe(
      "| ‸a   | bbbb |\n| --- | ---- |\n| 1   | 2    |",
    ));
  it("아래에 행 추가", () =>
    expect(
      runMarked(addRowBelow, "| a‸ | b |\n| --- | --- |\n| 1 | 2 |").out.split("\n"),
    ).toHaveLength(4));
  it("헤더 행은 삭제하지 않는다", () =>
    expect(runMarked(deleteRow, "| a‸ | b |\n| --- | --- |\n| 1 | 2 |").ret).toBe(false));
  // 마지막 본문 행을 지우면 헤더만 남는다 — 유효한 표다(과한 가드로 막혀 있었던 자리).
  it("본문 행 삭제 — 헤더만 남아도 유효", () =>
    expect(runMarked(deleteRow, "| a | b |\n| --- | --- |\n| 1‸ | 2 |").out).toBe(
      "| ‸a   | b   |\n| --- | --- |",
    ));
  it("오른쪽에 열 추가", () =>
    expect(
      runMarked(addColumnRight, "| a‸ | b |\n| --- | --- |\n| 1 | 2 |").out.split("\n")[0],
    ).toBe("| a   | ‸    | b   |"));
  it("열 삭제", () =>
    expect(runMarked(deleteColumn, "| a | b‸ |\n| --- | --- |\n| 1 | 2 |").out.split("\n")[0]).toBe(
      "| ‸a   |",
    ));
  it("열 가운데 정렬", () =>
    expect(
      runMarked(setColumnAlign("center"), "| a‸ | b |\n| --- | --- |\n| 1 | 2 |").out.split("\n")[1],
    ).toBe("| :-: | --- |"));
});
