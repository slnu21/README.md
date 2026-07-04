// 아웃라인 우측 오버레이(요청 2). 미리보기 우측 끝에 얹혀 평소엔 얇은 탭만,
// 마우스 올리면 패널이 슬라이드 인. 열림 고정(pin)·배경 투명도 조절 지원.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TocItem } from "../lib/markdown";
import { useAppStore } from "../store";
import { Icon } from "./Icon";

export function OutlineOverlay({
  items,
  onSelect,
}: {
  items: TocItem[];
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const pinned = useAppStore((s) => s.outlinePinned);
  const opacity = useAppStore((s) => s.outlineOpacity);
  const setPinned = useAppStore((s) => s.setOutlinePinned);
  const setOpacity = useAppStore((s) => s.setOutlineOpacity);
  const [hovering, setHovering] = useState(false);

  if (items.length === 0) return null;
  const open = pinned || hovering;
  const min = Math.min(...items.map((it) => it.level));
  // 배경만 투명도 조절(텍스트는 유지) → 본문 위로 비쳐 보이게.
  const panelBg = `color-mix(in srgb, var(--surface) ${Math.round(opacity * 100)}%, transparent)`;

  return (
    <div className="outline-ov">
      <div
        className={"outline-ov-inner" + (open ? " open" : "")}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <div className="outline-ov-tab" aria-hidden={open}>
          <Icon name="list" />
        </div>

        <aside className="outline-ov-panel" style={{ background: panelBg }} aria-label={t("settings.outline")}>
          <div className="outline-ov-head">
            <span className="outline-ov-title">{t("settings.outline")}</span>
            <input
              className="outline-ov-op"
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={opacity}
              title={t("settings.opacity")}
              aria-label={t("settings.opacity")}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
            <button
              type="button"
              className={"outline-ov-pin" + (pinned ? " on" : "")}
              aria-pressed={pinned}
              title={t("settings.pin")}
              aria-label={t("settings.pin")}
              onClick={() => setPinned(!pinned)}
            >
              <Icon name="pin" />
            </button>
          </div>
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
        </aside>
      </div>
    </div>
  );
}
