// 단축키 도움말(F1 · 명령 팔레트). 목록은 features/editor/actions.ts 레지스트리에서 파생하므로
// 액션을 추가하면 여기 손대지 않아도 자동으로 나타난다(도움말이 낡아 거짓 안내가 되는 것을 구조적으로 막는다).
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  actionGroups,
  editorActions,
  inheritedShortcuts,
  keyHint,
  type ActionGroup,
} from "../features/editor/actions";

interface Row {
  label: string;
  hint: string;
}

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // F1 재입력으로도 닫힘(토글). 기본 도움말 동작은 억제.
      if (e.key === "Escape" || e.key === "F1") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 그룹별로 우리 액션 + 상류/전역 키를 합친다(둘의 출처 차이는 사용자에겐 의미 없다).
  const rowsOf = (g: ActionGroup): Row[] => [
    ...editorActions
      .filter((a) => a.group === g && a.key)
      // shift 짝이 있는 키(Tab/Shift+Tab)는 둘 다 보여야 한다 — 한쪽만 적으면 반쪽 안내가 된다.
      .map((a) => ({
        label: t(a.labelKey),
        hint: keyHint(a.shift ? `${a.key} / Shift-${a.key}` : a.key!),
      })),
    ...inheritedShortcuts
      .filter((s) => s.group === g)
      .map((s) => ({ label: t(s.labelKey), hint: keyHint(s.key) })),
  ];

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal keys-modal"
        role="dialog"
        aria-label={t("ed.title")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="modal-title">{t("ed.title")}</p>
        <div className="keys-grid">
          {actionGroups.map((g) => {
            const rows = rowsOf(g);
            if (!rows.length) return null;
            return (
              <section className="keys-group" key={g}>
                <h3 className="keys-group-title">{t(`ed.group.${g}`)}</h3>
                <dl className="keys-list">
                  {rows.map((r, i) => (
                    <div className="keys-row" key={i}>
                      <dt className="keys-label">{r.label}</dt>
                      <dd className="keys-hint">
                        {r.hint.split(" / ").map((k, j) => (
                          <span key={j}>
                            {j > 0 && <span className="keys-or">/</span>}
                            <kbd>{k}</kbd>
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
        <p className="modal-msg">{t("ed.note")}</p>
        <div className="modal-actions">
          <button type="button" className="modal-btn primary" onClick={onClose}>
            {t("ed.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
