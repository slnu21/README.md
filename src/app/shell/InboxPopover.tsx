// 받은 문서함 — 알림 종.
//
// **사이드바 탭이 아니라 종인 이유**: 워크스페이스·최근은 *탐색하는 자리*지만 이건 *소식*이다.
// 읽고 나면 비는 목록에 탐색 탭과 같은 자리를 줄 이유가 없고, 탭을 셋으로 늘리면 한국어
// 라벨이 248px 사이드바에서 잘린다. 종은 어느 탭을 보고 있든 눈에 띈다는 이점도 있다.
//
// 무엇이 담기는지·언제 비는지의 규칙은 Rust 쪽(commands/inbox.rs). 여기는 보여 주고 여는 일만.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { inboxMarkAllSeen, readFile } from "../lib/tauri";
import { useAppStore } from "../store";
import { Icon } from "./Icon";

export function InboxPopover() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inbox = useAppStore((s) => s.inbox);
  const total = useAppStore((s) => s.inboxTotal);
  const setInbox = useAppStore((s) => s.setInbox);
  const openFile = useAppStore((s) => s.openFile);
  const showNotice = useAppStore((s) => s.showNotice);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // **"비면 자동으로 닫는다"를 넣지 말 것.** 목록이 원래 0일 때 여는 순간 같이 걸려서
  // 종을 눌러도 아무 일이 안 일어나는 것처럼 보인다(실제로 그렇게 내보냈다가 바로 잡혔다).
  // 마지막 항목을 열거나 [모두 읽음] 을 누르는 경우는 그 자리에서 이미 닫고 있다.
  const when = (ms: number) =>
    new Date(ms).toLocaleString(i18n.language === "ko" ? "ko-KR" : "en-US", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  async function openDoc(path: string) {
    try {
      openFile(path, await readFile(path)); // 여는 순간 '본 것'이 되어 목록에서 빠진다
      setOpen(false);
    } catch (e) {
      showNotice(t("inbox.openFailed", { detail: String(e) }), "error");
    }
  }

  function markAll() {
    setInbox([], 0); // 낙관적 — 누르자마자 배지가 사라져야 자연스럽다
    void inboxMarkAllSeen().catch(() => {});
    setOpen(false);
  }

  return (
    <div className="seg inbox-wrap" ref={wrapRef}>
      <button
        type="button"
        className={"inbox-bell" + (total > 0 ? " has-unread" : "")}
        aria-label={t("inbox.title")}
        title={total > 0 ? t("inbox.titleCount", { count: total }) : t("inbox.title")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" />
        {total > 0 && <span className="inbox-count">{total > 99 ? "99+" : total}</span>}
      </button>

      {open && (
        <div className="inbox-pop" role="dialog" aria-label={t("inbox.title")}>
          <div className="inbox-head">
            <span className="inbox-heading">{t("inbox.title")}</span>
            {inbox.length > 0 && (
              <button type="button" className="inbox-mark" onClick={markAll}>
                {t("inbox.markAll")}
              </button>
            )}
          </div>
          <p className="inbox-note">{t("inbox.what")}</p>

          {inbox.length === 0 ? (
            <p className="inbox-note dim">{t("inbox.empty")}</p>
          ) : (
            <ul className="inbox-list">
              {inbox.map((it) => (
                <li key={it.realPath}>
                  <button type="button" className="inbox-item" title={it.realPath} onClick={() => void openDoc(it.realPath)}>
                    <span className="inbox-name">{it.name}</span>
                    <span className="inbox-meta">
                      <span className={"inbox-kind" + (it.isNew ? " is-new" : "")}>
                        {t(it.isNew ? "inbox.new" : "inbox.changed")}
                      </span>
                      <span className="inbox-when">{when(it.mtime)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
