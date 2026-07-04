// 미저장 변경 확인 다이얼로그(창 닫기·탭 닫기 공용). 저장 / 저장 안 함 / 취소 3버튼.
// WebView2 window.confirm이 불안정해 자체 모달 사용(PromptModal과 동일 스타일).
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export interface ConfirmSpec {
  title: string;
  message?: string;
  saveLabel?: string;
  discardLabel?: string;
  onSave: () => void; // 저장 후 진행(닫기)
  onDiscard: () => void; // 저장 없이 진행(닫기)
  onCancel?: () => void; // 취소(그대로 유지)
}

export function ConfirmDialog({ spec, onClose }: { spec: ConfirmSpec; onClose: () => void }) {
  const { t } = useTranslation();

  function cancel() {
    spec.onCancel?.();
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={cancel}>
      <div className="modal" role="alertdialog" aria-label={spec.title} onMouseDown={(e) => e.stopPropagation()}>
        <p className="modal-title">{spec.title}</p>
        {spec.message && <p className="modal-msg">{spec.message}</p>}
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={cancel}>
            {t("menu.cancel")}
          </button>
          <button
            type="button"
            className="modal-btn danger"
            onClick={() => {
              spec.onDiscard();
              onClose();
            }}
          >
            {spec.discardLabel ?? t("dialog.discardClose")}
          </button>
          <button
            type="button"
            className="modal-btn primary"
            onClick={() => {
              spec.onSave();
              onClose();
            }}
          >
            {spec.saveLabel ?? t("dialog.saveAndClose")}
          </button>
        </div>
      </div>
    </div>
  );
}
