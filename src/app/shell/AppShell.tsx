// 앱 셸 — 시안(docs/mockups/md-reader-shell.html) 이식 + 파일/폴더 열기·워크스페이스 트리(WBS 510).
// 에디터는 현재 원문 표시(읽기 전용). 실제 편집=WBS 522, 미리보기 렌더=WBS 511.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, type TreeNode } from "../store";
import { themes } from "../themes";
import { pickFile, pickFolder, readFile, writeFile, watchFiles, onFileChanged, searchQuery, onIndexUpdated, onFileDrop, pathIsDir, takePendingOpen, onOpenFile as onOpenFileEvent, type SearchHit, winMinimize, winToggleMaximize, winClose } from "../lib/tauri";
import { Icon, IconSprite } from "./Icon";
import { WorkspaceTree } from "./WorkspaceTree";
import { Preview, type PreviewHandle } from "./Preview";
import { OutlineOverlay } from "./OutlineOverlay";
import { SearchResults } from "./SearchResults";
import { Editor } from "./Editor";
import { Seam } from "./Seam";
import { SettingsPopover } from "./SettingsPopover";
import { ContextMenu } from "./ContextMenu";
import { exportHtml, exportToPdf, type ExportParams } from "../features/export";
import type { TocItem } from "../lib/markdown";

const THEME_ORDER = ["light", "dark", "paper"] as const;
const THEME_ICON = { light: "sun", dark: "moon", paper: "paper" } as const;
const OPENABLE = /\.(md|markdown|mdx|txt)$/i;

