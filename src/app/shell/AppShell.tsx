// 앱 셸 — 시안(docs/mockups/md-reader-shell.html) 이식 + 파일/폴더 열기·워크스페이스 트리(WBS 510).
// 에디터는 현재 원문 표시(읽기 전용). 실제 편집=WBS 522, 미리보기 렌더=WBS 511.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore, type TreeNode } from "../store";
import { themes } from "../themes";
import { pickFile, pickFolder, readFile, writeFile, watchFiles, onFileChanged, searchQuery, onIndexUpdated, onFileDrop, pathIsDir, takePendingOpen, onOpenFile as onOpenFileEvent, onWindowCloseRequested, winDestroy, revealInExplorer, type SearchHit, winMinimize, winToggleMaximize, winClose } from "../lib/tauri";
import { Icon, IconSprite } from "./Icon";
import { WorkspaceTree } from "./WorkspaceTree";
import { Preview, type PreviewHandle } from "./Preview";
import { OutlineOverlay } from "./OutlineOverlay";
import { SearchResults } from "./SearchResults";
import { Editor, type EditorHandle } from "./Editor";
import type { SelState } from "../features/editor";
import { Presentation } from "./Presentation";
import { Seam } from "./Seam";
import { SettingsPopover } from "./SettingsPopover";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { ConfirmDialog, type ConfirmSpec } from "./ConfirmDialog";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { FindReplace } from "./FindReplace";
import { exportHtml, exportToPdf, copyHtml, type ExportParams } from "../features/export";
import { READABLE_RE, isReadable } from "../lib/fileTypes";
import { showFullNameOnClip } from "../lib/hoverName";
import type { TocItem } from "../lib/markdown";

const THEME_ORDER = ["light", "dark", "paper"] as const;
const THEME_ICON = { light: "sun", dark: "moon", paper: "paper" } as const;
const OPENABLE = READABLE_RE; // 드롭·파일연결에서 열 수 있는 문서 판별(공용 규칙)

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

