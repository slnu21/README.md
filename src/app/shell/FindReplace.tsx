// 워크스페이스 전역 찾기·바꾸기(T3). 디스크 다중 파일을 실제 수정 → 안전장치 필수:
//  · 미리보기(매칭 파일·개수·라인) · 파일별 선택(기본=현재 파일만) · 확인 다이얼로그(파괴적).
// 검색/치환 모두 프런트 JS 정규식으로 처리(미리보기와 실제 적용의 의미 일치). 대상=워크스페이스 문서 파일.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { readFile, writeFile } from "../lib/tauri";
import { useAppStore } from "../store";
import { ConfirmDialog, type ConfirmSpec } from "./ConfirmDialog";

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

interface MatchLine {
  lineNo: number;
  text: string;
  ranges: [number, number][];
}
interface FileResult {
  path: string;
  name: string;
  content: string;
  matches: MatchLine[];
  count: number;
}

const MAX_LINES_SHOWN = 30; // 파일당 표시할 매칭 라인 상한

/** 정규식 소스/플래그 빌드. 리터럴 모드는 특수문자 이스케이프. 오류 시 throw. */
function buildRegex(query: string, useRegex: boolean, caseSensitive: boolean): RegExp {
  const source = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(source, "g" + (caseSensitive ? "" : "i"));
}

function findMatches(content: string, re: RegExp): { lines: MatchLine[]; count: number } {
  const lines = content.split("\n");
  const out: MatchLine[] = [];
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const lre = new RegExp(re.source, re.flags);
    const ranges: [number, number][] = [];
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = lre.exec(text)) && guard++ < 2000) {
      if (m[0] === "") {
        lre.lastIndex++; // 빈 매치 무한루프 방지
        continue;
      }
      ranges.push([m.index, m.index + m[0].length]);
      count++;
    }
    if (ranges.length) out.push({ lineNo: i + 1, text, ranges });
  }
  return { lines: out, count };
}

