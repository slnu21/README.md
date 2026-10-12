import { describe, expect, it } from "vitest";
import { parseCanvas, serializeCanvas } from "./format";
import { INK_KEY, addStroke, eraseAt, smoothPath, strokeBox, strokes, validStroke, type Stroke } from "./ink";

const s = (id: string, points: [number, number][], kind: Stroke["kind"] = "pencil"): Stroke => ({ id, kind, color: "pink", points });

describe("캔버스 드로잉", () => {
  it("획을 더하면 x-readme-ink 에 — 좌표는 소수 한 자리", () => {
    const doc = parseCanvas("");
    addStroke(doc, s("i1", [[0.123, 0.456], [10.08, 20]]));
    const out = JSON.parse(serializeCanvas(doc));
    expect(out[INK_KEY]).toEqual({ version: 1, strokes: [{ id: "i1", kind: "pencil", color: "pink", points: [[0.1, 0.5], [10.1, 20]] }] });
    expect(strokes(doc)).toHaveLength(1);
  });

  it("모르는 키(필드 안 · 획 안)와 틀린 획은 그대로 남는다 — 다음 판·다른 도구가 넣은 것", () => {
    const doc = parseCanvas(JSON.stringify({ nodes: [], edges: [], [INK_KEY]: { version: 2, future: true, strokes: [{ ...s("a", [[0, 0], [1, 1]]), pressure: [1, 2] }, { id: "bad", kind: "laser" }] } }));
    expect(strokes(doc).map((x) => x.id)).toEqual(["a"]);
    addStroke(doc, s("b", [[5, 5], [6, 6]]));
    const ink = JSON.parse(serializeCanvas(doc))[INK_KEY];
    expect(ink.future).toBe(true);
    expect(ink.version).toBe(2);
    expect(ink.strokes[0].pressure).toEqual([1, 2]);
    expect(ink.strokes[1]).toEqual({ id: "bad", kind: "laser" });
  });

  it("지우개 — 선분 근처를 지나면 지우고, 다 지우면 필드를 뺀다", () => {
    const doc = parseCanvas("");
    addStroke(doc, s("a", [[0, 0], [100, 0]]));
    addStroke(doc, s("m", [[0, 50], [100, 50]], "marker"));
    expect(eraseAt(doc, 50, 30, 4)).toBe(0);
    expect(eraseAt(doc, 50, 3, 4)).toBe(1); // 점이 아니라 선분 가운데
    expect(eraseAt(doc, 50, 40, 4)).toBe(1); // 형광펜은 두꺼운 만큼 더
    expect(doc[INK_KEY]).toBeUndefined();
  });

  it("값 좁히기 — 색·종류·id·점", () => {
    expect(validStroke({ ...s("a", [[0, 0], [1, 1]]), color: "#f00" })).toBe(false);
    expect(validStroke({ ...s('x"><', [[0, 0], [1, 1]]) })).toBe(false);
    expect(validStroke(s("a", [[0, 0]]))).toBe(false);
    expect(validStroke(s("a", [[0, 0], [NaN, 1]]))).toBe(false);
  });

  it("경로 · 상자", () => {
    expect(smoothPath([[0, 0], [10, 0], [20, 10]])).toBe("M0.0,0.0 Q10.0,0.0 15.0,5.0 L20.0,10.0");
    expect(strokeBox(s("a", [[10, 20], [30, 5]]), 5)).toEqual({ x: 5, y: 0, w: 30, h: 25 });
  });
});
