// 명령 팔레트 / 파일 퀵오픈 공용 오버레이(T2). 퍼지 검색 + 키보드 내비(↑↓·Enter·Esc).
// 항목은 부모(AppShell)가 모드별로 구성해 넘긴다. 실행 로직은 각 항목 run에 캡슐화.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fuzzyMatch } from "../lib/fuzzy";

export interface PaletteItem {
  id: string;
  label: string; // 주 텍스트(명령 라벨 / 파일명)
  sub?: string; // 부 텍스트(경로 / 카테고리)
  run: () => void;
}

const MAX = 50;

export function CommandPalette({
  items,
  placeholder,
  emptyText,
  onClose,
}: {
  items: PaletteItem[];
  placeholder: string;
  emptyText: string;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    if (!q.trim()) return items.slice(0, MAX).map((it) => ({ it, ranges: [] as [number, number][] }));
    const scored = [];
    for (const it of items) {
      const m = fuzzyMatch(q, it.label);
      if (m) scored.push({ it, score: m.score, ranges: m.ranges });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX);
  }, [q, items]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(i: number) {
    const r = results[i];
    if (!r) return;
    onClose();
    r.it.run();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      setActive((a) => Math.min(a + 1, results.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActive((a) => Math.max(a - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      choose(active);
      e.preventDefault();
    } else if (e.key === "Escape") {
      onClose();
      e.preventDefault();
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label={placeholder} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          value={q}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          aria-label={placeholder}
        />
        <ul className="palette-list" ref={listRef} role="listbox">
          {results.length === 0 ? (
            <li className="palette-empty">{emptyText}</li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.it.id}
                role="option"
                aria-selected={i === active}
                className={"palette-item" + (i === active ? " active" : "")}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(i);
                }}
              >
                <span className="palette-label">{highlight(r.it.label, r.ranges)}</span>
                {r.it.sub && <span className="palette-sub">{r.it.sub}</span>}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

/** 매칭 구간을 <mark>로 강조. */
function highlight(label: string, ranges: [number, number][]): ReactNode {
  if (!ranges.length) return label;
  const out: ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([s, e], idx) => {
    if (s > pos) out.push(label.slice(pos, s));
    out.push(<mark key={idx}>{label.slice(s, e)}</mark>);
    pos = e;
  });
  if (pos < label.length) out.push(label.slice(pos));
  return out;
}
