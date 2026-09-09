// 테마 고르기 창 — 타이틀바에 테마를 가로로 늘어놓던 자리를 대신한다.
//
// 왜 창인가: **테마는 파일로 늘어난다**(themes\ 폴더에 팩을 떨어뜨리는 것이 곧 가져오기다).
// 늘어나는 목록을 44px 툴바에 계속 이어 붙이면 언젠가 다른 컨트롤을 밀어낸다 — v0.9.0 에서
// 여섯 개가 되자 실제로 그렇게 됐다. 툴바에는 자주 오가는 내장 셋만 남기고, 전부는 여기서 고른다.
//
// 고르면 **즉시 적용하고 창은 닫지 않는다** — 뒤에 진짜 앱이 그 테마로 서 있는 것이
// 어떤 견본보다 정확한 미리보기다. 카드의 작은 견본은 "어느 것이 어느 색인지" 만 알려 준다.
//
// 테마 파일·폴더·내보내기 버튼도 여기로 모았다(설정 팝오버에서 옮겨 왔다). 고르는 자리와
// 만드는 자리가 갈려 있으면 "내가 만든 테마가 어디 있나"를 두 군데서 찾게 된다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store";
import { listThemeIds, themes, type Theme } from "../themes";
import { ensureThemeFile, loadUserThemes, openThemeFolder } from "../themes/load";
import { buildThemePack } from "../themes/custom";
import {
  openWithDefault,
  revealInExplorer,
  saveFile,
  themeDirPath,
  themeFilePath,
  writeFile,
} from "../lib/tauri";

/** 카드의 작은 견본. 테마가 실제로 쓰는 5토큰을 그대로 칠한다 — 견본용 색을 따로 두면
 *  파일을 고쳤을 때 견본만 옛 색으로 남는다. */
function Swatch({ theme }: { theme: Theme }) {
  const tk = theme.tokens;
  return (
    <span className="tp-swatch" style={{ background: tk["--bg"], borderColor: tk["--border"] }}>
      <span className="tp-bar" style={{ background: tk["--surface"], borderBottomColor: tk["--border"] }} />
      <span className="tp-head" style={{ background: tk["--accent"] }} />
      <span className="tp-line" style={{ background: tk["--fg"] }} />
      <span className="tp-line short" style={{ background: tk["--fg"] }} />
    </span>
  );
}

export function ThemePicker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const themeId = useAppStore((s) => s.themeId);
  const themeRev = useAppStore((s) => s.themeRev);
  const setTheme = useAppStore((s) => s.setTheme);
  const showNotice = useAppStore((s) => s.showNotice);
  const [busy, setBusy] = useState(false);
  const [paths, setPaths] = useState<{ file: string; dir: string } | null>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // themeRev 가 바뀔 때만 다시 읽는다 — themes 는 제자리에서 고쳐지는 객체라 참조가 안 변한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ids = useMemo(() => listThemeIds(), [themeRev]);
  // 표시명 규칙은 타이틀바·팔레트와 같다 — 번역이 있으면 그것, 없으면 레지스트리의 name
  // (사용자 테마에는 번역 키가 없다).
  const label = (id: string): string => t(`theme.${id}`, { defaultValue: themes[id]?.name ?? id });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // 버튼 툴팁에 **해석된 실제 경로**를 보여 준다 — MSIX 패키지본에서는 앱이 쓰는 경로가
    // %APPDATA% 가 아닐 수 있다(app_paths.rs).
    void Promise.all([themeFilePath(), themeDirPath()])
      .then(([file, dir]) => setPaths({ file, dir }))
      .catch(() => setPaths(null)); // Tauri 밖 — 툴팁만 없어진다
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 열리면 지금 테마에 초점을 준다(키보드만으로 좌우 이동이 바로 시작된다).
  useEffect(() => {
    selectedRef.current?.focus();
  }, []);

  // 테마 파일 열기: 없으면 주석 달린 템플릿을 만들고 기본 편집기로 연다.
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
      // 경로를 함께 보여 준다 — 탐색기가 못 열었을 때 손으로 찾아갈 수 있어야 한다.
      showNotice(t("theme.folderFailed", { path: paths?.dir ?? "", detail: String(e) }), "error");
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
      if (r && r.warnings.length === 0) showNotice(t("theme.loaded", { count: r.count }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal theme-modal"
        role="dialog"
        aria-label={t("theme.pickerTitle")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="modal-title">{t("theme.pickerTitle")}</p>

        <ul className="tp-grid">
          {ids.map((id) => {
            const theme = themes[id];
            if (!theme) return null;
            const on = id === themeId;
            return (
              <li key={id}>
                <button
                  ref={on ? selectedRef : undefined}
                  type="button"
                  className={"tp-card" + (on ? " active" : "")}
                  aria-pressed={on}
                  onClick={() => setTheme(id)}
                >
                  <Swatch theme={theme} />
                  <span className="tp-name">{label(id)}</span>
                  <span className="tp-id">{id}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="tp-hint">{t("theme.pickerHint")}</p>

        <div className="tp-tools">
          <button type="button" className="modal-btn" title={paths?.file} onClick={() => void openThemeFile()}>
            {t("settings.themeFile")}
          </button>
          <button type="button" className="modal-btn" title={paths?.dir} onClick={() => void revealThemeFolder()}>
            {t("settings.themeFolder")}
          </button>
          <button type="button" className="modal-btn" disabled={busy} onClick={() => void reloadThemes()}>
            {t("settings.themeReload")}
          </button>
          <button type="button" className="modal-btn" onClick={() => void exportTheme()}>
            {t("settings.themeExport")}
          </button>
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-btn primary" onClick={onClose}>
            {t("menu.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
