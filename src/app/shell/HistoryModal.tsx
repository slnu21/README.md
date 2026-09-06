// 문서 기록 — 이 문서의 이전 판을 보고 되돌린다.
// 기록이 쌓이는 규칙과 상한은 Rust 쪽(commands/history.rs)에 있다. 여기는 보여 주고 고르는 일만.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { historyList, historyGet, historyRestore, type HistoryEntry } from "../lib/tauri";
import { useAppStore } from "../store";

export function HistoryModal({ path, onClose }: { path: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const showNotice = useAppStore((s) => s.showNotice);
  const openFile = useAppStore((s) => s.openFile);
  // 저장 안 한 편집이 있으면 되돌리기를 막는다 — 되돌리기는 디스크를 덮으므로 그 편집만
  // 되살릴 길이 없다(기록은 '저장된 것'만 안다).
  const dirty = useAppStore((s) => s.tabs.find((tb) => tb.path === path)?.dirty ?? false);

  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void historyList(path)
      .then((rows) => {
        if (!alive) return;
        setEntries(rows);
        if (rows.length > 0) setSelected(rows[0].id);
      })
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, [path]);

  useEffect(() => {
    if (selected == null) return;
    let alive = true;
    void historyGet(selected)
      .then((text) => alive && setPreview(text))
      .catch(() => alive && setPreview(""));
    return () => {
      alive = false;
    };
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const when = (ms: number) => new Date(ms).toLocaleString(i18n.language === "ko" ? "ko-KR" : "en-US");

  async function restore() {
    if (selected == null || busy) return;
    setBusy(true);
    try {
      const content = await historyRestore(selected);
      openFile(path, content); // 열린 탭을 그 자리에서 갱신(dirty 도 풀린다)
      showNotice(t("history.restored"));
      onClose();
    } catch (err) {
      showNotice(t("history.restoreFailed", { detail: String(err) }), "error");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal history-modal"
        role="dialog"
        aria-label={t("history.title")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="modal-title">{t("history.title")}</p>

        {entries === null ? (
          <p className="history-hint">{t("history.loading")}</p>
        ) : entries.length === 0 ? (
          <p className="history-hint">{t("history.empty")}</p>
        ) : (
          <div className="history-body">
            <ul className="history-list">
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={"history-item" + (e.id === selected ? " active" : "")}
                    onClick={() => setSelected(e.id)}
                  >
                    <span className="history-when">{when(e.mtime)}</span>
                    <span className="history-size">{Math.max(1, Math.round(e.bytes / 1024))} KB</span>
                  </button>
                </li>
              ))}
            </ul>
            <pre className="history-preview">{preview}</pre>
          </div>
        )}

        {dirty && <p className="history-hint warn">{t("history.dirty")}</p>}

        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={onClose}>
            {t("menu.cancel")}
          </button>
          <button
            type="button"
            className="modal-btn primary"
            disabled={selected == null || dirty || busy}
            onClick={() => void restore()}
          >
            {t("history.restore")}
          </button>
        </div>
      </div>
    </div>
  );
}