/** 워크스페이스 트리의 파일 노드 수집(퀵오픈용) — 열 수 있는 문서만, realPath→name, 중복 경로 제거. */
function collectFiles(nodes: TreeNode[], out: Map<string, string>): void {
  for (const n of nodes) {
    if ((n.kind === "file_ref" || n.kind === "disk_file") && n.realPath && isReadable(n.name)) {
      out.set(n.realPath, n.name);
    }
    if (n.children.length) collectFiles(n.children, out);
  }
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
  const closeOthers = useAppStore((s) => s.closeOthers);
  const closeAll = useAppStore((s) => s.closeAll);
  const addFileRefTo = useAppStore((s) => s.addFileRefTo);
  const updateContent = useAppStore((s) => s.updateContent);
  const importFolder = useAppStore((s) => s.importFolder);
  const hydrate = useAppStore((s) => s.hydrate);

  const splitRatio = useAppStore((s) => s.splitRatio);
  const fontRead = useAppStore((s) => s.fontRead);
  const previewZoom = useAppStore((s) => s.previewZoom);
  const autosave = useAppStore((s) => s.autosave);

  const previewRef = useRef<PreviewHandle>(null);
  const editorRef = useRef<EditorHandle>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  // 양방향 스크롤 동기화 에코 억제(비대칭 2-락): 한쪽이 상대를 구동하면 상대의 되반사만 잠깐 무시.
  const previewLockUntil = useRef(0);
  const editorLockUntil = useRef(0);
  const [outline, setOutline] = useState<TocItem[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [indexNonce, setIndexNonce] = useState(0);
  const [dropActive, setDropActive] = useState(false);
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [sel, setSel] = useState<SelState>({ line: 1, col: 1, selChars: 0 });
  const [readerMode, setReaderMode] = useState(false); // 리딩(집중) 모드: 편집 숨기고 미리보기 전체폭
  const [presenting, setPresenting] = useState(false); // 프레젠테이션(전체화면 슬라이드)
  const [paletteMode, setPaletteMode] = useState<"command" | "file" | null>(null); // 명령 팔레트/퀵오픈
  const [findOpen, setFindOpen] = useState(false); // 워크스페이스 전역 찾기·바꾸기
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

  // 명령 팔레트(Ctrl+Shift+P)·파일 퀵오픈(Ctrl+P)·전역 찾기바꾸기(Ctrl+Shift+H). 같은 키 재입력 토글.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "p" || e.key === "P") {
        e.preventDefault(); // 웹뷰 인쇄 대화상자 방지
        const want = e.shiftKey ? "command" : "file";
        setPaletteMode((m) => (m === want ? null : want));
      } else if (e.shiftKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        setFindOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
  // StrictMode(dev)는 effect를 setup→cleanup→setup 로 두 번 돈다. cleanup이 async then보다 먼저
  // 실행돼 unlisten이 아직 없으면 리스너가 새서 드롭이 2번 발화 → import 2번(중복 등록). cancelled 가드로 방지.
  useEffect(() => {
    if (isDemo) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onFileDrop(({ phase, paths }) => {
      if (phase === "enter" || phase === "over") setDropActive(true);
      else if (phase === "leave") setDropActive(false);
      else {
        setDropActive(false);
        void openIncoming(paths);
      }
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [isDemo, openIncoming]);

  // .md 파일 연결/명령행(웜 스타트): 실행 중 앱에 새 파일이 넘어오면 즉시 열기(single-instance).
  // 콜드 스타트 대기열(takePendingOpen)은 세션 복원과 경합하므로 hydrate 이후에 처리(아래 부팅 이펙트).
  useEffect(() => {
    if (isDemo) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void onOpenFileEvent((p) => void openIncoming([p]))
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [isDemo, openIncoming]);

  const ko = language === "ko";
  const themeName = themes[themeId]?.name ?? "Light";
  const active = tabs.find((tb) => tb.path === activePath) ?? null;
  const words = active && active.content.trim() ? active.content.trim().split(/\s+/).length : 0;
  // 읽기 시간(근사): 라틴 단어 200 wpm + CJK 글자 500자/분(≈단어 2.5개 상당).
  const cjk = active ? (active.content.match(/[぀-ヿㄱ-힝一-鿿]/g) || []).length : 0;
  const readMin = active ? Math.max(1, Math.ceil((words + cjk / 2.5) / 200)) : 0;

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
  const [tabGhost, setTabGhost] = useState<{ x: number; y: number; label: string } | null>(null); // 드래그 중 커서 추종 칩
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; path: string } | null>(null); // 탭 우클릭 메뉴

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
      setTabGhost({ x: e.clientX, y: e.clientY, label: tabs.find((tb) => tb.path === d.path)?.title ?? "" });
    }
  }
  function onTabPointerUp() {
    const d = tabDrag.current;
    tabDrag.current = null;
    const mark = dropMark;
    setDragTabPath(null);
    setDropMark(null);
    setTabGhost(null);
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

  // 명령 팔레트 항목 — 앱 명령을 레지스트리로. 비활성(문서 없음 등)은 목록에서 제외.
  function buildCommands(): PaletteItem[] {
    const cmds: PaletteItem[] = [];
    const add = (id: string, label: string, run: () => void, enabled = true) => {
      if (enabled) cmds.push({ id, label, run });
    };
    add("open-file", t("menu.openFile"), () => void onOpenFile());
    add("open-folder", t("menu.openFolder"), () => void onOpenFolder());
    add("find-replace", t("find.title"), () => setFindOpen(true));
    add("save", t("menu.save"), () => void saveActive(), !!active);
    add("export-html", t("menu.exportHtml"), () => active && void exportHtml(exportParamsOf(active), active.title).catch(() => {}), !!active);
    add("export-pdf", t("menu.exportPdf"), () => active && void exportToPdf(exportParamsOf(active)).catch(() => {}), !!active);
    add("copy-html", t("menu.copyHtml"), () => active && void copyHtml(exportParamsOf(active)).catch(() => {}), !!active);
    add("reader", t("view.reader"), () => setReaderMode((v) => !v), !!active);
    add("present", t("view.present"), () => setPresenting(true), !!active);
    THEME_ORDER.forEach((id) =>
      add(`theme-${id}`, `${t("cmd.theme")}: ${themes[id]?.name ?? id}`, () => setTheme(id)),
    );
    (["narrow", "normal", "wide"] as const).forEach((w) =>
      add(
        `width-${w}`,
        `${t("view.readingWidth")}: ${t(w === "narrow" ? "view.widthNarrow" : w === "wide" ? "view.widthWide" : "view.widthNormal")}`,
        () => useAppStore.getState().setReadingWidth(w),
      ),
    );
    add("lang-ko", `${t("cmd.language")}: 한국어`, () => setLanguage("ko"));
    add("lang-en", `${t("cmd.language")}: English`, () => setLanguage("en"));
    add("toggle-sync", t("settings.syncScroll"), () => {
      const s = useAppStore.getState();
      s.setSyncScroll(!s.syncScroll);
    });
    add("toggle-autosave", t("settings.autosave"), () => {
      const s = useAppStore.getState();
      s.setAutosave(!s.autosave);
    });
    return cmds;
  }

  // 파일 퀵오픈 항목 — 워크스페이스 등록 파일(파일 참조 + 가져온 폴더의 디스크 파일).
  function buildFileItems(): PaletteItem[] {
    const map = new Map<string, string>();
    collectFiles(roots, map);
    return Array.from(map, ([path, name]) => ({
      id: path,
      label: name,
      sub: path,
      run: () => void onOpenRecent(path),
    }));
  }

  // 전역 찾기·바꾸기 대상 — 워크스페이스 등록 문서 파일 경로.
  function workspaceFilePaths(): string[] {
    const map = new Map<string, string>();
    collectFiles(roots, map);
    return Array.from(map.keys());
  }

  // 내보내기 파라미터(현재 테마·읽기 폰트·미리보기 줌 반영 → 미리보기와 동일하게 렌더).
  function exportParamsOf(tab: { path: string; content: string }): ExportParams {
    return { content: tab.content, path: tab.path, themeId, fontRead, previewZoom };
  }

  // 미저장 탭 일괄 저장(창 닫기 가드용).
  async function saveAllDirty() {
    const st = useAppStore.getState();
    for (const tab of st.tabs.filter((tb) => tb.dirty)) {
      try {
        await writeFile(tab.path, tab.content);
        useAppStore.getState().markSaved(tab.path);
      } catch (e) {
        console.error("저장 실패:", tab.path, e);
      }
    }
  }

  // 탭 닫기 — 미저장이면 확인 다이얼로그, 아니면 즉시.
  function requestCloseTab(path: string) {
    const tab = useAppStore.getState().tabs.find((tb) => tb.path === path);
    if (!tab || !tab.dirty) {
      closeTab(path);
      return;
    }
    setConfirm({
      title: t("dialog.unsavedTitle"),
      message: t("dialog.unsavedTabMsg", { name: tab.title }),
      onSave: () =>
        void (async () => {
          try {
            await writeFile(tab.path, tab.content);
          } catch (e) {
            console.error("저장 실패:", e);
          }
          closeTab(path);
        })(),
      onDiscard: () => closeTab(path),
    });
  }

  // 일괄 닫기(다른 탭/모든 탭) — 닫힐 대상 중 미저장이 있으면 저장/버림 확인, 없으면 즉시.
  // keepPath=null → 전부 닫기, 아니면 해당 탭만 남김.
  function requestBulkClose(keepPath: string | null) {
    const dirty = useAppStore.getState().tabs.filter((tb) => tb.path !== keepPath && tb.dirty);
    const doClose = () => (keepPath ? closeOthers(keepPath) : closeAll());
    if (dirty.length === 0) {
      doClose();
      return;
    }
    setConfirm({
      title: t("dialog.unsavedTitle"),
      message: t("dialog.unsavedCloseMsg", { count: dirty.length }),
      onSave: () =>
        void (async () => {
          for (const tb of dirty) {
            try {
              await writeFile(tb.path, tb.content);
              useAppStore.getState().markSaved(tb.path);
            } catch (e) {
              console.error("저장 실패:", tb.path, e);
            }
          }
          doClose();
        })(),
      onDiscard: () => doClose(),
    });
  }

  // 탭 우클릭 메뉴 항목. 저장 경로 있는 탭만 워크스페이스 추가·위치 열기·경로 복사 노출.
  function tabMenuItems(path: string): MenuItem[] {
    const items: MenuItem[] = [];
    if (path) items.push({ label: t("tab.addToWorkspace"), onClick: () => void addFileRefTo(null, path) });
    items.push({ label: t("tab.close"), onClick: () => requestCloseTab(path) });
    if (tabs.length > 1) items.push({ label: t("tab.closeOthers"), onClick: () => requestBulkClose(path) });
    items.push({ label: t("tab.closeAll"), onClick: () => requestBulkClose(null) });
    if (path) {
      items.push({ label: t("tab.reveal"), onClick: () => void revealInExplorer(path).catch((e) => console.error("위치 열기 실패:", e)) });
      items.push({ label: t("tab.copyPath"), onClick: () => void navigator.clipboard.writeText(path).catch(() => {}) });
    }
    return items;
  }

  // 창 닫기 가드(데이터 안전): dirty 탭 있으면 확인 다이얼로그, 통과 시 destroy(이벤트 우회).
  useEffect(() => {
    if (isDemo) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onWindowCloseRequested((event) => {
      const dirty = useAppStore.getState().tabs.filter((tb) => tb.dirty);
      if (dirty.length === 0) return; // 미저장 없음 → 그대로 닫힘
      event.preventDefault();
      setConfirm({
        title: t("dialog.unsavedTitle"),
        message: t("dialog.unsavedCloseMsg", { count: dirty.length }),
        onSave: () =>
          void (async () => {
            await saveAllDirty();
            void winDestroy();
          })(),
        onDiscard: () => void winDestroy(),
      });
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, t]);

  // 자동저장(옵트인): 활성 탭 편집 후 유휴 1.5s면 저장.
  useEffect(() => {
    if (!autosave || !active || !active.dirty) return;
    const timer = window.setTimeout(() => void saveActive(), 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, active?.path, active?.content, active?.dirty]);

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

  // 부팅: 워크스페이스 하이드레이트(세션 복원) → 완료 후 콜드 스타트 대기 파일 열기.
  // hydrate가 마지막에 activePath를 이전 세션 값으로 덮어쓰므로, 파일 연결로 연 문서가 항상 활성이
  // 되도록 반드시 hydrate 이후에 open한다(그래야 openFile이 마지막 기록자 = 활성 확정).
  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    void (async () => {
      await hydrate();
      if (cancelled) return;
      try {
        const p = await takePendingOpen();
        if (p && !cancelled) await openIncoming([p]);
      } catch {
        /* 대기 파일 없음/실패는 무시 */
      }
    })();
    return () => {
      cancelled = true;
    };
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
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
      {tabMenu && (
        <ContextMenu x={tabMenu.x} y={tabMenu.y} items={tabMenuItems(tabMenu.path)} onClose={() => setTabMenu(null)} />
      )}
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
          <span className="sep" />
          <div className="tgroup actions">
            <button
              className={"tbtn" + (readerMode ? " on" : "")}
              type="button"
              disabled={!active}
              aria-pressed={readerMode}
              title={t("view.reader")}
              onClick={() => setReaderMode((v) => !v)}
            >
              <Icon name="read" />
              <span className="lbl">{t("view.reader")}</span>
            </button>
            <button
              className="tbtn"
              type="button"
              disabled={!active}
              title={t("view.present")}
              aria-label={t("view.present")}
              onClick={() => setPresenting(true)}
            >
              <Icon name="present" />
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

        {presenting && active && (
          <Presentation
            content={active.content}
            path={active.path}
            themeId={themeId}
            onClose={() => setPresenting(false)}
          />
        )}

        {paletteMode && (
          <CommandPalette
            items={paletteMode === "command" ? buildCommands() : buildFileItems()}
            placeholder={paletteMode === "command" ? t("cmd.palette") : t("cmd.files")}
            emptyText={paletteMode === "command" ? t("cmd.noCommands") : t("cmd.noFiles")}
            onClose={() => setPaletteMode(null)}
          />
        )}

        {findOpen && (
          <FindReplace
            files={workspaceFilePaths()}
            activePath={activePath}
            onClose={() => setFindOpen(false)}
          />
        )}

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
              {
                label: t("menu.copyHtml"),
                onClick: () => {
                  void copyHtml(exportParamsOf(active)).catch((e) =>
                    console.error("HTML 복사 실패:", e),
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
                      <span className="name" onMouseEnter={(e) => showFullNameOnClip(e, baseName(p))}>
                        {baseName(p)}
                      </span>
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
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTabMenu({ x: e.clientX, y: e.clientY, path: tab.path });
                  }}
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
                      requestCloseTab(tab.path);
                    }}
                  >
                    <Icon name="x" />
                  </span>
                </button>
              ))}
              {dropMark && <span className="tab-drop-marker" style={{ left: dropMark.left }} />}
              {tabGhost && (
                <div className="drag-ghost" style={{ left: tabGhost.x + 14, top: tabGhost.y + 10 }}>
                  <Icon name="file" />
                  <span className="drag-ghost-name">{tabGhost.label}</span>
                </div>
              )}
            </div>
            <button type="button" className="tab-add" aria-label={t("menu.openFile")} title={t("menu.openFile")} onClick={onOpenFile}>
              <Icon name="plus" />
            </button>
          </div>

          {active ? (
            <div
              className={"split" + (readerMode ? " reader" : "")}
              ref={splitRef}
              style={readerMode ? undefined : splitStyle}
            >
              <section className="editor" aria-label="editor">
                <Editor
                  key={active.path}
                  ref={editorRef}
                  content={active.content}
                  onChange={(doc) => updateContent(active.path, doc)}
                  onSyncLine={(line) => {
                    if (!useAppStore.getState().syncScroll) return;
                    if (Date.now() < editorLockUntil.current) return; // 미리보기가 방금 구동 → 에코 무시
                    previewLockUntil.current = Date.now() + 90; // 미리보기 에코 억제
                    previewRef.current?.scrollToLine(line);
                  }}
                  onSelState={setSel}
                />
              </section>

              <Seam containerRef={splitRef} vertical={vertical} />

              <section className="preview" aria-label="preview">
                <Preview
                  ref={previewRef}
                  content={active.content}
                  path={active.path}
                  themeId={themeId}
                  onToc={setOutline}
                  onSourceLine={(line) => {
                    if (readerMode) return; // 리딩 모드는 에디터 숨김 → 역동기화 불필요
                    if (!useAppStore.getState().syncScroll) return;
                    if (Date.now() < previewLockUntil.current) return; // 에디터가 방금 구동 → 에코 무시
                    editorLockUntil.current = Date.now() + 90; // 에디터 에코 억제
                    editorRef.current?.scrollToLine(line);
                  }}
                />
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
                {t("status.ln")} <strong>{sel.line}</strong>, {t("status.col")} <strong>{sel.col}</strong>
              </span>
              {sel.selChars > 0 && (
                <span className="st">
                  <strong>{sel.selChars}</strong> {t("status.selected")}
                </span>
              )}
            </>
          ) : (
            <span className="st">{ko ? "열린 문서 없음" : "No document open"}</span>
          )}
          {active && (
            <span className="st right">
              <strong>{words}</strong> {t("status.words")} · ~{readMin} {t("status.min")}
            </span>
          )}
          <span className={active ? "st" : "st right"}>Markdown</span>
          <span className="st">{themeName}</span>
          <span className="st">UTF-8</span>
        </footer>
      </div>
    </>
  );
}
