// 메모 툴팁의 "머무름" 판정(순수). 실사용 신고: 메모 달린 곳에 마우스를 올려도 툴팁 보기가 힘들다.
//
// 원인은 판정 영역이 아니라 타이머였다 — mousemove 마다 450ms 타이머를 **처음부터 다시** 걸어서, 사람 손처럼
// 1px 이라도 흔들리면 영영 안 떴다(probe:annot 의 한 번짜리 mousemove 로는 안 보였다). 이제 타이머는
// **다른 표시로 넘어갈 때만** 다시 건다. 같은 표시 위의 움직임은 아무것도 바꾸지 않는다.

export interface HoverState {
  /** 타이머가 걸려 있는 표시(아직 안 뜸) */
  pending: string | null;
  /** 지금 떠 있는 툴팁의 표시 */
  shown: string | null;
}

export interface HoverStep {
  next: HoverState;
  /** 이 표시로 머무름 타이머를 (다시) 건다 */
  arm: string | null;
  /** 걸린 머무름 타이머를 푼다 */
  disarm: boolean;
  /** 떠 있는 툴팁 닫기를 예약한다(손을 툴팁으로 뻗을 시간) */
  leave: boolean;
  /** 예약된 닫기를 취소한다 */
  keep: boolean;
}

/**
 * @param hit 마우스 아래 표시 id(없으면 null)
 * @param eligible 그 표시에 툴팁이 있는가(메모가 있거나 바뀜)
 */
export function hoverStep(s: HoverState, hit: string | null, eligible: boolean): HoverStep {
  const id = hit && eligible ? hit : null;
  if (id && id === s.shown) return { next: { pending: null, shown: s.shown }, arm: null, disarm: s.pending != null, leave: false, keep: true };
  if (id && id === s.pending) return { next: s, arm: null, disarm: false, leave: false, keep: s.shown != null };
  if (id) return { next: { pending: id, shown: s.shown }, arm: id, disarm: false, leave: false, keep: s.shown != null };
  return { next: { pending: null, shown: s.shown }, arm: null, disarm: s.pending != null, leave: s.shown != null, keep: false };
}
