import { describe, expect, it } from "vitest";
import { diffSeq, textSegments, tokenize, type Segment } from "./diff";

/** 구간을 따라 옛 글로 새 글을 다시 만들 수 있어야 한다 — 빈틈·겹침이 없다는 뜻. */
function rebuild(segs: Segment[], oldText: string, newText: string) {
  let o = 0;
  let n = 0;
  let out = "";
  for (const s of segs) {
    expect(s.o0).toBe(o);
    expect(s.n0).toBe(n);
    if (s.eq) expect(oldText.slice(s.o0, s.o1)).toBe(newText.slice(s.n0, s.n1));
    out += newText.slice(s.n0, s.n1);
    o = s.o1;
    n = s.n1;
  }
  expect(o).toBe(oldText.length);
  expect(n).toBe(newText.length);
  expect(out).toBe(newText);
}

describe("diffSeq", () => {
  it("같은 배열은 eq 하나", () => {
    expect(diffSeq([1, 2, 3], [1, 2, 3])).toEqual([{ kind: "eq", a0: 0, a1: 3, b0: 0, b1: 3 }]);
  });

  it("빈 쪽이 있으면 통째로 지움·넣음", () => {
    expect(diffSeq([], [1, 2])).toEqual([{ kind: "ins", a0: 0, a1: 0, b0: 0, b1: 2 }]);
    expect(diffSeq([1, 2], [])).toEqual([{ kind: "del", a0: 0, a1: 2, b0: 0, b1: 0 }]);
  });

  it("최소 편집 — 가운데 하나 바꿈", () => {
    const r = diffSeq("abcxef".split(""), "abcyef".split(""));
    expect(r.map((x) => x.kind)).toEqual(["eq", "del", "ins", "eq"]);
    expect(r.filter((x) => x.kind !== "eq").reduce((n, x) => n + (x.a1 - x.a0) + (x.b1 - x.b0), 0)).toBe(2);
  });

  it("편집 수가 상한을 넘으면 덩어리 하나로 — 그래도 앞뒤 공통부는 지킨다", () => {
    const a = ["p", ...Array.from({ length: 50 }, (_, i) => `a${i}`), "s"];
    const b = ["p", ...Array.from({ length: 50 }, (_, i) => `b${i}`), "s"];
    const r = diffSeq(a, b, Object.is, 10);
    expect(r).toEqual([
      { kind: "eq", a0: 0, a1: 1, b0: 0, b1: 1 },
      { kind: "del", a0: 1, a1: 51, b0: 1, b1: 1 },
      { kind: "ins", a0: 51, a1: 51, b0: 1, b1: 51 },
      { kind: "eq", a0: 51, a1: 52, b0: 51, b1: 52 },
    ]);
  });

  it("무작위 쌍에서도 편집 스크립트가 b 를 만든다", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 4);
    for (let t = 0; t < 200; t++) {
      const a = Array.from({ length: rnd() * 3 + rnd() }, rnd);
      const b = Array.from({ length: rnd() * 3 + rnd() }, rnd);
      const out: number[] = [];
      for (const r of diffSeq(a, b)) {
        if (r.kind === "eq") {
          expect(a.slice(r.a0, r.a1)).toEqual(b.slice(r.b0, r.b1));
          out.push(...a.slice(r.a0, r.a1));
        } else if (r.kind === "ins") out.push(...b.slice(r.b0, r.b1));
      }
      expect(out).toEqual(b);
    }
  });
});

describe("tokenize", () => {
  it("한글 어절·영어 낱말·공백·구두점", () => {
    expect(tokenize("근거가 부족함, see p.3\n")).toEqual(["근거가", " ", "부족함", ",", " ", "see", " ", "p", ".", "3", "\n"]);
  });
});

describe("textSegments", () => {
  it("같은 글", () => {
    const t = "a\nb\n";
    expect(textSegments(t, t)).toEqual([{ eq: true, o0: 0, o1: 4, n0: 0, n1: 4 }]);
  });

  it("문단을 끼우면 아래는 eq 로 밀린다", () => {
    const o = "# 제목\n\n첫 문단.\n\n둘째 문단.\n";
    const n = "# 제목\n\n끼운 문단.\n\n첫 문단.\n\n둘째 문단.\n";
    const segs = textSegments(o, n);
    rebuild(segs, o, n);
    const at = o.indexOf("둘째");
    const s = segs.find((x) => x.eq && x.o0 <= at && at < x.o1)!;
    expect(n.slice(s.n0 + (at - s.o0), s.n0 + (at - s.o0) + 2)).toBe("둘째");
  });

  it("고친 줄 안은 낱말 단위로 좁힌다", () => {
    const o = "결론: 근거가 부족하다. 다음 절 참고.\n";
    const n = "결론: 근거가 충분하다. 다음 절 참고.\n";
    const segs = textSegments(o, n);
    rebuild(segs, o, n);
    const changed = segs.filter((s) => !s.eq);
    expect(changed).toHaveLength(1);
    expect(o.slice(changed[0].o0, changed[0].o1)).toBe("부족하다");
    expect(n.slice(changed[0].n0, changed[0].n1)).toBe("충분하다");
  });

  it("무작위 편집에도 빈틈 없이 덮는다", () => {
    const words = ["가", "나다", "the", "x", " ", "\n", ".", "라마바"];
    let seed = 3;
    const rnd = (k: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % k);
    for (let t = 0; t < 100; t++) {
      const o = Array.from({ length: rnd(40) }, () => words[rnd(words.length)]).join("");
      const arr = o.split("");
      for (let e = rnd(5); e > 0; e--) arr.splice(rnd(arr.length + 1), rnd(3), ...words[rnd(words.length)]);
      rebuild(textSegments(o, arr.join("")), o, arr.join(""));
    }
  });
});
