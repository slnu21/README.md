// 리딩 분할에서만 나타나는 패널 머리띠 — 어느 쪽이 무슨 문서인지 알려 주고 교체·닫기를 준다.
// 단일 패널일 때는 렌더하지 않는다(문서가 하나뿐이면 탭 표시로 충분하다).
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon";
import { showFullNameOnClip } from "../lib/hoverName";

interface PaneHeaderProps {
  title: string;
  onSwap: () => void;
  onClose?: () => void; // 두 번째 패널에만
}

export function PaneHeader({ title, onSwap, onClose }: PaneHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="pane-head">
      <span className="pane-title" onMouseEnter={(e) => showFullNameOnClip(e, title)}>
        {title}
      </span>
      <button type="button" className="pane-btn" title={t("view.swapPanes")} aria-label={t("view.swapPanes")} onClick={onSwap}>
        <Icon name="swap" />
      </button>
      {onClose && (
        <button type="button" className="pane-btn" title={t("view.closePane")} aria-label={t("view.closePane")} onClick={onClose}>
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}
