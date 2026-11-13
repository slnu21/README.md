// 표시 펜 사용 모드(설정) — 글을 드래그할 때마다 펜 트레이가 뜨는 것이 거슬린다는 실사용 피드백.
//
//   on   = 지금까지 그대로(드래그하면 트레이 · 여백 ＋)
//   view = 단 표시는 그대로 보이고 눌러 고치고 지울 수 있지만, **새로 다는 길**(드래그 트레이·여백 ＋)은 닫는다
//   off  = 표시·알약·레일까지 전부 숨긴다(저장된 표시는 지우지 않는다 — 다시 켜면 그대로)

export type AnnotMode = "on" | "view" | "off";
export const ANNOT_MODES: readonly AnnotMode[] = ["on", "view", "off"];

/** 드래그 트레이·여백 ＋ 로 새 표시를 다는가 */
export const canCreate = (m: AnnotMode): boolean => m === "on";
/** 표시를 그리고 알약·툴팁·레일·고치기를 보이는가 */
export const showsMarks = (m: AnnotMode): boolean => m !== "off";

/** 영속값이 낡았거나 손상됐으면 기본(on) */
export function parseAnnotMode(v: unknown): AnnotMode {
  return ANNOT_MODES.includes(v as AnnotMode) ? (v as AnnotMode) : "on";
}
