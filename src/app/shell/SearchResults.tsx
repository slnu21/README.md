// 전역 검색 결과 오버레이(타이틀바 검색창 아래 드롭다운).
// Rust snippet()이 매치를 센티넬 문자(STX=char(2), ETX=char(3))로 감싸 반환 →
// 여기서 텍스트로 분해해 <mark>로 강조(HTML 주입이 아님).
import { useTranslation } from "react-i18next";
import type { SearchHit } from "../lib/tauri";

const MARK_START = String.fromCharCode(2);
const MARK_END = String.fromCharCode(3);

function renderSnippet(snippet: string): { text: string; mark: boolean }[] {
  const parts: { text: string; mark: boolean }[] = [];
  let mark = false;
  let buf = "";
  for (const ch of snippet) {
    if (ch === MARK_START) {
      if (buf) parts.push({ text: buf, mark });
      buf = "";
      mark = true;
    } else if (ch === MARK_END) {
      if (buf) parts.push({ text: buf, mark });
      buf = "";
      mark = false;
    } else {
      buf += ch;
    }
  }
  if (buf) parts.push({ text: buf, mark });
  return parts;
}

export function SearchResults({
  hits,
  loading,
  onPick,
}: {
  hits: SearchHit[];
  loading: boolean;
  onPick: (hit: SearchHit) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="search-results" role="listbox">
      {loading ? (
        <p className="sr-empty">{t("search.searching")}</p>
      ) : hits.length === 0 ? (
        <p className="sr-empty">{t("search.noResults")}</p>
      ) : (
        <ul>
          {hits.map((h) => (
            <li key={h.realPath}>
              <button type="button" className="sr-hit" onClick={() => onPick(h)} title={h.realPath}>
                <span className="sr-name">{h.name}</span>
                <span className="sr-snippet">
                  {renderSnippet(h.snippet).map((p, i) =>
                    p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>,
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
