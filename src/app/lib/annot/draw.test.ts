import { describe, expect, it } from "vitest";
import { drawMark, layerInner, layerOf, mergeLines, rng } from "./draw";
import { BLOCK_STYLES, COLORS, POINT_STYLES, RANGE_STYLES } from "./pens";

const L = { x: 10, y: 20, w: 200, h: 24 };

describe("mergeLines", () => {
  it("같은 줄 조각(굵게·코드)은 한 줄로, 다른 줄은 따로", () => {
    const rects = [
      { x: 10, y: 20, w: 50, h: 24 },
      { x: 60, y: 21, w: 40, h: 22 }, // 같은 줄의 코드 조각
      { x: 10, y: 50, w: 120, h: 24 },
      { x: 130, y: 50, w: 0, h: 24 }, // 폭 0 은 버린다
    ];
    expect(mergeLines(rects)).toEqual([
      { x: 10, y: 20, w: 90, h: 24 },
      { x: 10, y: 50, w: 120, h: 24 },
    ]);
  });
});

describe("drawMark", () => {
  it("같은 표시는 언제 그려도 같다(손떨림 시드 = id)", () => {
    const a = drawMark({ id: "a1", style: "highlight", color: "yellow", lines: [L] }, true);
    const b = drawMark({ id: "a1", style: "highlight", color: "yellow", lines: [L] }, true);
    const c = drawMark({ id: "a2", style: "highlight", color: "yellow", lines: [L] }, true);
    expect(a).toEqual(b);
    expect(a.under).not.toEqual(c.under);
    expect(rng("x")()).toBe(rng("x")());
  });

  it("형광펜·세로줄은 글자 밑, 나머지는 글자 위", () => {
    for (const s of [...RANGE_STYLES, ...POINT_STYLES, ...BLOCK_STYLES]) {
      const d = drawMark({ id: "z", style: s, color: "blue", lines: [L], mx: 0 }, false);
      const want = layerOf(s);
      expect(d[want], s).toContain('data-id="z"');
      expect(d[want === "under" ? "over" : "under"], s).toBe("");
    }
  });

  it("색은 테마 변수로만 — 리터럴 색이 없다", () => {
    for (const c of COLORS) {
      const d = drawMark({ id: "z", style: "wavy", color: c, lines: [L], badge: 2 }, true);
      expect(d.over).toContain(`var(--mark-${c}-lead)`);
      expect(d.over).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    }
  });

  it("메모 번호는 숫자만, 여러 줄이면 마지막 줄 끝에", () => {
    const d = drawMark({ id: "z", style: "underline", color: "pink", lines: [L, { x: 10, y: 50, w: 80, h: 24 }], badge: 3 }, false);
    expect(d.over).toContain(">3</text>");
    expect(d.over).toMatch(/<text x="99\.0"/); // 10 + 80 + 9
  });

  it("id 가 안전하지 않으면 아무것도 안 그린다", () => {
    expect(drawMark({ id: 'x"><script>', style: "highlight", color: "yellow", lines: [L] }, false)).toEqual({ under: "", over: "" });
  });

  it("질감 끔 = 같은 도형에서 필터만 뺀다 · 필터 영역은 표시 하나의 상자", () => {
    const on = drawMark({ id: "q1", style: "highlight", color: "yellow", lines: [L] }, true).under;
    const off = drawMark({ id: "q1", style: "highlight", color: "yellow", lines: [L] }, false).under;
    expect(on).toContain('filter="url(#annot-hl-q1)"');
    expect(on).toMatch(/<filter id="annot-hl-q1" filterUnits="userSpaceOnUse" x="-6\.0" y="6\.0" width="232\.0" height="52\.0"/);
    expect(off).not.toContain("filter");
    const d = (svg: string) => svg.match(/ d="[^"]+"/g);
    expect(d(on)).toEqual(d(off));
    expect(layerInner(["<g/>", "<g/>"])).toBe("<g/><g/>");
  });
});
