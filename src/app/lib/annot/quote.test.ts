import { describe, expect, it } from "vitest";
import { findQuote, makeQuote } from "./quote";

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
