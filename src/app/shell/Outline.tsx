// 문서 아웃라인(헤딩 TOC) 사이드바 섹션. 클릭 시 미리보기 iframe을 해당 헤딩으로 스크롤한다.
import type { TocItem } from "../lib/markdown";

export function Outline({ items, onSelect }: { items: TocItem[]; onSelect: (id: string) => void }) {
  if (items.length === 0) return <p className="tree-hint">—</p>;
  const min = Math.min(...items.map((it) => it.level));
  return (
    <ul className="outline">
      {items.map((it, i) => (
        <li key={`${it.id}-${i}`}>
          <button
            type="button"
            className="outline-item"
            style={{ paddingLeft: `${8 + (it.level - min) * 13}px` }}
            title={it.text}
            onClick={() => onSelect(it.id)}
          >
            {it.text}
          </button>
        </li>
      ))}
    </ul>
  );
}
