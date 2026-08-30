// 사용자 테마 파일 파싱. 규약대로 fail-soft — 항목 하나가 틀려도 파일 전체가 죽지 않고,
// 무엇을 왜 버렸는지 반드시 경고로 남는다(조용히 무시하면 사용자는 오타를 영원히 못 찾는다).
import { describe, expect, it } from "vitest";
import { THEME_WARNING_CODES, parseUserThemes } from "./custom";
import ko from "../locales/ko.json";
import en from "../locales/en.json";
import { THEME_FILE_TEMPLATE } from "./template";
import { PROSE_KEYS } from "./prose";
import { BUILTIN_THEMES, setUserThemes, themes } from ".";

const P = (text: string) => parseUserThemes(text, BUILTIN_THEMES);
const one = (body: string): string => `{"version":1,"themes":[${body}]}`;
/** 경고는 구조화돼 있다 — 문구가 아니라 code 를 본다(문구는 번역되므로 테스트가 깨지면 안 된다).*/
const codes = (w: { code: string }[]): string[] => w.map((x) => x.code);

describe("정상 경로", () => {
  it("전체를 적은 테마를 그대로 읽는다", () => {
    const { themes: got, warnings } = P(
      one(`{
        "id":"mine","name":"내 테마","type":"dark","texture":"hanji","elevation":"flat",
        "tokens":{"bg":"#101010","fg":"#eeeeee","accent":"#ff8800","surface":"#181818","border":"#333333"},
        "prose":{"heading":"#ffffff","linkUnderline":true}
      }`),
    );
    expect(warnings).toEqual([]);
    expect(got.mine).toMatchObject({
      id: "mine",
      name: "내 테마",
      type: "dark",
      texture: "hanji",
      elevation: "flat",
      tokens: { "--bg": "#101010", "--accent": "#ff8800" },
      prose: { heading: "#ffffff", linkUnderline: true },
    });
  });

  it("`--bg` 처럼 적어도 받아 준다", () =>
    expect(P(one('{"id":"a","tokens":{"--bg":"#123456"}}')).themes.a.tokens["--bg"]).toBe("#123456"));

  it("#abc 는 #aabbcc 로 정규화된다 — mermaid 는 3자리를 받지만 우리 계약은 6자리다", () =>
    expect(P(one('{"id":"a","tokens":{"bg":"#ABC"}}')).themes.a.tokens["--bg"]).toBe("#aabbcc"));

  it("주석과 빈 줄이 있어도 읽는다", () => {
    const src = `// 내 테마\n{\n  /* 색 */\n  "version": 1,\n  "themes": [{ "id": "a" }]\n}`;
    expect(P(src).warnings).toEqual([]);
    expect(P(src).themes.a).toBeDefined();
  });

  it("빈 파일은 경고 없이 조용히 비어 있다", () => {
    expect(P("")).toEqual({ themes: {}, warnings: [] });
    expect(P("   \n\n ")).toEqual({ themes: {}, warnings: [] });
  });
});

describe("extends 병합", () => {
  it("적지 않은 값은 바탕 테마에서 물려받는다", () => {
    const got = P(one('{"id":"a","extends":"paper","tokens":{"accent":"#112233"}}')).themes.a;
    expect(got.tokens["--bg"]).toBe(BUILTIN_THEMES.paper.tokens["--bg"]);
    expect(got.tokens["--accent"]).toBe("#112233");
    expect(got.type).toBe(BUILTIN_THEMES.paper.type);
  });

  it("바탕의 prose·texture 도 물려받는다", () => {
    const got = P(one('{"id":"a","extends":"hanji","prose":{"marker":"#000000"}}')).themes.a;
    expect(got.texture).toBe("hanji");
    expect(got.prose?.markBg).toBe(BUILTIN_THEMES.hanji.prose?.markBg); // 안 적은 항목은 그대로
    expect(got.prose?.marker).toBe("#000000"); // 적은 항목만 바뀐다
  });

  it("extends 를 생략하고 내장 id 를 쓰면 그 테마를 덮어쓰는 뜻이다", () => {
    const got = P(one('{"id":"paper","prose":{"heading":"#010203"}}')).themes.paper;
    expect(got.tokens).toEqual(BUILTIN_THEMES.paper.tokens);
    expect(got.prose?.heading).toBe("#010203");
  });

  it("없는 extends 는 경고하고 기본 테마로 떨어진다(테마 자체는 살린다)", () => {
    const { themes: got, warnings } = P(one('{"id":"a","extends":"nope"}'));
    expect(got.a.tokens).toEqual(BUILTIN_THEMES.light.tokens);
    expect(codes(warnings)).toEqual(["badExtends"]);
  });
});

