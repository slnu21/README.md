import { describe, expect, it } from "vitest";
import { createSettings, type StorageLike } from "./settings";

/** localStorage 흉내 — 순서 있는 Map. `failOn` 이면 그 동작에서 던진다(사생활 모드·용량 초과). */
function fakeStorage(init: Record<string, string> = {}, failOn?: "get" | "set"): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return {
    map,
    get length() {
      if (failOn === "get") throw new Error("SecurityError");
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (failOn === "set") throw new Error("QuotaExceededError");
      map.set(k, v);
    },
  };
}

describe("web settings (localStorage)", () => {
  it("접두어가 붙은 키만 읽고, 접두어를 떼서 돌려준다(이름순)", () => {
    const s = fakeStorage({ "readme-md.settings.b": "2", "md-reader": "{zustand}", "readme-md.settings.a": "1" });
    expect(createSettings(s).getAll()).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("set 은 접두어를 붙여 저장하고 바로 getAll 에 보인다", () => {
    const s = fakeStorage();
    const st = createSettings(s);
    st.set("annot.meanings", '{"star":"핵심"}');
    expect(s.map.get("readme-md.settings.annot.meanings")).toBe('{"star":"핵심"}');
    expect(st.getAll()).toEqual([["annot.meanings", '{"star":"핵심"}']]);
  });

  it("저장소가 없으면(null) 메모리로 세션 동안 기억한다", () => {
    const st = createSettings(null);
    st.set("k", "v");
    expect(st.getAll()).toEqual([["k", "v"]]);
  });

  it("쓰기가 던지면(용량·차단) 앱을 세우지 않고 메모리로 떨어진다", () => {
    const st = createSettings(fakeStorage({}, "set"));
    expect(() => st.set("k", "v")).not.toThrow();
    expect(st.getAll()).toEqual([["k", "v"]]);
  });

  it("읽기가 던져도 빈 목록 + 메모리 값", () => {
    const st = createSettings(fakeStorage({ "readme-md.settings.x": "1" }, "get"));
    st.set("y", "2");
    expect(st.getAll()).toEqual([["y", "2"]]);
  });
});
