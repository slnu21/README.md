// 경량 컨텍스트 메뉴(우클릭). 외부 클릭·Esc·항목 선택 시 닫힘.
import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // 뷰포트 밖으로 넘치지 않게 대략 클램프.
  const left = Math.min(x, window.innerWidth - 210);
  const top = Math.min(y, window.innerHeight - (items.length * 32 + 10));

  return (
    <div ref={ref} className="ctx-menu" style={{ left, top }} role="menu">
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          className={"ctx-item" + (it.danger ? " danger" : "")}
          onClick={() => {
            it.onClick();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
