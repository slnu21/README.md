// 앱 셸 — 시안(docs/mockups/md-reader-shell.html) 이식 + 파일/폴더 열기·워크스페이스 트리(WBS 510).
// 에디터는 현재 원문 표시(읽기 전용). 실제 편집=WBS 522, 미리보기 렌더=WBS 511.
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store";
import { themes } from "../themes";
import { pickFile, pickFolder, readFile, readDirTree } from "../lib/tauri";
import { Icon, IconSprite } from "./Icon";
import { WorkspaceTree } from "./WorkspaceTree";
import { Preview } from "./Preview";
import { Editor } from "./Editor";

const THEME_ORDER = ["light", "dark", "paper"] as const;
const THEME_ICON = { light: "sun", dark: "moon", paper: "paper" } as const;

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function AppShell() {
  const { t } = useTranslation();
  const themeId = useAppStore((s) => s.themeId);
  const setTheme = useAppStore((s) => s.setTheme);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  const roots = useAppStore((s) => s.roots);
  const tabs = useAppStore((s) => s.tabs);
  const activePath = useAppStore((s) => s.activePath);
  const recent = useAppStore((s) => s.recent);
  const addFolder = useAppStore((s) => s.addFolder);
  const openFile = useAppStore((s) => s.openFile);
  const setActive = useAppStore((s) => s.setActive);
  const closeTab = useAppStore((s) => s.closeTab);
  const updateContent = useAppStore((s) => s.updateContent);

  const ko = language === "ko";
  const themeName = themes[themeId]?.name ?? "Light";
  const active = tabs.find((tb) => tb.path === activePath) ?? null;
  const lines = active ? active.content.split("\n") : [];
  const words = active && active.content.trim() ? active.content.trim().split(/\s+/).length : 0;

  async function onOpenFile() {
    const path = await pickFile();
    if (!path) return;
    try {
      openFile(path, await readFile(path));
    } catch (e) {
      console.error("파일 열기 실패:", e);
    }
  }

  async function onOpenFolder() {
    const path = await pickFolder();
    if (!path) return;
    try {
      addFolder(await readDirTree(path));
    } catch (e) {
      console.error("폴더 열기 실패:", e);
    }
  }

  async function onOpenRecent(path: string) {
    try {
      openFile(path, await readFile(path));
    } catch (e) {
      console.error("파일 열기 실패:", e);
    }
  }

  return (
    <>
      <IconSprite />
      <div className="app" role="application" aria-label="md-reader">
        {/* 상단바 */}
        <header className="titlebar">
          <div className="brand">
            <span className="dot" />
            <span>{t("app.name")}</span>
          </div>
          <span className="sep" />
          <div className="tgroup actions">
            <button className="tbtn" type="button" onClick={onOpenFile}>
              <Icon name="file" />
              <span className="lbl">{t("menu.openFile")}</span>
            </button>
            <button className="tbtn" type="button" onClick={onOpenFolder}>
              <Icon name="folder" />
              <span className="lbl">{t("menu.openFolder")}</span>
            </button>
          </div>
          <span className="sep" />
          <div className="tgroup actions">
            <button className="tbtn" type="button">
              <Icon name="save" />
              <span className="lbl">{t("menu.save")}</span>
            </button>
            <button className="tbtn" type="button">
              <Icon name="export" />
              <span className="lbl">{t("menu.export")}</span>
            </button>
          </div>

          <span className="spacer" />

          <label className="search">
            <Icon name="search" />
            <input type="text" placeholder={t("search.placeholder")} aria-label={t("search.placeholder")} />
          </label>

          <div className="seg theme" role="group" aria-label="theme">
            {THEME_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={themeId === id}
                title={themes[id].name}
                aria-label={themes[id].name}
                onClick={() => setTheme(id)}
              >
                <Icon name={THEME_ICON[id]} />
              </button>
            ))}
          </div>

          <div className="seg lang" role="group" aria-label="language">
            <button type="button" aria-pressed={language === "ko"} onClick={() => setLanguage("ko")}>
              한
            </button>
            <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>
              EN
            </button>
          </div>

          <div className="wctl">
            <button type="button" aria-label="Minimize">
              <Icon name="min" />
            </button>
            <button type="button" aria-label="Maximize">
              <Icon name="max" />
            </button>
            <button type="button" className="close" aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </header>

        {/* 사이드바 */}
        <aside className="sidebar" aria-label="workspace">
          <div className="sec-label">
            <Icon name="folder" />
            <span>{t("sidebar.workspace")}</span>
          </div>
          {roots.length > 0 ? (
            <WorkspaceTree nodes={roots} />
          ) : (
            <p className="tree-hint">{ko ? "‘폴더 열기’로 워크스페이스를 시작하세요." : "Open a folder to start your workspace."}</p>
          )}

          <div className="sec-label">
            <Icon name="star" />
            <span>{t("sidebar.favorites")}</span>
          </div>
          <p className="tree-hint">—</p>

          <div className="sec-label">
            <Icon name="clock" />
            <span>{t("sidebar.recent")}</span>
          </div>
          {recent.length > 0 ? (
            <ul className="tree">
              {recent.map((p) => (
                <li key={p}>
                  <div
                    className={"node file" + (activePath === p ? " active" : "")}
                    tabIndex={0}
                    onClick={() => onOpenRecent(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenRecent(p);
                      }
                    }}
                  >
                    <Icon name="clock" />
                    <span className="name">{baseName(p)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tree-hint">—</p>
          )}
        </aside>

        {/* 콘텐츠 */}
        <div className="content">
          <div className="tabbar" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.path}
                type="button"
                role="tab"
                className={"tab" + (tab.path === activePath ? " active" : "")}
                aria-selected={tab.path === activePath}
                title={tab.path}
                onClick={() => setActive(tab.path)}
              >
                {tab.dirty && <span className="dirty" aria-hidden="true" />}
                <span className="tname">{tab.title}</span>
                <span
                  className="close"
                  role="button"
                  aria-label="close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.path);
                  }}
                >
                  <Icon name="x" />
                </span>
              </button>
            ))}
            <button type="button" className="tab-add" aria-label={t("menu.openFile")} title={t("menu.openFile")} onClick={onOpenFile}>
              <Icon name="plus" />
            </button>
          </div>

          {active ? (
            <div className="split">
              <section className="editor" aria-label="editor">
                <Editor
                  key={active.path}
                  content={active.content}
                  onChange={(doc) => updateContent(active.path, doc)}
                />
              </section>

              <div className="seam" role="separator" aria-orientation="vertical" aria-label="resize" />

              <section className="preview" aria-label="preview">
                <Preview content={active.content} path={active.path} themeId={themeId} />
              </section>
            </div>
          ) : (
            <div className="empty-state">
              <Icon name="file" className="empty-ic" />
              <h2>{t("app.name")}</h2>
              <p>{ko ? "파일이나 폴더를 열어 시작하세요." : "Open a file or folder to get started."}</p>
              <div className="empty-actions">
                <button type="button" onClick={onOpenFile}>
                  <Icon name="file" />
                  {t("menu.openFile")}
                </button>
                <button type="button" onClick={onOpenFolder}>
                  <Icon name="folder" />
                  {t("menu.openFolder")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 상태바 */}
        <footer className="statusbar">
          {active ? (
            <>
              <span className="st">
                <span className="dot-ok" />
                <span>{t("status.saved")}</span>
              </span>
              <span className="st">
                {t("status.ln")} <strong>{lines.length}</strong>
              </span>
              <span className="st">
                <strong>{words}</strong> {t("status.words")}
              </span>
            </>
          ) : (
            <span className="st">{ko ? "열린 문서 없음" : "No document open"}</span>
          )}
          <span className="st right">Markdown</span>
          <span className="st">{themeName}</span>
          <span className="st">UTF-8</span>
        </footer>
      </div>
    </>
  );
}
