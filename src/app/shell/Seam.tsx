// 편집/미리보기 분할 리사이저(기능 2). .split 컨테이너의 grid 비율을 드래그로 조정.
// 드래그 중엔 DOM 스타일을 직접 갱신(rAF)하고, 놓을 때만 store(splitRatio)에 커밋(persist).
import { useRef } from "react";
import { useAppStore } from "../store";

interface SeamProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  vertical: boolean; // 세로 스택(≤900px) 여부
}

export function Seam({ containerRef, vertical }: SeamProps) {
  const splitRatio = useAppStore((s) => s.splitRatio);
  const setSplitRatio = useAppStore((s) => s.setSplitRatio);
  const dragging = useRef(false);
  const raf = useRef(0);

  // 컨테이너 rect 대비 포인터 위치 → 에디터 비율(0~1).
  function ratioFrom(clientX: number, clientY: number): number {
    const el = containerRef.current;
    if (!el) return splitRatio;
    const rect = el.getBoundingClientRect();
    const raw = vertical ? (clientY - rect.top) / rect.height : (clientX - rect.left) / rect.width;
    return Math.min(0.8, Math.max(0.2, raw));
  }

  // 드래그 중 즉시 반영(React 리렌더 없이).
  function paint(r: number) {
    const el = containerRef.current;
    if (!el) return;
    const tmpl = `${r}fr 7px ${1 - r}fr`;
    if (vertical) {
      el.style.gridTemplateRows = tmpl;
      el.style.gridTemplateColumns = "1fr";
    } else {
      el.style.gridTemplateColumns = tmpl;
      el.style.gridTemplateRows = "";
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const r = ratioFrom(e.clientX, e.clientY);
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => paint(r));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (raf.current) cancelAnimationFrame(raf.current);
    setSplitRatio(ratioFrom(e.clientX, e.clientY)); // store에서 클램프 + persist
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = 0.03;
    const dec = vertical ? "ArrowUp" : "ArrowLeft";
    const inc = vertical ? "ArrowDown" : "ArrowRight";
    if (e.key === dec) {
      setSplitRatio(splitRatio - step);
      e.preventDefault();
    } else if (e.key === inc) {
      setSplitRatio(splitRatio + step);
      e.preventDefault();
    } else if (e.key === "Home" || e.key === "Enter") {
      setSplitRatio(0.5);
      e.preventDefault();
    }
  }

  return (
    <div
      className="seam"
      role="separator"
      tabIndex={0}
      aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-label="resize"
      aria-valuenow={Math.round(splitRatio * 100)}
      aria-valuemin={20}
      aria-valuemax={80}
      title="드래그로 폭 조정 · 더블클릭 시 초기화"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => setSplitRatio(0.5)}
      onKeyDown={onKeyDown}
    />
  );
}
