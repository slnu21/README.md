import { describe, expect, it } from "vitest";
import { splitTemplate } from "./layout";

const base = { ratio: 0.5, readerRatio: 0.5, vertical: false } as const;

describe("splitTemplate", () => {
  it("편집 모드는 splitRatio 를 쓴다", () =>
    expect(splitTemplate({ ...base, mode: "edit", ratio: 0.7 })).toEqual({
      gridTemplateColumns: "0.7fr 7px 0.3fr",
    }));

  it("부동소수 잔재를 반올림한다", () => {
    // 1-0.7 === 0.30000000000000004 — 그대로 넣으면 인라인 스타일에 그 숫자가 박힌다.
    const css = splitTemplate({ ...base, mode: "edit", ratio: 0.7 }).gridTemplateColumns!;
    expect(css).not.toContain("0000000");
  });

  it("리딩 단일은 한 칸", () =>
    expect(splitTemplate({ ...base, mode: "reader" })).toEqual({ gridTemplateColumns: "1fr" }));

  it("리딩 분할은 readerRatio 를 쓴다(ratio 는 무시)", () =>
    expect(splitTemplate({ ...base, mode: "readerSplit", ratio: 0.2, readerRatio: 0.6 })).toEqual({
      gridTemplateColumns: "0.6fr 7px 0.4fr",
    }));

  it("편집 모드는 readerRatio 를 무시한다", () =>
    expect(splitTemplate({ ...base, mode: "edit", ratio: 0.5, readerRatio: 0.9 })).toEqual({
      gridTemplateColumns: "0.5fr 7px 0.5fr",
    }));

  it.each(["edit", "readerSplit"] as const)("세로 스택(%s)은 행으로 나눈다", (mode) =>
    expect(splitTemplate({ ...base, mode, vertical: true, ratio: 0.4, readerRatio: 0.4 })).toEqual({
      gridTemplateRows: "0.4fr 7px 0.6fr",
      gridTemplateColumns: "1fr",
    }));

  it("세로 스택 + 리딩 단일은 한 칸", () =>
    expect(splitTemplate({ ...base, mode: "reader", vertical: true })).toEqual({
      gridTemplateRows: "1fr",
      gridTemplateColumns: "1fr",
    }));

  it("0.5 는 대칭", () =>
    expect(splitTemplate({ ...base, mode: "edit" }).gridTemplateColumns).toBe("0.5fr 7px 0.5fr"));
});
