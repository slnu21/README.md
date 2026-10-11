import { describe, expect, it } from "vitest";
import {
  canSyncScroll,
  planReveal,
  restoreLineFor,
  revealFor,
  takeRevealOnLoad,
  toSourceLine,
} from "./reveal";

describe("toSourceLine", () => {
  it("도구의 1-based 를 data-line 의 0-based 로", () => {
    expect(toSourceLine(1)).toBe(0);
    expect(toSourceLine(214)).toBe(213);
  });
  it("0·음수·소수에도 안 깨진다", () => {
    expect(toSourceLine(0)).toBe(0);
    expect(toSourceLine(-5)).toBe(0);
    expect(toSourceLine(3.9)).toBe(2);
  });
});

describe("revealFor", () => {
  const r = { path: "C:/d/a.md", line: 10, seq: 3 };
  it("그 패널의 문서일 때만 넘긴다", () => {
    expect(revealFor(r, "C:/d/a.md")).toEqual({ line: 9, seq: 3 });
    expect(revealFor(r, "C:/d/b.md")).toBeNull();
    expect(revealFor(r, null)).toBeNull();
    expect(revealFor(null, "C:/d/a.md")).toBeNull();
  });
});

describe("planReveal", () => {
  it("이미 그려져 있으면 지금, 미루지 않는다", () => {
    expect(planReveal({ line: 9, path: "a", loadedPath: "a", inFlight: false })).toEqual({
      now: true,
      pending: null,
    });
  });
  it("아직 앞 문서가 그려져 있으면 지금 안 하고 그 문서의 load 까지 미룬다", () => {
    expect(planReveal({ line: 9, path: "a", loadedPath: "prev", inFlight: true })).toEqual({
      now: false,
      pending: { path: "a", line: 9 },
    });
    expect(planReveal({ line: 9, path: "a", loadedPath: null, inFlight: false }).now).toBe(false);
  });
  it("같은 문서를 다시 그리는 중이면 지금도 하고 load 에도 건다(위치 복원이 덮으므로)", () => {
    expect(planReveal({ line: 9, path: "a", loadedPath: "a", inFlight: true })).toEqual({
      now: true,
      pending: { path: "a", line: 9 },
    });
  });
});

describe("takeRevealOnLoad", () => {
  it("방금 그려진 문서의 요청만 쓴다", () => {
    expect(takeRevealOnLoad({ path: "a", line: 9 }, "a")).toBe(9);
    expect(takeRevealOnLoad({ path: "a", line: 9 }, "prev")).toBeNull();
    expect(takeRevealOnLoad(null, "a")).toBeNull();
  });
});

describe("restoreLineFor", () => {
  it("같은 문서를 다시 그릴 때만 위치를 지킨다", () => {
    expect(restoreLineFor({ loadedPath: "a", nextPath: "a", top: 149 })).toBe(149);
  });
  it("다른 문서로 바뀌면 앞 문서의 줄을 넘기지 않는다(새 문서는 맨 위)", () => {
    expect(restoreLineFor({ loadedPath: "a", nextPath: "b", top: 149 })).toBeNull();
    expect(restoreLineFor({ loadedPath: null, nextPath: "a", top: 0 })).toBeNull();
  });
});

describe("canSyncScroll", () => {
  it("이 패널의 문서가 그려져 있을 때만", () => {
    expect(canSyncScroll("a", "a")).toBe(true);
    expect(canSyncScroll("prev", "a")).toBe(false);
    expect(canSyncScroll(null, "a")).toBe(false);
  });
});
