// JSONC 전처리. 이 파일이 지키는 계약의 핵심은 **길이 보존**이다 —
// 주석을 지우면 JSON.parse 가 주는 오프셋이 원본의 엉뚱한 자리를 가리켜
// "12번째 줄이 잘못됐습니다" 안내가 통째로 거짓말이 된다.
import { describe, expect, it } from "vitest";
import { offsetToLineCol, parseErrorLine, stripJsonComments } from "./jsonc";

const parse = (s: string): unknown => JSON.parse(stripJsonComments(s)) as unknown;

describe("stripJsonComments", () => {
  it.each([
    ['{"a":1} // 끝',                          { a: 1 }],
    ['// 머리말\n{"a":1}',                      { a: 1 }],
    ['{/* 블록 */"a":1}',                       { a: 1 }],
    ['{\n/* 여러\n   줄 */\n"a":1}',            { a: 1 }],
    ['{"a":1 /* 값 뒤 */, "b":2}',              { a: 1, b: 2 }],
  ])("주석을 걷어내고 파싱된다: %s", (input, want) => expect(parse(input)).toEqual(want));

  it.each([
    ['{"url":"https://example.com/x"}',        { url: "https://example.com/x" }],
    ['{"a":"/* 주석 아님 */"}',                 { a: "/* 주석 아님 */" }],
    ['{"a":"// 주석 아님"}',                    { a: "// 주석 아님" }],
    ['{"a":"say \\"hi\\"" }',                  { a: 'say "hi"' }],
    ['{"a":"\\\\"} // 뒤에 주석',               { a: "\\" }],
  ])("문자열 안은 건드리지 않는다: %s", (input, want) => expect(parse(input)).toEqual(want));

  it.each([
    '{"a":1} // 끝',
    '{\n/* 여러\n   줄 */\n"a":1}',
    '{"url":"https://x"} /* 안 닫힘',
    "",
    "{}",
  ])("길이가 그대로다(오프셋 보존 계약): %s", (input) =>
    expect(stripJsonComments(input)).toHaveLength(input.length));

  it("줄바꿈은 공백으로 바뀌지 않는다 — 줄 번호가 밀리면 안내가 거짓이 된다", () => {
    const src = '{\n/* 두\n줄 */\n"a":1}';
    const out = stripJsonComments(src);
    expect([...out].filter((c) => c === "\n")).toHaveLength(3);
    expect(out.split("\n")).toHaveLength(src.split("\n").length);
  });

  it("닫히지 않은 블록 주석은 끝까지 주석이다(무한 루프·오독 없음)", () => {
    const out = stripJsonComments('{"a":1} /* 안 닫힘 "b":2');
    expect(out.trim()).toBe('{"a":1}');
  });

  it("주석이 없으면 원본 그대로다", () => {
    const src = '{\n  "a": [1, 2],\n  "b": "c"\n}';
    expect(stripJsonComments(src)).toBe(src);
  });
});

describe("offsetToLineCol", () => {
  const src = "abc\ndef\n\nghi";
  it.each([
    [0, 1, 1],
    [2, 1, 3],
    [4, 2, 1], // \n 바로 다음
    [8, 3, 1], // 빈 줄
    [9, 4, 1],
  ])("오프셋 %i → %i행 %i열", (off, line, col) =>
    expect(offsetToLineCol(src, off)).toEqual({ line, col }));

  it("범위를 벗어난 오프셋은 양끝으로 물린다", () => {
    expect(offsetToLineCol(src, -5)).toEqual({ line: 1, col: 1 });
    expect(offsetToLineCol(src, 999).line).toBe(4);
  });

  it("CRLF 도 줄 수를 맞게 센다", () =>
    expect(offsetToLineCol("a\r\nb", 3).line).toBe(2));
});

describe("parseErrorLine", () => {
  /** 파싱을 시도해 우리가 계산한 줄 번호를 돌려준다(성공하면 null). */
  const lineOf = (src: string): number | null => {
    try {
      JSON.parse(stripJsonComments(src));
      return null;
    } catch (e) {
      return parseErrorLine(src, e);
    }
  };

  it("깨진 JSON 의 줄 번호를 돌려준다", () => {
    // 3번째 줄 — 따옴표 없는 키
    expect(lineOf('{\n  "a": 1,\n  b: 2\n}')).toBe(3);
  });

  it("주석을 걷어낸 뒤에도 줄 번호가 원본과 맞는다(길이 보존의 이유)", () => {
    // 주석 3줄이 앞에 있어도 6번째 줄을 정확히 짚는다 — 주석을 지우는 구현이었다면 3번째로 밀린다.
    expect(lineOf('// 머리말\n/* 여러\n   줄 */\n{\n  "a": 1,\n  b: 2\n}')).toBe(6);
  });

  it("V8 이 위치를 안 주는 문구면 null 이다 — 호출부는 원문 메시지로 떨어진다", () => {
    // "Unexpected token ',', ..." 계열에는 position 이 없다. 엔진 문구를 파헤치는 대신
    // null 을 돌려주고, 호출부가 원문 메시지를 그대로 보여 주는 편이 정직하다.
    expect(parseErrorLine("{}", new Error("뭔가 잘못됨"))).toBeNull();
    expect(lineOf('{\n  "a": 1,\n  "b": ,\n}')).toBeNull();
  });
});
