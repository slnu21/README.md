// 툴바 밀도 사다리 — 좁아지면 무엇을 접을지 정하는 순수 로직.
//
// 왜 CSS 중단점이 아닌가: 툴바에 들어가는 것의 자연폭이 **고정이 아니다**. 한국어와 영어의
// 라벨 폭이 다르고("파일 열기" vs "Open File"), 글꼴은 설정에서 바뀌며, 화면 배율도 있다.
// 하나의 px 중단점은 그중 한 조합에서만 맞는다 — 실제로 1024px 중단점을 두고도 1120px 창에서
// 라벨이 서로 겹쳤다(v0.9.0). 그래서 **재 보고 정한다**.
//
// 접는 순서는 "덜 잃는 쪽부터"다: 글자(라벨)를 먼저 버리고, 그래도 모자라면 버튼들을 메뉴
// 하나로 접는다. 아이콘 버튼은 눌러 보면 알지만, 메뉴는 열어야 알기 때문이다.

/** 왼쪽이 가장 넉넉하다. 색인이 곧 단계 번호다. */
export const DENSITIES = ["full", "icons", "menu"] as const;
export type Density = (typeof DENSITIES)[number];

export interface FitState {
  /** 지금 단계(DENSITIES 색인). */
  level: number;
  /** floor[l] = 그 단계가 **넘치는 것을 실제로 본** 가장 넓은 폭.
   *  이 값보다 넓어지기 전에는 그 단계로 다시 안 올라간다 — 이 기억이 곧 이력현상이다.
   *  없으면(관측 전) 낙관적으로 한 번 올라가 보고, 넘치면 그때 적어 두고 도로 내려온다. */
  floor: number[];
}

export const initialFit: FitState = { level: 0, floor: [] };

/** 아이템 자연폭 + 사이 간격 + 안쪽 여백. 컨테이너의 clientWidth 와 같은 축으로 잰다
 *  (clientWidth 는 padding 을 포함하고 border 를 뺀다 → 여기도 padding 을 더한다). */
export function requiredWidth(widths: number[], gap: number, padding: number): number {
  if (widths.length === 0) return padding;
  const sum = widths.reduce((a, b) => a + b, 0);
  return sum + gap * (widths.length - 1) + padding;
}

/** 한 번의 관측을 반영한다.
 *
 *  **바뀔 것이 없으면 받은 상태를 그대로 돌려준다** — 이게 계약이다. 새 객체를 만들면
 *  setState → 렌더 → 다시 측정 → setState … 로 렌더 루프가 돈다(측정이 렌더마다 돌기 때문).
 *
 *  한 번의 관측은 한 칸만 움직인다. 두 칸을 내려가야 하는 폭이라도 다음 렌더에서 다시 재므로
 *  두 프레임 안에 도착한다. 올라갈 때는 낙관적으로 한 칸 올라갔다가 넘치면 되돌아오는데,
 *  그 폭을 floor 에 적어 두므로 **같은 폭에서 두 번은 안 흔들린다**. */
export function nextFit(state: FitState, width: number, overflowing: boolean): FitState {
  const last = DENSITIES.length - 1;
  if (overflowing) {
    if (state.level >= last) return state; // 더 접을 것이 없다 — 넘치는 채로 둔다
    const floor = state.floor.slice();
    floor[state.level] = Math.max(floor[state.level] ?? Number.NEGATIVE_INFINITY, width);
    return { level: state.level + 1, floor };
  }
  if (state.level > 0) {
    const need = state.floor[state.level - 1];
    if (need === undefined || width > need) return { level: state.level - 1, floor: state.floor };
  }
  return state;
}
