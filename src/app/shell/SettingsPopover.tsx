// 설정 팝오버(기능 3·5·8 컨트롤 집약). 타이틀바 기어 버튼 → 작은 환경설정 패널.
// 외부 클릭·Esc 로 닫힘. 값은 store에 저장(localStorage 영속).
//
// 테마 관련 버튼 넷(파일·폴더·다시 불러오기·내보내기)은 **테마 고르기 창**으로 옮겼다
// (ThemePicker.tsx) — 고르는 자리와 만드는 자리가 갈려 있으면 "내가 만든 테마가 어디 있나"를
// 두 군데서 찾게 된다. 여기 남은 것은 그 창을 여는 문 하나다.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store";
import { readFonts, monoFonts, uiFonts } from "../lib/fonts";
import { Icon } from "./Icon";
import { AgentBridgePanel } from "./AgentBridgePanel";

export function SettingsPopover({ onOpenThemes }: { onOpenThemes: () => void }) {
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
  const diagramWidth = useAppStore((s) => s.diagramWidth);
  const setDiagramWidth = useAppStore((s) => s.setDiagramWidth);
  const previewDelay = useAppStore((s) => s.previewDelay);
  const setPreviewDelay = useAppStore((s) => s.setPreviewDelay);
  const textDirection = useAppStore((s) => s.textDirection);
  const setTextDirection = useAppStore((s) => s.setTextDirection);
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
            <span>{t("settings.previewDelay")}</span>
            <div className="seg width" role="group" aria-label={t("settings.previewDelay")}>
              {([200, 500, 1000] as const).map((ms) => (
                <button
                  key={ms}
                  type="button"
                  aria-pressed={previewDelay === ms}
                  onClick={() => setPreviewDelay(ms)}
                >
                  {t(ms === 200 ? "settings.delayFast" : ms === 1000 ? "settings.delayRelaxed" : "settings.delayNormal")}
                </button>
              ))}
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

          <div className="set-row">
            <span>{t("settings.textDirection")}</span>
            <div className="seg width" role="group" aria-label={t("settings.textDirection")}>
              {(["auto", "ltr", "rtl"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={textDirection === d}
                  onClick={() => setTextDirection(d)}
                  title={t(d === "auto" ? "settings.dirAutoHint" : d === "rtl" ? "settings.dirRtlHint" : "settings.dirLtrHint")}
                >
                  {t(d === "auto" ? "settings.dirAuto" : d === "rtl" ? "settings.dirRtl" : "settings.dirLtr")}
                </button>
              ))}
            </div>
          </div>

          <div className="set-row">
            <span>{t("settings.diagramWidth")}</span>
            <div className="seg width" role="group" aria-label={t("settings.diagramWidth")}>
              {(["fit", "natural"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={diagramWidth === w}
                  onClick={() => setDiagramWidth(w)}
                >
                  {t(w === "fit" ? "settings.diagramFit" : "settings.diagramNatural")}
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

          {/* 테마를 고르고 만드는 입구. 색을 직접 정하는 길(파일)도 저 창 안에 있다 —
              인앱 색상 피커를 안 넣은 이유는 항목이 23개라 팝오버가 두 배가 되기 때문이고,
              파일 안 주석이 그대로 설명서 역할을 한다. */}
          <button
            type="button"
            className="set-reset"
            onClick={() => {
              setOpen(false); // 창이 뜨면 이 팝오버는 뒤에 가린다 — 남겨 두면 유령이 된다
              onOpenThemes();
            }}
          >
            {t("settings.themes")}
          </button>

          <AgentBridgePanel />
        </div>
      )}
    </div>
  );
}
