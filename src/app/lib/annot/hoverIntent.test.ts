import { describe, expect, it } from "vitest";
import { hoverStep, type HoverState } from "./hoverIntent";

const idle: HoverState = { pending: null, shown: null };

describe("hoverStep", () => {
  it("표시에 올라가면 타이머를 건다", () => {
    const r = hoverStep(idle, "a", true);
    expect(r.arm).toBe("a");
    expect(r.next).toEqual({ pending: "a", shown: null });
  });

  it("같은 표시 위에서 흔들리면 타이머를 다시 걸지 않는다(신고된 결함)", () => {
    let s = hoverStep(idle, "a", true).next;
    for (let i = 0; i < 10; i++) {
      const r = hoverStep(s, "a", true);
      expect(r.arm).toBeNull();
      expect(r.disarm).toBe(false);
      s = r.next;
    }
    expect(s.pending).toBe("a");
  });

  it("다른 표시로 넘어가면 그 표시로 다시 건다", () => {
    const s = hoverStep(idle, "a", true).next;
    expect(hoverStep(s, "b", true).arm).toBe("b");
  });

  it("뜬 툴팁의 표시 위에서는 닫기 예약을 취소하고 아무것도 다시 걸지 않는다", () => {
    const r = hoverStep({ pending: null, shown: "a" }, "a", true);
    expect(r).toMatchObject({ arm: null, leave: false, keep: true });
  });

  it("표시 밖으로 나가면 걸린 타이머는 풀고, 뜬 툴팁은 바로 닫지 않고 닫기를 예약한다", () => {
    expect(hoverStep({ pending: "a", shown: null }, null, false)).toMatchObject({ disarm: true, leave: false });
    expect(hoverStep({ pending: null, shown: "a" }, null, false)).toMatchObject({ disarm: false, leave: true });
  });

  it("툴팁이 없는 표시(메모 없음)는 표시 밖과 같다", () => {
    const r = hoverStep({ pending: "a", shown: null }, "b", false);
    expect(r).toMatchObject({ arm: null, disarm: true });
    expect(r.next.pending).toBeNull();
  });

  it("툴팁이 떠 있는 채 다른 표시로 가면 닫기를 취소하고 새 표시로 건다(깜빡이지 않게)", () => {
    const r = hoverStep({ pending: null, shown: "a" }, "b", true);
    expect(r).toMatchObject({ arm: "b", keep: true, leave: false });
  });
});
