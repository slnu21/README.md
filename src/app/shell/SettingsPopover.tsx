// 설정 팝오버(기능 3·5·8 컨트롤 집약). 타이틀바 기어 버튼 → 작은 환경설정 패널.
// 외부 클릭·Esc 로 닫힘. 값은 store에 저장(localStorage 영속).
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store";
import { readFonts, monoFonts, uiFonts } from "../lib/fonts";
import { Icon } from "./Icon";

export function SettingsPopover() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fontRead = useAppStore((s) => s.fontRead);
  const fontMono = useAppStore((s) => s.fontMono);
  const fontUi = useAppStore((s) => s.fontUi);
  const editorZoom = useAppStore((s) => s.editorZoom);
  const previewZoom = useAppStore((s) => s.previewZoom);
  const syncScroll = useAppStore((s) => s.syncScroll);
  const readingWidth = useAppStore((s) => s.readingWidth);
  const setReadingWidth = useAppStore((s) => s.setReadingWidth);
  const autosave = useAppStore((s) => s.autosave);
  const setAutosave = useAppStore((s) => s.setAutosave);
  const setFontRead = useAppStore((s) => s.setFontRead);
  const setFontMono = useAppStore((s) => s.setFontMono);
  const setFontUi = useAppStore((s) => s.setFontUi);
  const setEditorZoom = useAppStore((s) => s.setEditorZoom);
  const setPreviewZoom = useAppStore((s) => s.setPreviewZoom);
  const setSyncScroll = useAppStore((s) => s.setSyncScroll);
  const setSplitRatio = useAppStore((s) => s.setSplitRatio);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pct = (z: number) => `${Math.round(z * 100)}%`;

  return (
    <div className="seg settings-wrap" ref={wrapRef}>
      <button
        type="button"
        aria-label={t("settings.open")}
        title={t("settings.open")}
        aria-expanded={open}
        aria-pressed={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="gear" />
      </button>

      {open && (
        <div className="settings-pop" role="dialog" aria-label={t("settings.title")}>
          <label className="set-row">
            <span>{t("settings.readFont")}</span>
            <select value={fontRead} onChange={(e) => setFontRead(e.target.value)}>
              {readFonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <label className="set-row">
            <span>{t("settings.editorFont")}</span>
            <select value={fontMono} onChange={(e) => setFontMono(e.target.value)}>
              {monoFonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <label className="set-row">
            <span>{t("settings.uiFont")}</span>
            <select value={fontUi} onChange={(e) => setFontUi(e.target.value)}>
              {uiFonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <div className="set-row">
            <span>{t("settings.editorZoom")}</span>
            <div className="stepper">
              <button type="button" onClick={() => setEditorZoom(editorZoom - 0.1)} aria-label="−">
                −
              </button>
              <b>{pct(editorZoom)}</b>
              <button type="button" onClick={() => setEditorZoom(editorZoom + 0.1)} aria-label="+">
                +
              </button>
            </div>
          </div>

          <div className="set-row">
            <span>{t("settings.previewZoom")}</span>
            <div className="stepper">
              <button type="button" onClick={() => setPreviewZoom(previewZoom - 0.1)} aria-label="−">
                −
              </button>
              <b>{pct(previewZoom)}</b>
              <button type="button" onClick={() => setPreviewZoom(previewZoom + 0.1)} aria-label="+">
                +
              </button>
            </div>
          </div>

          <div className="set-row">
            <span>{t("view.readingWidth")}</span>
            <div className="seg width" role="group" aria-label={t("view.readingWidth")}>
              {(["narrow", "normal", "wide"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={readingWidth === w}
                  onClick={() => setReadingWidth(w)}
                >
                  {t(w === "narrow" ? "view.widthNarrow" : w === "wide" ? "view.widthWide" : "view.widthNormal")}
                </button>
              ))}
            </div>
          </div>

          <label className="set-row toggle">
            <span>{t("settings.syncScroll")}</span>
            <input
              type="checkbox"
              checked={syncScroll}
              onChange={(e) => setSyncScroll(e.target.checked)}
            />
          </label>

          <label className="set-row toggle">
            <span>{t("settings.autosave")}</span>
            <input
              type="checkbox"
              checked={autosave}
              onChange={(e) => setAutosave(e.target.checked)}
            />
          </label>

          <button type="button" className="set-reset" onClick={() => setSplitRatio(0.5)}>
            {t("settings.resetSplit")}
          </button>
        </div>
      )}
    </div>
  );
}
