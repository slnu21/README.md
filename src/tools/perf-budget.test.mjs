import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkBudget, median, medianOfRuns } from "./perf-budget.mjs";

describe("perf-budget — 예산 판정", () => {
  it("중앙값은 짝수 개면 위쪽 가운데(Rust 쪽과 같은 규칙)", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(3);
    expect(median([])).toBeNaN();
  });

  it("여러 번 잰 것은 항목별 중앙값 — 빠진 항목은 잰 것만으로", () => {
    expect(medianOfRuns([{ a: 10, b: 1 }, { a: 30 }, { a: 20, b: 3 }])).toEqual({ a: 20, b: 3 });
    expect(medianOfRuns([{ a: NaN }, { a: 5 }])).toEqual({ a: 5 });
  });

  it("넘으면 위반, 같으면 통과", () => {
    const budget = { fe: { x_ms: 100, y_ms: 50 } };
    expect(checkBudget(budget, "fe", { x_ms: 100, y_ms: 10 })).toEqual([]);
    expect(checkBudget(budget, "fe", { x_ms: 101, y_ms: 10 })).toEqual(["fe.x_ms = 101 > 예산 100"]);
  });

  it("예산에 있는데 안 잰 항목은 위반 — 재는 쪽이 조용히 빠지면 예산이 공허하게 통과한다", () => {
    expect(checkBudget({ fe: { x_ms: 1 } }, "fe", {})).toEqual(["fe.x_ms 를 재지 않았다(예산에는 있다)"]);
    expect(checkBudget({ fe: { x_ms: 1 } }, "fe", { x_ms: NaN })).toHaveLength(1);
  });

  it("주석 키(_)와 없는 절은 건너뛰고, 예산 밖 측정(_info)은 상관없다", () => {
    expect(checkBudget({ fe: { _: "설명", x_ms: 5 } }, "fe", { x_ms: 1, heap_mb_info: 999 })).toEqual([]);
    expect(checkBudget({}, "fe", { x_ms: 1 })).toEqual([]);
  });

  it("저장소의 예산 파일이 읽히고, 모든 한도가 양수다", () => {
    const budget = JSON.parse(readFileSync(new URL("./perf-budget.json", import.meta.url), "utf8"));
    for (const [section, limits] of Object.entries(budget)) {
      if (section.startsWith("_")) continue;
      for (const [k, v] of Object.entries(limits)) {
        if (k.startsWith("_")) continue;
        expect(typeof v, `${section}.${k}`).toBe("number");
        expect(v, `${section}.${k}`).toBeGreaterThan(0);
      }
    }
  });
});