/** 트리에서 imported_folder 실경로 수집(중첩 포함) — 감시·재인덱싱 대상. */
function collectImportedPaths(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (n: TreeNode) => {
    if (n.kind === "imported_folder" && n.realPath) out.push(n.realPath);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

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
  const activeSidebarTab = useAppStore((s) => s.activeSidebarTab);
  const setSidebarTab = useAppStore((s) => s.setSidebarTab);
  const openFile = useAppStore((s) => s.openFile);
  const setActive = useAppStore((s) => s.setActive);
  const moveTab = useAppStore((s) => s.moveTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const updateContent = useAppStore((s) => s.updateContent);
  const importFolder = useAppStore((s) => s.importFolder);
  const hydrate = useAppStore((s) => s.hydrate);

  const splitRatio = useAppStore((s) => s.splitRatio);
  const fontRead = useAppStore((s) => s.fontRead);
  const previewZoom = useAppStore((s) => s.previewZoom);

  const previewRef = useRef<PreviewHandle>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const [outline, setOutline] = useState<TocItem[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [indexNonce, setIndexNonce] = useState(0);
  const [dropActive, setDropActive] = useState(false);
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null);
  // ≤900px에서는 편집/미리보기가 세로 스택 → 리사이저 축 전환.
  const [vertical, setVertical] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches,
  );
  const isDemo = new URLSearchParams(window.location.search).has("demo");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const on = () => setVertical(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const splitStyle = vertical
    ? { gridTemplateRows: `${splitRatio}fr 7px ${1 - splitRatio}fr`, gridTemplateColumns: "1fr" }
    : { gridTemplateColumns: `${splitRatio}fr 7px ${1 - splitRatio}fr` };

  // 확대/축소 단축키(기능 5): Ctrl +/−/0 · Ctrl+휠. 포커스/대상이 미리보기면 미리보기, 아니면 에디터.
  useEffect(() => {
    function zoom(target: Element | null | undefined, delta: number) {
      const st = useAppStore.getState();
      if (target?.closest(".preview")) st.setPreviewZoom(st.previewZoom + delta);
      else st.setEditorZoom(st.editorZoom + delta);
    }
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "0") {
        useAppStore.getState().resetZoom();
        e.preventDefault();
      } else if (e.key === "=" || e.key === "+") {
        zoom(document.activeElement, 0.1);
        e.preventDefault();
      } else if (e.key === "-" || e.key === "_") {
        zoom(document.activeElement, -0.1);
        e.preventDefault();
      }
    }
    function onWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault(); // 웹뷰 기본 줌 방지
      zoom(e.target as Element, e.deltaY < 0 ? 0.1 : -0.1);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  // 경로 목록을 열기: 폴더=가져오기, .md/.txt=열기, 그 외 무시. 드롭·파일연결·명령행이 공유.
  const openIncoming = useCallback(
    async (paths: string[]) => {
      for (const path of paths) {
        try {
          if (await pathIsDir(path)) await importFolder(path);
          else if (OPENABLE.test(path)) openFile(path, await readFile(path));
        } catch (e) {
          console.error("열기 처리 실패:", path, e);
        }
      }
    },
    [importFolder, openFile],
  );

  // OS 파일 드롭으로 열기(기능 1a).
  useEffect(() => {
    if (isDemo) return;
    let unlisten: (() => void) | undefined;
    onFileDrop(({ phase, paths }) => {
      if (phase === "enter" || phase === "over") setDropActive(true);
      else if (phase === "leave") setDropActive(false);
      else {
        setDropActive(false);
        void openIncoming(paths);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, [isDemo, openIncoming]);

  // .md 파일 연결/명령행 실행 → 해당 문서 열기. 콜드=대기열 take, 웜=open-file 이벤트(single-instance).
  useEffect(() => {
    if (isDemo) return;
    let unlisten: (() => void) | undefined;
    void takePendingOpen()
      .then((p) => {
        if (p) void openIncoming([p]);
      })
      .catch(() => {});
    void onOpenFileEvent((p) => void openIncoming([p]))
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, [isDemo, openIncoming]);

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

  // 탭 포인터 드래그 재정렬. 임계값(5px) 초과 시에만 드래그로 간주(클릭=활성화 보존).
  const tabDrag = useRef<{ path: string; startX: number; moved: boolean } | null>(null);
  const justDraggedTab = useRef(false);
  const [dragTabPath, setDragTabPath] = useState<string | null>(null);
  const [dropMark, setDropMark] = useState<{ index: number; left: number } | null>(null);

  // 포인터 x 기준 삽입 위치(원본 배열 좌표 0..n) + 표시선 left(px, 스크롤 콘텐츠 좌표) 계산.
  function computeDrop(scrollEl: HTMLElement, clientX: number): { index: number; left: number } {
    const els = Array.from(scrollEl.querySelectorAll<HTMLElement>(".tab[data-path]"));
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return { index: i, left: els[i].offsetLeft - 1 };
    }
    const last = els[els.length - 1];
    return { index: els.length, left: last ? last.offsetLeft + last.offsetWidth + 1 : 0 };
  }

  function onTabPointerDown(e: React.PointerEvent, path: string) {
    if (e.button !== 0) return;
    tabDrag.current = { path, startX: e.clientX, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onTabPointerMove(e: React.PointerEvent) {
    const d = tabDrag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) > 5) {
      d.moved = true;
      setDragTabPath(d.path);
    }
    if (d.moved) {
      const scrollEl = (e.currentTarget as HTMLElement).closest<HTMLElement>(".tab-scroll");
      if (scrollEl) setDropMark(computeDrop(scrollEl, e.clientX));
    }
  }
  function onTabPointerUp() {
    const d = tabDrag.current;
    tabDrag.current = null;
    const mark = dropMark;
    setDragTabPath(null);
    setDropMark(null);
    if (!d || !d.moved || !mark) return; // 이동 없음 → 클릭(setActive)에 맡김
    justDraggedTab.current = true; // 뒤이어 오는 click(setActive) 억제
    const from = tabs.findIndex((t) => t.path === d.path);
    if (from < 0) return;
    // 삽입 index(원본 좌표) → 드래그 항목 제거 후 좌표로 보정.
    const toIndex = mark.index > from ? mark.index - 1 : mark.index;
    moveTab(d.path, toIndex);
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

  // 내보내기 파라미터(현재 테마·읽기 폰트·미리보기 줌 반영 → 미리보기와 동일하게 렌더).
  function exportParamsOf(tab: { path: string; content: string }): ExportParams {
    return { content: tab.content, path: tab.path, themeId, fontRead, previewZoom };
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
  const rootsKey = collectImportedPaths(roots).join("\n");
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
      {dropActive && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-card">
            <Icon name="file" className="drop-ic" />
            <p>{ko ? "여기에 놓아 열기 · .md 파일 또는 폴더" : "Drop to open · .md files or a folder"}</p>
          </div>
        </div>
      )}
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
            <button
              className="tbtn"
              type="button"
              disabled={!active}
              aria-haspopup="menu"
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setExportMenu({ x: r.left, y: r.bottom + 4 });
              }}
            >
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

          <SettingsPopover />

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

        {exportMenu && active && (
          <ContextMenu
            x={exportMenu.x}
            y={exportMenu.y}
            onClose={() => setExportMenu(null)}
            items={[
              {
                label: t("menu.exportHtml"),
                onClick: () => {
                  void exportHtml(exportParamsOf(active), active.title).catch((e) =>
                    console.error("HTML 내보내기 실패:", e),
                  );
                },
              },
              {
                label: t("menu.exportPdf"),
                onClick: () => {
                  void exportToPdf(exportParamsOf(active)).catch((e) =>
                    console.error("PDF 내보내기 실패:", e),
                  );
                },
              },
            ]}
          />
        )}

        {/* 사이드바 — [워크스페이스 | 최근] 탭 */}
        <aside className="sidebar" aria-label="workspace">
          <div className="sidebar-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeSidebarTab === "workspace"}
              className={"sb-tab" + (activeSidebarTab === "workspace" ? " active" : "")}
              onClick={() => setSidebarTab("workspace")}
            >
              <Icon name="folder" />
              <span>{t("sidebar.workspace")}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSidebarTab === "recent"}
              className={"sb-tab" + (activeSidebarTab === "recent" ? " active" : "")}
              onClick={() => setSidebarTab("recent")}
            >
              <Icon name="clock" />
              <span>{t("sidebar.recent")}</span>
            </button>
          </div>

          <div className="sidebar-body">
            {activeSidebarTab === "workspace" ? (
              <WorkspaceTree />
            ) : recent.length > 0 ? (
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
              <p className="tree-hint">{t("ws.recentEmpty")}</p>
            )}
          </div>
        </aside>

        {/* 콘텐츠 */}
        <div className="content">
          <div className="tabbar" role="tablist">
            <div className="tab-scroll">
              {tabs.map((tab) => (
                <button
                  key={tab.path}
                  type="button"
                  role="tab"
                  data-path={tab.path}
                  className={
                    "tab" +
                    (tab.path === activePath ? " active" : "") +
                    (tab.path === dragTabPath ? " dragging" : "")
                  }
                  aria-selected={tab.path === activePath}
                  title={tab.path}
                  onPointerDown={(e) => onTabPointerDown(e, tab.path)}
                  onPointerMove={onTabPointerMove}
                  onPointerUp={onTabPointerUp}
                  onClick={() => {
                    if (justDraggedTab.current) {
                      justDraggedTab.current = false; // 방금 드래그였으면 활성화 억제
                      return;
                    }
                    setActive(tab.path);
                  }}
                >
                  {tab.dirty && <span className="dirty" aria-hidden="true" />}
                  <span className="tname">{tab.title}</span>
                  <span
                    className="close"
                    role="button"
                    aria-label="close"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.path);
                    }}
                  >
                    <Icon name="x" />
                  </span>
                </button>
              ))}
              {dropMark && <span className="tab-drop-marker" style={{ left: dropMark.left }} />}
            </div>
            <button type="button" className="tab-add" aria-label={t("menu.openFile")} title={t("menu.openFile")} onClick={onOpenFile}>
              <Icon name="plus" />
            </button>
          </div>

          {active ? (
            <div className="split" ref={splitRef} style={splitStyle}>
              <section className="editor" aria-label="editor">
                <Editor
                  key={active.path}
                  content={active.content}
                  onChange={(doc) => updateContent(active.path, doc)}
                  onSyncLine={(line) => {
                    if (useAppStore.getState().syncScroll) previewRef.current?.scrollToLine(line);
                  }}
                />
              </section>

              <Seam containerRef={splitRef} vertical={vertical} />

              <section className="preview" aria-label="preview">
                <Preview ref={previewRef} content={active.content} path={active.path} themeId={themeId} onToc={setOutline} />
                <OutlineOverlay items={outline} onSelect={(id) => previewRef.current?.scrollToHeading(id)} />
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
