import { describe, expect, it } from "vitest";
import { runAll, runCmd, retOf, stubView } from "../../test/cmView";
import {
  insertHardBreak,
  insertHorizontalRule,
  renumberList,
  toggleCheckbox,
  toggleCodeBlock,
  toggleHeading,
  toggleList,
  toggleQuote,
} from "./commands";
import type { EditorView } from "@codemirror/view";

describe("toggleHeading", () => {
  it("평문 → H2", () => expect(runAll(toggleHeading(2), "hello")).toBe("## hello"));
  it("같은 레벨 재입력 = 해제", () => expect(runAll(toggleHeading(2), "## hello")).toBe("hello"));
  it("H2 → H3 (레벨 교체)", () => expect(runAll(toggleHeading(3), "## hello")).toBe("### hello"));
  // 인용 보존은 mapLinePrefix 규약 결함으로 실제로 깨졌던 자리다("같은 값이면 제거" → 인용까지 삭제).
  it("인용 안에서 제목 부여 — 인용 보존", () =>
    expect(runAll(toggleHeading(1), "> quoted")).toBe("> # quoted"));
  it("인용 안에서 제목 해제 — 인용 보존", () =>
    expect(runAll(toggleHeading(1), "> # quoted")).toBe("> quoted"));
  it("목록 → 제목 (마커 교체)", () => expect(runAll(toggleHeading(2), "- item")).toBe("## item"));
  it("들여쓰기 보존", () => expect(runAll(toggleHeading(1), "  hello")).toBe("  # hello"));
});

describe("toggleQuote", () => {
  it("평문 → 인용", () => expect(runAll(toggleQuote, "a")).toBe("> a"));
  it("인용 해제", () => expect(runAll(toggleQuote, "> a")).toBe("a"));
  it("중첩 인용은 한 단계만 해제", () => expect(runAll(toggleQuote, "> > a")).toBe("> a"));
  it("제목 위에 인용 부여", () => expect(runAll(toggleQuote, "# t")).toBe("> # t"));
});

describe("toggleList", () => {
  it("여러 줄 불릿", () => expect(runAll(toggleList("bullet"), "a\nb")).toBe("- a\n- b"));
  it("여러 줄 번호 (1,2,3 자동)", () =>
    expect(runAll(toggleList("ordered"), "a\nb\nc")).toBe("1. a\n2. b\n3. c"));
  it("불릿 해제", () => expect(runAll(toggleList("bullet"), "- a")).toBe("a"));
  it("번호 해제", () => expect(runAll(toggleList("ordered"), "1. a")).toBe("a"));
  it("불릿 → 체크박스", () => expect(runAll(toggleList("task"), "- a")).toBe("- [ ] a"));
  it("체크박스 해제", () => expect(runAll(toggleList("task"), "- [ ] a")).toBe("a"));
  // 체크박스를 불릿보다 먼저 판정해야 "- [ ] "가 불릿으로 오인되지 않는다.
  it("체크박스 → 불릿", () => expect(runAll(toggleList("bullet"), "- [ ] a")).toBe("- a"));
  it("빈 줄은 건드리지 않는다", () =>
    expect(runAll(toggleList("bullet"), "a\n\nb")).toBe("- a\n\n- b"));
  it("인용 안 목록 — 인용 보존", () => expect(runAll(toggleList("bullet"), "> a")).toBe("> - a"));
});

describe("toggleCheckbox", () => {
  it("미체크 → 체크", () => expect(runAll(toggleCheckbox, "- [ ] a")).toBe("- [x] a"));
  it("체크 → 미체크", () => expect(runAll(toggleCheckbox, "- [x] a")).toBe("- [ ] a"));
  it("여러 줄 동시", () =>
    expect(runAll(toggleCheckbox, "- [ ] a\n- [ ] b")).toBe("- [x] a\n- [x] b"));
  it("체크박스가 아니면 변화 없음", () => expect(runAll(toggleCheckbox, "- a")).toBe("- a"));
  it("체크박스가 아니면 false 반환 — 다른 키에 양보", () =>
    expect(retOf(toggleCheckbox, "- a")).toBe(false));
});

describe("renumberList", () => {
  it("어긋난 번호 정정", () =>
    expect(runCmd(renumberList, "1. a\n5. b\n2. c")).toBe("1. a\n2. b\n3. c"));
  it("이미 맞으면 변화 없음", () => expect(runCmd(renumberList, "1. a\n2. b")).toBe("1. a\n2. b"));
  it("번호 목록이 아니면 false", () => expect(retOf(renumberList, "plain")).toBe(false));
});

describe("toggleCodeBlock", () => {
  it("선택을 펜스로 감싸기", () => expect(runAll(toggleCodeBlock, "x = 1")).toBe("```\nx = 1\n```"));
  it("펜스 벗기기", () => expect(runCmd(toggleCodeBlock, "```\nx = 1\n```", 4, 9)).toBe("x = 1"));
  it("커서가 언어 자리(``` 뒤)", () => {
    const v = stubView("x", 0, 1);
    toggleCodeBlock(v as unknown as EditorView);
    expect(v.cursor).toBe(3);
  });
});

describe("삽입", () => {
  it("하드 개행 = 공백 2 + 개행", () => expect(runCmd(insertHardBreak, "abc", 3)).toBe("abc  \n"));
  it("기존 후행 공백을 흡수(3개 이상 방지)", () =>
    expect(runCmd(insertHardBreak, "abc   ", 6)).toBe("abc  \n"));
  it("수평선", () => expect(runCmd(insertHorizontalRule, "para", 0)).toBe("para\n\n---\n"));
});
