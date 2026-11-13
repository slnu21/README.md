import { describe, expect, it } from "vitest";
import { railFit } from "./railFit";

const base = { pad: 28, railW: 300, gap: 20, minCard: 480 };

describe("railFit", () => {
  it("카드와 레일이 둘 다 들어가면 카드 폭은 그대로 비키기만 한다", () => {
    expect(railFit({ ...base, viewW: 1600, natural: 860 })).toEqual({ fits: true, maxWidth: null });
  });

  it("경계 — 남는 폭이 카드 폭과 정확히 같으면 그대로 들어간다", () => {
    // 860 + 28 + 300 + 20 = 1208
    expect(railFit({ ...base, viewW: 1208, natural: 860 })).toEqual({ fits: true, maxWidth: null });
    expect(railFit({ ...base, viewW: 1207, natural: 860 })).toEqual({ fits: true, maxWidth: 859 });
  });

  it("리딩 폭 [넓게](카드가 창 전체)여도 카드를 좁혀 레일 자리를 만든다", () => {
    // 넓게 = max-width 없음 → 비키기 전 카드 폭 = 보이는 폭 - 여백
    expect(railFit({ ...base, viewW: 1900, natural: 1872 })).toEqual({ fits: true, maxWidth: 1552 });
  });

  it("배율 150% 화면 + 사이드바처럼 1,200px 가 안 되면 카드를 줄인다", () => {
    expect(railFit({ ...base, viewW: 1030, natural: 860 })).toEqual({ fits: true, maxWidth: 682 });
  });

  it("카드가 minCard 밑으로 내려가야 하면 펼치지 않는다(툴팁으로)", () => {
    // 480 + 348 = 828
    expect(railFit({ ...base, viewW: 828, natural: 860 })).toEqual({ fits: true, maxWidth: 480 });
    expect(railFit({ ...base, viewW: 827, natural: 860 })).toEqual({ fits: false });
  });

  it("좁은 리딩 폭(680)이 원래 들어가면 줄이지 않는다", () => {
    expect(railFit({ ...base, viewW: 1100, natural: 680 })).toEqual({ fits: true, maxWidth: null });
  });

  it("분수 폭은 내림 — 카드가 반 픽셀 넘쳐 레일을 덮지 않게", () => {
    const r = railFit({ ...base, viewW: 1000.6, natural: 900 });
    expect(r).toEqual({ fits: true, maxWidth: 652 });
  });
});
