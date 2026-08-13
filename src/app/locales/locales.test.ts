// ko/en 로케일 무결성. 키가 한쪽에만 있으면 i18next가 **원문 키를 그대로 화면에 노출**한다
// (도움말에 "ed.moveLine" 같은 게 뜬다).
import { describe, expect, it } from "vitest";
import { editorActions, inheritedShortcuts, actionGroups } from "../features/editor/actions";
import en from "./en.json";
import ko from "./ko.json";

type Dict = Record<string, unknown>;
const get = (obj: Dict, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Dict)[k]), obj);

/** 중첩 객체를 "a.b.c" 평탄 키 집합으로. */
function flat(obj: Dict, prefix = "", out = new Set<string>()): Set<string> {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flat(v as Dict, p, out);
    else out.add(p);
  }
  return out;
}

// 코드가 실제로 참조하는 키 — 레지스트리에서 뽑으므로 액션이 늘면 자동으로 검사 대상이 된다.
const referenced = [
  ...editorActions.map((a) => a.labelKey),
  ...inheritedShortcuts.map((s) => s.labelKey),
  ...actionGroups.map((g) => `ed.group.${g}`),
  "ed.title",
  "ed.close",
  "ed.note",
];

describe("i18n", () => {
  it.each([...new Set(referenced)].sort())("%s 가 ko/en 양쪽에 있다", (key) => {
    expect(typeof get(ko as Dict, key), `ko.${key}`).toBe("string");
    expect(typeof get(en as Dict, key), `en.${key}`).toBe("string");
  });

  // 위 검사는 코드가 참조하는 키만 본다. 아래는 반대 방향 — 한쪽에만 있는 번역을 잡는다
  // (템플릿으로 참조되는 ed.h1~h6 처럼 정적으로 못 잡는 키까지 커버).
  it("ed.* 키 집합이 ko/en 대칭이다", () => {
    const koEd = [...flat((ko as Dict).ed as Dict)].sort();
    const enEd = [...flat((en as Dict).ed as Dict)].sort();
    expect(koEd).toEqual(enEd);
  });

  it("최상위 네임스페이스가 ko/en 대칭이다", () =>
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort()));

  // ed.* 밖(ws.*·view.*·menu.*·tab.*·status.*…)은 여태 무방비였다 — 한쪽에만 키를 넣어도
  // 위 검사들을 전부 통과했다. 전체 키 집합을 대칭으로 못박아 원문 키 노출을 막는다.
  it("전체 키 집합이 ko/en 대칭이다", () =>
    expect([...flat(ko as Dict)].sort()).toEqual([...flat(en as Dict)].sort()));

  it("빈 문자열 번역이 없다", () => {
    for (const locale of [ko, en] as Dict[]) {
      for (const key of flat(locale)) {
        expect(String(get(locale, key)).trim().length, key).toBeGreaterThan(0);
      }
    }
  });
});
