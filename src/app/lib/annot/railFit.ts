// 메모 레일 자리 — 본문 카드를 어떻게 비켜야 오른쪽에 레일이 들어가는지 정한다(순수 판정).
//
// 처음엔 "카드를 그대로 두고 남는 폭에 레일이 들어가면 펼친다"였다. 그런데 리딩 폭 [넓게]는 카드에
// max-width 가 없어 카드가 늘 창 전체라 **어떤 창에서도** 안 들어갔고, 기본 860px 도 배율 150% 화면·
// 사이드바·리딩 분할에선 1,200px 가까이를 요구해 "화면이 넓은데 좁다"가 됐다. 카드를 좁혀서라도
// 레일을 놓는다 — 단 읽기가 무너지는 폭(minCard) 밑으로는 안 좁히고 툴팁으로 돌아간다.

export interface RailFitInput {
  /** iframe 문서의 보이는 폭(스크롤바 제외) */
  viewW: number;
  /** body 좌우 여백 합 */
  pad: number;
  /** 비키기 전 카드 폭(리딩 폭 설정이 정한 그대로) */
  natural: number;
  railW: number;
  gap: number;
  /** 이보다 좁게는 카드를 안 줄인다 */
  minCard: number;
}

export type RailFit = { fits: false } | { fits: true; /** null = 카드 폭 그대로 비키기만 */ maxWidth: number | null };

export function railFit(o: RailFitInput): RailFit {
  const avail = Math.floor(o.viewW - o.pad - o.railW - o.gap);
  if (o.natural <= avail) return { fits: true, maxWidth: null };
  if (avail >= o.minCard) return { fits: true, maxWidth: avail };
  return { fits: false };
}