export function FindReplace({
  files,
  activePath,
  onClose,
}: {
  files: string[];
  activePath: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [replace, setReplace] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirm) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirm, onClose]);

  async function runSearch() {
    if (!query) {
      setResults(null);
      setError(null);
      return;
    }
    let re: RegExp;
    try {
      re = buildRegex(query, useRegex, caseSensitive);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setResults(null);
      return;
    }
    setError(null);
    setBusy(true);
    // 열린 탭은 (미저장 편집 포함) 에디터의 현재 내용을 대상으로 → 편집 유실 방지.
    const openContent = new Map(useAppStore.getState().tabs.map((tb) => [tb.path, tb.content]));
    const out: FileResult[] = [];
    for (const path of files) {
      let content: string | undefined = openContent.get(path);
      if (content === undefined) {
        try {
          content = await readFile(path);
        } catch {
          continue; // 사라진 파일 등은 건너뜀
        }
      }
      const { lines, count } = findMatches(content, re);
      if (count) out.push({ path, name: baseName(path), content, matches: lines, count });
    }
    setBusy(false);
    setResults(out);
    // 기본 선택 = 현재 파일만(안전하게 좁게 시작 → 사용자가 확장).
    const sel = new Set<string>();
    if (activePath && out.some((f) => f.path === activePath)) sel.add(activePath);
    setSelected(sel);
  }

  function toggle(path: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }
  function setAll(on: boolean) {
    setSelected(on && results ? new Set(results.map((f) => f.path)) : new Set());
  }

  const selectedFiles = results?.filter((f) => selected.has(f.path)) ?? [];
  const selMatchCount = selectedFiles.reduce((n, f) => n + f.count, 0);

  function requestReplace() {
    if (!selectedFiles.length) return;
    setConfirm({
      title: t("find.replaceTitle"),
      message: t("find.replaceConfirm", { matches: selMatchCount, files: selectedFiles.length }),
      saveLabel: t("find.doReplace"),
      danger: true,
      onSave: () => void applyReplace(),
    });
  }

  async function applyReplace() {
    let re: RegExp;
    try {
      re = buildRegex(query, useRegex, caseSensitive);
    } catch {
      return;
    }
    // 리터럴 모드는 치환문의 $ 를 리터럴로($$), 정규식 모드는 $1 등 허용.
    const repl = useRegex ? replace : replace.replace(/\$/g, "$$$$");
    for (const f of selectedFiles) {
      const next = f.content.replace(new RegExp(re.source, re.flags), repl);
      if (next === f.content) continue;
      try {
        await writeFile(f.path, next);
        useAppStore.getState().reloadFile(f.path, next); // 열린 탭이면 반영(없으면 no-op)
      } catch (e) {
        console.error("바꾸기 실패:", f.path, e);
      }
    }
    onClose();
  }

  return (
    <div className="fr-backdrop" onMouseDown={onClose}>
      <div className="findrep" role="dialog" aria-label={t("find.title")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="fr-head">
          <div className="fr-fields">
            <input
              ref={inputRef}
              className="fr-input"
              value={query}
              placeholder={t("find.findPlaceholder")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
            />
            <input
              className="fr-input"
              value={replace}
              placeholder={t("find.replacePlaceholder")}
              onChange={(e) => setReplace(e.target.value)}
            />
          </div>
          <div className="fr-opts">
            <button type="button" className={"fr-opt" + (useRegex ? " on" : "")} aria-pressed={useRegex} title={t("find.regex")} onClick={() => setUseRegex((v) => !v)}>
              .*
            </button>
            <button type="button" className={"fr-opt" + (caseSensitive ? " on" : "")} aria-pressed={caseSensitive} title={t("find.caseSensitive")} onClick={() => setCaseSensitive((v) => !v)}>
              Aa
            </button>
            <button type="button" className="fr-search" onClick={() => void runSearch()} disabled={!query || busy}>
              {t("find.search")}
            </button>
          </div>
        </div>

        {error && <p className="fr-error">{error}</p>}

        <div className="fr-status">
          {busy
            ? t("find.searching")
            : results == null
              ? t("find.hint")
              : results.length === 0
                ? t("find.none")
                : t("find.summary", {
                    matches: results.reduce((n, f) => n + f.count, 0),
                    files: results.length,
                  })}
          {results && results.length > 0 && (
            <span className="fr-selall">
              <button type="button" onClick={() => setAll(true)}>{t("find.selectAll")}</button>
              <button type="button" onClick={() => setAll(false)}>{t("find.selectNone")}</button>
            </span>
          )}
        </div>

        <div className="fr-results">
          {results?.map((f) => (
            <div key={f.path} className="fr-file">
              <label className="fr-file-head">
                <input type="checkbox" checked={selected.has(f.path)} onChange={() => toggle(f.path)} />
                <span className="fr-file-name">{f.name}</span>
                <span className="fr-file-count">{f.count}</span>
                <span className="fr-file-path">{f.path}</span>
              </label>
              <div className="fr-lines">
                {f.matches.slice(0, MAX_LINES_SHOWN).map((ml) => (
                  <div key={ml.lineNo} className="fr-line">
                    <span className="fr-lineno">{ml.lineNo}</span>
                    <span className="fr-linetext">{highlightLine(ml.text, ml.ranges)}</span>
                  </div>
                ))}
                {f.matches.length > MAX_LINES_SHOWN && (
                  <div className="fr-more">+{f.matches.length - MAX_LINES_SHOWN}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="fr-foot">
          <span className="fr-warn">{t("find.warn")}</span>
          <button type="button" className="fr-cancel" onClick={onClose}>
            {t("menu.cancel")}
          </button>
          <button type="button" className="fr-apply" onClick={requestReplace} disabled={!selectedFiles.length}>
            {t("find.replaceSelected", { files: selectedFiles.length })}
          </button>
        </div>
      </div>
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

/** 라인에서 매칭 구간을 <mark>로 강조. */
function highlightLine(text: string, ranges: [number, number][]): ReactNode {
  const out: ReactNode[] = [];
  let pos = 0;
  const LEAD = 24; // 첫 매치 앞 컨텍스트 최대 길이(긴 줄 트림)
  const start = ranges.length && ranges[0][0] > LEAD ? ranges[0][0] - LEAD : 0;
  if (start > 0) out.push("…");
  pos = start;
  ranges.forEach(([s, e], i) => {
    if (s > pos) out.push(text.slice(pos, s));
    out.push(<mark key={i}>{text.slice(s, e)}</mark>);
    pos = e;
  });
  out.push(text.slice(pos, pos + 200));
  return out;
}