describe("fail-soft", () => {
  it("깨진 JSON 은 줄 번호를 알리고 테마를 하나도 안 만든다", () => {
    const { themes: got, warnings } = P('{\n  "themes": [\n    { id: "a" }\n  ]\n}');
    expect(got).toEqual({});
    expect(warnings[0]).toEqual({ code: "parseLine", params: { line: 3 } });
  });

  it("잘못된 색은 그 항목만 버리고 나머지는 살린다", () => {
    const { themes: got, warnings } = P(
      one('{"id":"a","tokens":{"bg":"red","fg":"#010101"},"prose":{"heading":"rgb(1,2,3)","link":"#020202"}}'),
    );
    expect(got.a.tokens["--bg"]).toBe(BUILTIN_THEMES.light.tokens["--bg"]); // 물려받은 값
    expect(got.a.tokens["--fg"]).toBe("#010101");
    expect(got.a.prose?.heading).toBeUndefined();
    expect(got.a.prose?.link).toBe("#020202");
    expect(warnings).toHaveLength(2);
  });

  it("버려도 5토큰은 언제나 6자리 hex 다 — mermaid 계약", () => {
    const got = P(one('{"id":"a","tokens":{"bg":"red","accent":"var(--x)"}}')).themes.a;
    for (const v of Object.values(got.tokens)) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each([
    ['{"id":"","tokens":{}}', "badId"],
    ['{"id":"Has Space"}', "badId"],
    ['{"id":"UPPER"}', "badId"],
    ['{"id":"-leading"}', "badId"],
    ['"문자열"', "entryNotObject"],
  ])("못 쓰는 항목은 건너뛰고 경고한다: %s", (body, code) => {
    const { themes: got, warnings } = P(one(body));
    expect(Object.keys(got)).toEqual([]);
    expect(codes(warnings)).toContain(code);
  });

  it("모르는 키는 무시하되 반드시 알린다(오타를 찾으라고)", () => {
    const { themes: got, warnings } = P(
      one('{"id":"a","colour":1,"tokens":{"backgrund":"#fff"},"prose":{"headding":"#fff"}}'),
    );
    expect(got.a).toBeDefined();
    expect(codes(warnings)).toEqual(["unknownKey", "unknownKey", "unknownKey"]);
    expect(warnings.map((w) => w.params?.key).sort()).toEqual(["backgrund", "colour", "headding"]);
  });

  it("최상위 모양이 틀리면 안전하게 비운다", () => {
    expect(codes(P("[1,2]").warnings)).toEqual(["notObject"]);
    expect(codes(P('{"themes":"a"}').warnings)).toEqual(["themesNotArray"]);
    expect(codes(P('{"version":9,"themes":[]}').warnings)).toEqual(["unknownVersion"]);
  });

  it("이름의 제어문자를 걷어내고 길이를 자른다(툴팁·상태바로 그대로 나간다)", () => {
    // JSON 안에 제어문자를 넣으려면 이스케이프여야 한다(날 것은 JSON 문법 위반).
    const got = P(one(`{"id":"a","name":"a\\u0007b${"긴".repeat(60)}"}`)).themes.a;
    expect(got.name).not.toMatch(/[\u0000-\u001f]/);
    expect(got.name.length).toBeLessThanOrEqual(40);
  });

  it("linkUnderline 은 불리언만 받는다", () => {
    const { themes: got, warnings } = P(one('{"id":"a","prose":{"linkUnderline":"yes"}}'));
    expect(got.a.prose?.linkUnderline).toBeUndefined();
    expect(warnings).toEqual([{ code: "badBool", params: { where: 1, id: "a", key: "linkUnderline" } }]);
  });
});

describe("setUserThemes — 레지스트리 재구성", () => {
  it("내장 테마가 먼저, 사용자 테마가 뒤에 온다", () => {
    setUserThemes(P(one('{"id":"zz"}')).themes);
    expect(Object.keys(themes)).toEqual([...Object.keys(BUILTIN_THEMES), "zz"]);
    setUserThemes({});
  });

  it("같은 id 로 덮어써도 자리를 지킨다", () => {
    setUserThemes(P(one('{"id":"paper","name":"내 종이"}')).themes);
    expect(Object.keys(themes)).toEqual(Object.keys(BUILTIN_THEMES));
    expect(themes.paper.name).toBe("내 종이");
    setUserThemes({});
  });

  it("파일에서 사라진 테마는 레지스트리에서도 사라진다", () => {
    setUserThemes(P(one('{"id":"gone"}')).themes);
    expect(themes.gone).toBeDefined();
    setUserThemes({});
    expect(themes.gone).toBeUndefined();
    expect(themes.paper).toEqual(BUILTIN_THEMES.paper); // 덮어쓴 내장도 원상복구
  });
});

describe("기본 템플릿", () => {
  // 템플릿은 사용자가 처음 보는 화면이자 유일한 설명서다. 오타 하나면 파일을 열자마자
  // 경고 토스트를 보게 되므로, 우리 파서가 **경고 없이** 읽는지 여기서 못박는다.
  const parsed = P(THEME_FILE_TEMPLATE);

  it("경고 하나 없이 읽힌다", () => expect(parsed.warnings).toEqual([]));

  it("쓸 수 있는 테마가 나온다", () => {
    const t = parsed.themes["my-hanji"];
    expect(t).toBeDefined();
    expect(t.texture).toBe("hanji");
    for (const v of Object.values(t.tokens)) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("설명서 역할을 한다 — 모든 prose 항목이 예시로 들어 있다", () => {
    // 하나라도 빠지면 사용자는 그 항목이 있는지조차 모른다.
    const missing = PROSE_KEYS.filter((k) => !THEME_FILE_TEMPLATE.includes(`"${k}":`));
    expect(missing).toEqual([]);
  });

  it("주석과 값 규칙을 실제로 담고 있다", () => {
    expect(THEME_FILE_TEMPLATE).toContain("//");
    expect(THEME_FILE_TEMPLATE).toMatch(/#rrggbb|16진수/);
  });
});

describe("경고 문구", () => {
  // 코드만 있고 문구가 없으면 토스트에 "badColor" 같은 날코드가 그대로 뜼게 된다.
  it.each(THEME_WARNING_CODES)("%s 에 ko/en 문구가 있다", (code) => {
    expect((ko.theme.w as Record<string, string>)[code]).toBeTruthy();
    expect((en.theme.w as Record<string, string>)[code]).toBeTruthy();
  });

  it("쓰지 않는 문구가 남아 있지 않다", () =>
    expect(Object.keys(ko.theme.w).sort()).toEqual([...THEME_WARNING_CODES].sort()));
});
