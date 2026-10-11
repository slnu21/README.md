import { describe, expect, it } from "vitest";
import { bigDoc } from "./perfFixture";

describe("bigDoc — 성능 픽스처", () => {
  it("결정적이다 — 같은 시드면 같은 문서(숫자를 판끼리 비교하려면)", () => {
    expect(bigDoc({ chars: 50_000 })).toBe(bigDoc({ chars: 50_000 }));
    expect(bigDoc({ chars: 50_000, seed: 7 })).not.toBe(bigDoc({ chars: 50_000 }));
  });

  it("목표 크기에 닿고, 끝 표식으로 끝난다", () => {
    const doc = bigDoc({ chars: 1_000_000 });
    expect(doc.length).toBeGreaterThanOrEqual(1_000_000);
    expect(doc.length).toBeLessThan(1_010_000);
    expect(doc.trimEnd().endsWith("마지막 문단.")).toBe(true);
    expect(doc.split("\n").filter((l) => l === "## END-OF-FIXTURE")).toHaveLength(1);
    expect(bigDoc({ chars: 1000, end: "END-MID" })).toContain("\n## END-MID\n");
  });

  it("에이전트 보고서 모양 — 헤딩·코드 펜스·표·체크박스가 섞이고 펜스는 닫힌다", () => {
    const doc = bigDoc({ chars: 200_000 });
    const lines = doc.split("\n");
    expect(lines.filter((l) => l.startsWith("## ")).length).toBeGreaterThan(50);
    expect(lines.filter((l) => l === "```ts").length).toBeGreaterThan(10);
    expect(lines.filter((l) => l === "```").length).toBe(lines.filter((l) => l === "```ts").length);
    expect(lines.some((l) => l.startsWith("| --- |"))).toBe(true);
    expect(lines.some((l) => l.startsWith("- [x] "))).toBe(true);
  });
});
