// 설정 팝오버(기능 3·5·8 컨트롤 집약). 타이틀바 기어 버튼 → 작은 환경설정 패널.
// 외부 클릭·Esc 로 닫힘. 값은 store에 저장(localStorage 영속).
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store";
import { ensureThemeFile, loadUserThemes, openThemeFolder } from "../themes/load";
import { buildThemePack } from "../themes/custom";
import { themes } from "../themes";
import { openWithDefault, revealInExplorer, saveFile, writeFile } from "../lib/tauri";
import { readFonts, monoFonts, uiFonts } from "../lib/fonts";
import { Icon } from "./Icon";

export function SettingsPopover() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const showNotice = useAppStore((s) => s.showNotice);
  const themeId = useAppStore((s) => s.themeId);
  const themeRev = useAppStore((s) => s.themeRev);
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

  // 테마 파일 열기: 없으면 주석 달린 템플릿을 만들고 기본 편집기로 열어 준다.
  // 연결된 프로그램이 없거나 거절되면 탐색기에서 위치를 여는 것으로 떨어진다(항상 동작한다).
  async function openThemeFile(): Promise<void> {
    try {
      const path = await ensureThemeFile();
      await openWithDefault(path).catch(() => revealInExplorer(path));
    } catch (e) {
      showNotice(t("theme.fileFailed", { detail: String(e) }), "error");
    }
  }

  // 폴더를 탐색기에서 연다. 여기 *.jsonc 를 떨어뜨리는 것이 곧 "가져오기"라
  // 별도 가져오기 대화상자를 두지 않았다 — 이 버튼이 그 경로를 발견 가능하게 만든다.
  async function revealThemeFolder(): Promise<void> {
    try {
      await openThemeFolder();
    } catch (e) {
      showNotice(t("theme.fileFailed", { detail: String(e) }), "error");
    }
  }

  // 지금 쓰는 테마를 파일 하나로 뽑는다. 내 themes.jsonc 에는 테마가 여럿이고 CSS 는
  // 사이드카로 흩어져 있으므로, 모아서 자기완결로 만드는 것이 내보내기의 본체다.
  async function exportTheme(): Promise<void> {
    void themeRev; // 레지스트리는 제자리에서 바뀐다 — rev 를 구독해야 최신을 집는다
    const theme = themes[themeId];
    if (!theme) return;
    try {
      const path = await saveFile(`${theme.id}.jsonc`, [{ name: "JSONC", extensions: ["jsonc"] }]);
      if (!path) return; // 취소
      await writeFile(path, buildThemePack(theme));
      showNotice(t("theme.exported", { name: theme.name }));
    } catch (e) {
      showNotice(t("theme.exportFailed", { detail: String(e) }), "error");
    }
  }

  async function reloadThemes(): Promise<void> {
    setBusy(true);
    try {
      const r = await loadUserThemes();
      // 토스트 슬롯은 하나다 — 경고가 있으면 그쪽이 이긴다. "3개 불러왔습니다" 가
      // "12번째 줄이 잘못됐습니다" 를 덮으면 사용자는 자기 오타를 영원히 못 찾는다.
      // (null = Tauri 밖이거나 경로를 못 읽음 — 그때도 성공했다고 말하지 않는다.)
      if (r && r.warnings.length === 0) showNotice(t("theme.loaded", { count: r.count }));
    } finally {
      setBusy(false);
    }
  }

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

          {/* 색을 직접 정하는 입구. 인앱 색상 피커 대신 파일을 둔 이유는 항목이 23개라
              팝오버가 두 배로 커지기 때문이다 — 파일 안 주석이 그대로 설명서 역할을 한다. */}
          <button type="button" className="set-reset" onClick={() => void openThemeFile()}>
            {t("settings.themeFile")}
          </button>
          <button type="button" className="set-reset" onClick={() => void reloadThemes()} disabled={busy}>
            {t("settings.themeReload")}
          </button>
          <button type="button" className="set-reset" onClick={() => void revealThemeFolder()}>
            {t("settings.themeFolder")}
          </button>
          <button type="button" className="set-reset" onClick={() => void exportTheme()}>
            {t("settings.themeExport")}
          </button>
        </div>
      )}
    </div>
  );
}
