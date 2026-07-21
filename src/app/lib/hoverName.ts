import type { MouseEvent } from "react";

// 사이드바 항목 이름이 가로 스크롤 등으로 가시 영역을 벗어나 실제로 잘렸을 때만
// 네이티브 title을 세팅한다(잘리지 않았으면 지워 툴팁을 억제). 브라우저 기본
// 호버 지연(~0.5초)이 그대로 "일정시간 올리면 표시"를 충족한다.
export function showFullNameOnClip(e: MouseEvent<HTMLSpanElement>, full: string) {
  const el = e.currentTarget;
  const box = el.closest(".sidebar-body") as HTMLElement | null;
  if (!box) {
    el.title = full;
    return;
  }
  const n = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const visibleRight = b.left + box.clientWidth; // clientWidth: 세로 스크롤바 너비 제외
  const clipped = n.right > visibleRight + 0.5 || n.left < b.left - 0.5;
  el.title = clipped ? full : "";
}
