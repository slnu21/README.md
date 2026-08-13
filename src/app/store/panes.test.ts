import { describe, expect, it } from "vitest";
import { closeSecondary, openSecondary, reconcilePanes, swapPanes, type PaneState } from "./panes";

const S = (a: string | null, b: string | null, split = b !== null): PaneState => ({
  activePath: a,
  secondaryPath: b,
  readerSplit: split,
});

describe("reconcilePanes", () => {
  it("두 번째가 닫힌 탭이면 분할을 접는다", () =>
    expect(reconcilePanes(S("a", "b"), ["a"])).toEqual(S("a", null, false)));

  it("두 번째가 살아 있으면 유지", () =>
    expect(reconcilePanes(S("a", "b"), ["a", "b"])).toEqual(S("a", "b", true)));

  it("두 패널이 같은 문서면 두 번째를 접는다", () =>
    expect(reconcilePanes(S("a", "a"), ["a"])).toEqual(S("a", null, false)));

  it("활성이 닫혔으면 첫 탭으로 옮긴다", () =>
    expect(reconcilePanes(S("gone", "b"), ["b", "c"])).toEqual(S("b", null, false)));

  it("탭이 하나도 없으면 전부 비운다", () =>
    expect(reconcilePanes(S("a", "b"), [])).toEqual(S(null, null, false)));

  it("멱등하다", () => {
    const once = reconcilePanes(S("gone", "b"), ["b", "c"]);
    expect(reconcilePanes(once, ["b", "c"])).toEqual(once);
  });

  it("readerSplit 이 켜져 있어도 두 번째가 없으면 꺼진다", () =>
    expect(reconcilePanes({ activePath: "a", secondaryPath: null, readerSplit: true }, ["a"])).toEqual(
      S("a", null, false),
    ));
});

describe("openSecondary", () => {
  it("두 번째로 연다", () => expect(openSecondary(S("a", null), "b")).toEqual(S("a", "b", true)));

  it("활성과 같은 문서면 무연산", () => {
    const s = S("a", null);
    expect(openSecondary(s, "a")).toBe(s);
  });

  it("이미 두 번째가 있으면 교체", () =>
    expect(openSecondary(S("a", "b"), "c")).toEqual(S("a", "c", true)));

  it("활성이 없으면 두 번째가 아니라 활성이 된다", () =>
    expect(openSecondary(S(null, null), "a")).toEqual(S("a", null, false)));
});

describe("swapPanes", () => {
  it("맞바꾼다", () => expect(swapPanes(S("a", "b"))).toEqual(S("b", "a", true)));
  it("두 번째가 없으면 무연산", () => {
    const s = S("a", null);
    expect(swapPanes(s)).toBe(s);
  });
  it("활성이 없으면 무연산", () => {
    const s = S(null, "b", true);
    expect(swapPanes(s)).toBe(s);
  });
});

describe("closeSecondary", () => {
  it("두 번째만 닫고 활성은 둔다", () =>
    expect(closeSecondary(S("a", "b"))).toEqual(S("a", null, false)));
});
