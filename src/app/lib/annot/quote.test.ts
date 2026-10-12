import { describe, expect, it } from "vitest";
import { findQuote, makeQuote, plainQuote } from "./quote";

describe("TextQuote", () => {
  const text = "가나다 근거 부족. 라마바 근거 부족. 사아자 근거 부족.";

  it("만든 인용으로 같은 자리를 다시 찾는다 — 같은 글이 셋이어도", () => {
    for (let i = text.indexOf("근거"); i >= 0; i = text.indexOf("근거", i + 1)) {
      const q = makeQuote(text, i, i + 5);
      expect(findQuote(text, q)).toEqual({ start: i, end: i + 5 });
    }
  });

  it("앞뒤 문맥이 조금 바뀌어도 더 길게 맞는 쪽", () => {
    const i = text.indexOf("근거", 10);
    const q = makeQuote(text, i, i + 5);
    const changed = text.replace("가나다", "XYZ");
    expect(findQuote(changed, q)).toEqual({ start: i, end: i + 5 });
  });

  it("문맥이 같으면 hint 에 가까운 쪽", () => {
    const t = "ab ab ab";
    const q = { quote: "ab", prefix: "", suffix: "" };
    expect(findQuote(t, q, 6)).toEqual({ start: 6, end: 8 });
    expect(findQuote(t, q, 0)).toEqual({ start: 0, end: 2 });
  });

  it("글이 없으면 null — 비슷한 것을 억지로 고르지 않는다", () => {
    expect(findQuote(text, { quote: "근거 충분", prefix: "", suffix: "" })).toBeNull();
    expect(findQuote(text, { quote: "", prefix: "", suffix: "" })).toBeNull();
  });
});

describe("plainQuote — 카드에 보일 글", () => {
  it("인라인 표식을 걷는다", () => {
    expect(plainQuote("파일 어댑터도 **가장 오래된 것부터 버림**으로 맞춘다")).toBe("파일 어댑터도 가장 오래된 것부터 버림으로 맞춘다");
    expect(plainQuote("see [the spec](https://x.y/z) and `ring_buffer`")).toBe("see the spec and ring_buffer");
    expect(plainQuote("~~old~~ *new* _also_")).toBe("old new also");
    expect(plainQuote("![diagram](a.png) caption")).toBe("diagram caption");
  });
  it("블록 머리 표식과 줄바꿈", () => {
    expect(plainQuote("## 결정 대기\n- 내일 회의\n- [x] 끝남\n> 인용\n1. 첫째")).toBe("결정 대기 내일 회의 끝남 인용 첫째");
  });
  it("글자 속 기호는 남긴다", () => {
    expect(plainQuote("a * b * c")).toBe("a * b * c");
    expect(plainQuote("snake_case_name")).toBe("snake_case_name");
    expect(plainQuote("2*3 = 6")).toBe("2*3 = 6");
  });
});
