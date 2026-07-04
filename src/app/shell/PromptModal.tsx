// 이름 입력 모달(폴더 생성·이름 변경). WebView2에서 window.prompt가 불안정해 자체 모달 사용.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface PromptSpec {
  title: string;
  initial?: string;
  okLabel?: string;
  onOk: (value: string) => void;
}

export function PromptModal({ spec, onClose }: { spec: PromptSpec; onClose: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(spec.initial ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function submit() {
    const v = value.trim();
    if (v) spec.onOk(v);
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label={spec.title} onMouseDown={(e) => e.stopPropagation()}>
        <p className="modal-title">{spec.title}</p>
        <input
          ref={inputRef}
          className="modal-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            else if (e.key === "Escape") onClose();
          }}
        />
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={onClose}>
            {t("menu.cancel")}
          </button>
          <button type="button" className="modal-btn primary" onClick={submit}>
            {spec.okLabel ?? t("menu.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
