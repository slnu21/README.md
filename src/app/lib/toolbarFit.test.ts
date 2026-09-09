import { describe, expect, it } from "vitest";
import { DENSITIES, initialFit, nextFit, requiredWidth, type FitState } from "./toolbarFit";

/** 폭을 주면 안정될 때까지 관측을 되풀이한다(측정은 렌더마다 도니까 현실도 이렇게 움직인다).
 *  `fits` = 그 폭에서 어느 단계까지 들어가는가(단계 번호가 이 값 이상이면 안 넘친다). */
function settle(state: FitState, width: number, fits: (level: number, width: number) => boolean) {
  for (let i = 0; i < 10; i++) {
    const next = nextFit(state, width, !fits(state.level, width));
    if (next === state) return { state, steps: i };
    state = next;
  }
  throw new Error("안정되지 않았다(진동)");
}

// 모형 툴바: full=1200px, icons=900px, menu=600px 있어야 들어간다.
const NEED = [1200, 900, 600];
const fits = (level: number, width: number) => width >= NEED[level];

describe("requiredWidth", () => {
  it("아이템 폭 + 사이 간격 + 안쪽 여백", () =>
    expect(requiredWidth([100, 50, 30], 8, 22)).toBe(100 + 50 + 30 + 16 + 22));
  it("아이템이 하나면 간격이 없다", () => expect(requiredWidth([100], 8, 22)).toBe(122));
  it("빈 툴바는 여백뿐", () => expect(requiredWidth([], 8, 22)).toBe(22));
});

describe("nextFit", () => {
  it("넘치면 한 칸 접는다", () => {
    const s = nextFit(initialFit, 1000, true);
    expect(s.level).toBe(1);
    expect(s.floor[0]).toBe(1000);
  });

  it("바뀔 것이 없으면 **같은 객체**를 돌려준다(렌더 루프 방지)", () => {
    const s: FitState = { level: 0, floor: [] };
    expect(nextFit(s, 1600, false)).toBe(s);
    const bottom: FitState = { level: DENSITIES.length - 1, floor: [] };
    expect(nextFit(bottom, 200, true)).toBe(bottom); // 더 접을 것이 없다
  });

  it("좁아지면 필요한 만큼 내려가고 거기서 멈춘다", () => {
    const { state } = settle(initialFit, 1000, fits);
    expect(DENSITIES[state.level]).toBe("icons");
    const narrow = settle(state, 700, fits);
    expect(DENSITIES[narrow.state.level]).toBe("menu");
  });

  it("가장 좁은 단계도 안 들어가면 거기서 버틴다(무한 루프 없음)", () => {
    const { state } = settle(initialFit, 400, fits);
    expect(state.level).toBe(DENSITIES.length - 1);
  });

  it("넓어지면 도로 올라간다", () => {
    const narrow = settle(initialFit, 700, fits).state;
    const wide = settle(narrow, 1600, fits);
    expect(DENSITIES[wide.state.level]).toBe("full");
  });

  it("한 번 넘친 폭을 기억해 같은 폭에서 안 흔들린다", () => {
    // 1000px: full 은 안 되고 icons 는 된다 → 한 번 올라가 봤다가 되돌아오는 것은 최초 1회뿐.
    const first = settle(initialFit, 1000, fits);
    expect(first.state.level).toBe(1);
    const again = settle(first.state, 1000, fits);
    expect(again.steps).toBe(0); // 두 번째부터는 아예 안 움직인다
    expect(again.state).toBe(first.state);
  });

  it("경계 폭(딱 들어가는 폭)에서는 올라간 채로 있는다", () => {
    const s = settle(initialFit, 1199, fits).state; // full 은 1200 이 필요하다
    expect(s.level).toBe(1);
    expect(settle(s, 1200, fits).state.level).toBe(0);
  });

  it("floor 는 관측 중 가장 넓은 값으로 남는다(좁은 관측이 덮어쓰지 않는다)", () => {
    let s = nextFit(initialFit, 1100, true); // floor[0] = 1100
    s = { ...s, level: 0 }; // 강제로 되올림(창을 넓혔다가 다시 줄인 상황)
    s = nextFit(s, 900, true); // 더 좁은 폭에서 또 넘침
    expect(s.floor[0]).toBe(1100);
  });
});
