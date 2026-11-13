import { describe, expect, it } from "vitest";
import { canCreate, parseAnnotMode, showsMarks } from "./mode";

describe("annot mode", () => {
  it("on 만 새 표시를 단다", () => {
    expect(canCreate("on")).toBe(true);
    expect(canCreate("view")).toBe(false);
    expect(canCreate("off")).toBe(false);
  });
  it("off 만 표시를 숨긴다 — 보기만 모드는 단 표시를 계속 보인다", () => {
    expect(showsMarks("on")).toBe(true);
    expect(showsMarks("view")).toBe(true);
    expect(showsMarks("off")).toBe(false);
  });
  it("모르는 값은 기본 on", () => {
    expect(parseAnnotMode("view")).toBe("view");
    expect(parseAnnotMode(undefined)).toBe("on");
    expect(parseAnnotMode("disabled")).toBe("on");
    expect(parseAnnotMode(1)).toBe("on");
  });
});
