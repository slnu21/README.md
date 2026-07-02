// 앱 셸 — 시안(docs/mockups/md-reader-shell.html) 이식 + 파일/폴더 열기·워크스페이스 트리(WBS 510).
// 에디터는 현재 원문 표시(읽기 전용). 실제 편집=WBS 522, 미리보기 렌더=WBS 511.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store";
import { themes } from "../themes";
import { pickFile, pickFolder, readFile, writeFile, watchFiles, onFileChanged, searchQuery, onIndexUpdated, type SearchHit, winMinimize, winToggleMaximize, winClose } from "../lib/tauri";
import { Icon, IconSprite } from "./Icon";
import { WorkspaceTree } from "./WorkspaceTree";
import { Preview, type PreviewHandle } from "./Preview";
import { Outline } from "./Outline";
import { SearchResults } from "./SearchResults";
import { Editor } from "./Editor";
import type { TocItem } from "../lib/markdown";

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
  const favorites = useAppStore((s) => s.favorites);
  const openFile = useAppStore((s) => s.openFile);
  const setActive = useAppStore((s) => s.setActive);
  const closeTab = useAppStore((s) => s.closeTab);
  const updateContent = useAppStore((s) => s.updateContent);
  const importFolder = useAppStore((s) => s.importFolder);
  const hydrate = useAppStore((s) => s.hydrate);

  const previewRef = useRef<PreviewHandle>(null);
  const [outline, setOutline] = useState<TocItem[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [indexNonce, setIndexNonce] = useState(0);
  const isDemo = new URLSearchParams(window.location.search).has("demo");

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
    await importFolder(path);
  }

  async function onOpenRecent(path: string) {
    try {
      openFile(path, await readFile(path));
    } catch (e) {
      console.error("파일 열기 실패:", e);
    }
  }

  async function saveActive() {
    const st = useAppStore.getState();
    const tab = st.tabs.find((tb) => tb.path === st.activePath);
    if (!tab) return;
    try {
      await writeFile(tab.path, tab.content);
      useAppStore.getState().markSaved(tab.path);
    } catch (e) {
      console.error("저장 실패:", e);
    }
  }

  // Ctrl/Cmd+S 저장
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void saveActive();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 열린 파일 상위 dir + 가져온 폴더(재귀·재인덱싱) 감시(경로 집합 변경 시에만 재등록)
  const pathsKey = tabs.map((tb) => tb.path).join("\n");
  const rootsKey = roots.map((r) => r.path).join("\n");
  useEffect(() => {
    void watchFiles(
      pathsKey ? pathsKey.split("\n") : [],
      rootsKey ? rootsKey.split("\n") : [],
    );
  }, [pathsKey, rootsKey]);

  // 외부 변경 → 미수정 탭만 조용히 리로드
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;
    void onFileChanged((changed) => {
      const st = useAppStore.getState();
      for (const p of changed) {
        const tab = st.tabs.find((tb) => tb.path === p);
        if (tab && !tab.dirty) {
          readFile(p)
            .then((content) => {
              const cur = useAppStore.getState().tabs.find((tb) => tb.path === p);
              if (cur && !cur.dirty && cur.content !== content) {
                useAppStore.getState().reloadFile(p, content);
              }
            })
            .catch(() => {});
        }
      }
    }).then((un) => {
      if (alive) unlisten = un;
      else un();
    });
    return () => {
      alive = false;
      if (unlisten) unlisten();
    };
  }, []);

  // 부팅 시 SQLite에서 워크스페이스 하이드레이트(데모/브라우저 제외).
  useEffect(() => {
    if (!isDemo) void hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 검색: 250ms 디바운스 후 질의(인덱스 갱신 시에도 재질의).
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchQuery(q, 30)
        .then((res) => setHits(res))
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, indexNonce]);

  // 인덱스 증분 갱신 이벤트 → 현재 질의 재실행 트리거.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;
    void onIndexUpdated(() => setIndexNonce((n) => n + 1)).then((un) => {
      if (alive) unlisten = un;
      else un();
    });
    return () => {
      alive = false;
      if (unlisten) unlisten();
    };
  }, []);

  async function onPickHit(hit: SearchHit) {
    setSearchOpen(false);
    setQuery("");
    try {
      openFile(hit.realPath, await readFile(hit.realPath));
    } catch (e) {
      console.error("파일 열기 실패:", e);
    }
  }

  return (
    <>
      <IconSprite />
      <div className="app" role="application" aria-label="md-reader">
        {/* 상단바 */}
        <header className="titlebar" data-tauri-drag-region="">
          <div className="brand" data-tauri-drag-region="">
            <svg className="logo" viewBox="0 0 208 128" aria-hidden="true">
              <rect x="6" y="6" width="196" height="116" rx="16" fill="none" stroke="var(--accent)" strokeWidth="14" />
              <path fill="var(--accent)" d="M30 98V30h20l20 25 20-25h20v68H110V59L90 84 70 59v39zm125 0l-30-33h20V30h20v35h20z" />
            </svg>
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
            <button className="tbtn" type="button" onClick={() => void saveActive()} disabled={!active}>
              <Icon name="save" />
              <span className="lbl">{t("menu.save")}</span>
            </button>
            <button className="tbtn" type="button">
              <Icon name="export" />
              <span className="lbl">{t("menu.export")}</span>
            </button>
          </div>

          <span className="spacer" data-tauri-drag-region="" />

          <div className="search-wrap">
            <label className="search">
              <Icon name="search" />
              <input
                type="text"
                value={query}
                placeholder={t("search.placeholder")}
                aria-label={t("search.placeholder")}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchOpen(false);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </label>
            {searchOpen && query.trim() && (
              <SearchResults hits={hits} loading={searching} onPick={onPickHit} />
            )}
          </div>

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
            <button type="button" aria-label="Minimize" onClick={() => void winMinimize()}>
              <Icon name="min" />
            </button>
            <button type="button" aria-label="Maximize" onClick={() => void winToggleMaximize()}>
              <Icon name="max" />
            </button>
            <button type="button" className="close" aria-label="Close" onClick={() => void winClose()}>
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
            <Icon name="list" />
            <span>{ko ? "아웃라인" : "Outline"}</span>
          </div>
          {active && outline.length > 0 ? (
            <Outline items={outline} onSelect={(id) => previewRef.current?.scrollToHeading(id)} />
          ) : (
            <p className="tree-hint">—</p>
          )}

          <div className="sec-label">
            <Icon name="star" />
            <span>{t("sidebar.favorites")}</span>
          </div>
          {favorites.length > 0 ? (
            <ul className="tree">
              {favorites.map((p) => (
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
                    <Icon name="star" />
                    <span className="name">{baseName(p)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tree-hint">—</p>
          )}

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
                <Preview ref={previewRef} content={active.content} path={active.path} themeId={themeId} onToc={setOutline} />
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
                <span className={active.dirty ? "dot-dirty" : "dot-ok"} />
                <span>{active.dirty ? t("status.unsaved") : t("status.saved")}</span>
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
