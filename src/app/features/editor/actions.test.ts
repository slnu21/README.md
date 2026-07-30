// 단축키 도움말의 **진실성**을 지키는 테스트. 도움말이 "없는 키"를 안내하면 없는 것보다 해롭다.
// 상류 CodeMirror 키맵을 직접 읽어 inheritedShortcuts 전 항목이 실제로 바인딩돼 있는지 대조한다.
// 상류 버전을 올릴 때 이 테스트가 깨지면 도움말을 함께 고쳐야 한다는 신호다.
import { describe, expect, it } from "vitest";
import { defaultKeymap, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { markdownKeymap } from "@codemirror/lang-markdown";
import type { KeyBinding } from "@codemirror/view";
import { editorActions, inheritedShortcuts, keyHint } from "./actions";

/** CodeMirror normalizeKeyName 과 같은 정규화 — 수식어 **순서를 무시**해야 한다
 *  (상류 "Shift-Mod-k" ≡ 우리 "Mod-Shift-k"). 이걸 빼면 테스트가 거짓 경보를 낸다. */
function norm(spec: string): string {
  const parts = spec.split(/-(?!$)/);
  const base = parts.pop() ?? "";
  const mods = new Set<string>();
  for (const m of parts) {
    if (/^(cmd|meta|m)$/i.test(m)) mods.add("Meta");
    else if (/^a(lt)?$/i.test(m)) mods.add("Alt");
    else if (/^(c|ctrl|control)$/i.test(m)) mods.add("Ctrl");
    else if (/^s(hift)?$/i.test(m)) mods.add("Shift");
    else if (/^mod$/i.test(m)) mods.add("Ctrl"); // 배포 플랫폼 = Windows
    else throw new Error(`알 수 없는 수식어: ${m} (${spec})`);
  }
  return [...["Shift", "Meta", "Ctrl", "Alt"].filter((x) => mods.has(x)), base].join("-");
}

// 상류가 실제로 바인딩한 키(mac 전용 항목은 Windows에서 미적용 → 세지 않는다).
const bound = new Map<string, string>();
function collect(name: string, keymap: readonly KeyBinding[]) {
  for (const b of keymap) {
    if (!b.key) continue;
    if (!bound.has(norm(b.key))) bound.set(norm(b.key), name);
    if (b.shift && !bound.has(norm(`Shift-${b.key}`))) {
      bound.set(norm(`Shift-${b.key}`), `${name} (shift)`);
    }
  }
}
collect("markdownKeymap", markdownKeymap);
collect("defaultKeymap", defaultKeymap);
collect("historyKeymap", historyKeymap);
collect("searchKeymap", searchKeymap);

// 앱 전역(shell/AppShell.tsx 의 window keydown) — 상류가 아니라 우리가 처리한다.
const APP_KEYS = new Set(
  ["Mod-p", "Mod-Shift-p", "Mod-Shift-h", "Mod-s", "Mod-=", "Mod--", "Mod-0"].map(norm),
);

describe("inheritedShortcuts — 도움말에 적은 키가 실제로 존재하는가", () => {
  it.each(inheritedShortcuts.map((s) => [s.labelKey, s.key] as const))(
    "%s → %s",
    (_labelKey, key) => {
      for (const alt of key.split(" / ")) {
        const k = norm(alt);
        expect(bound.has(k) || APP_KEYS.has(k), `${alt} 바인딩 없음`).toBe(true);
      }
    },
  );

  it("빈 목록이 아니다(대조가 무의미해지는 것 방지)", () =>
    expect(inheritedShortcuts.length).toBeGreaterThan(20));
});

describe("우리 바인딩이 가리는 상류 키", () => {
  // 의도한 것만 있어야 한다. 새로 늘어나면 **무엇을 잃는지 확인하고** 이 목록을 갱신할 것.
  //  · Mod-i     ← 상류 selectParentSyntax. 기울임이 더 자주 쓰인다
  //  · Enter     ← 상류 insertNewlineContinueMarkup. continueList가 false를 반환하면 상류로
  //                넘어가므로 인용문·중첩목록 이어쓰기는 그대로 유지된다(손실 없음)
  //  · Shift-Enter ← 상류는 일반 Enter와 같은 동작(insertNewlineAndIndent)이었다.
  //                마크다운 하드 개행으로 바꿔도 잃는 기능이 없다(Enter가 그 역할을 한다)
  it("의도한 3개뿐", () => {
    const shadowed = editorActions
      .filter((a) => a.key && bound.has(norm(a.key)))
      .map((a) => a.key!);
    expect(shadowed.sort()).toEqual(["Enter", "Mod-i", "Shift-Enter"]);
  });
});

describe("keyHint 표시", () => {
  it.each([
    ["Mod-b", "Ctrl+B"],
    ["Mod-Shift-k", "Ctrl+Shift+K"],
    ["Shift-Mod-k", "Ctrl+Shift+K"], // 수식어 순서와 무관하게 같은 표시
    ["Alt-ArrowUp", "Alt+↑"],
    ["Shift-Alt-ArrowDown", "Shift+Alt+↓"],
    ["Mod-Alt-ArrowUp", "Ctrl+Alt+↑"],
    ["Mod--", "Ctrl+-"], // 키 자체가 하이픈
    ["Mod-=", "Ctrl+="],
    ["Enter", "Enter"],
    ["F3 / Mod-g", "F3 / Ctrl+G"],
    ["Mod-Shift-\\", "Ctrl+Shift+\\"],
  ])("%s → %s", (spec, want) => expect(keyHint(spec)).toBe(want));
});

describe("editorActions 무결성", () => {
  it("id가 중복되지 않는다", () => {
    const ids = editorActions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("같은 키가 두 액션에 겹치지 않는다", () => {
    const keys = editorActions.filter((a) => a.key).map((a) => norm(a.key!));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("모든 액션에 labelKey가 있다", () =>
    expect(editorActions.every((a) => a.labelKey.startsWith("ed."))).toBe(true));
});
