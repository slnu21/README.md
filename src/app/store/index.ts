// 전역 상태 (Zustand): 테마·언어·뷰 프리퍼런스 + 워크스페이스 트리·탭·즐겨찾기·최근.
// 워크스페이스(가상 폴더 UUID 그래프 + imported 폴더 디스크 파생)/즐겨찾기/최근은 SQLite(단일 소스),
// 부팅·변경마다 refreshWorkspace 로 재로딩. 테마·언어·뷰는 localStorage(persist)로 즉시 복원.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultThemeId } from "../themes";
import {
  readFile,
  readDirTree,
  wsLoad,
  wsCreateFolder,
  wsAddFileRef,
  wsImportFolder,
  wsRename,
  wsDelete,
  wsMove,
  wsReorder,
  wsToggleFavorite,
  wsTouchRecent,
  searchIndexFolder,
  type DirEntryNode,
  type WorkspaceNode,
} from "../lib/tauri";

/** 렌더 트리 노드. 그래프 노드(uuid)와 디스크 파생 노드(path)를 통합. */
export type TreeKind =
  | "virtual_folder"
  | "file_ref"
  | "imported_folder"
  | "disk_folder"
  | "disk_file";
export interface TreeNode {
  key: string; // 식별자: 그래프=uuid, 디스크="disk:"+path
  id?: string; // 그래프 노드 UUID(디스크 파생은 없음)
  kind: TreeKind;
  name: string;
  realPath?: string; // file_ref / imported_folder / disk 노드
  parentId?: string | null; // 그래프 노드
  sortOrder?: number;
  children: TreeNode[];
}

export const FAVORITES_KEY = "__favorites__"; // 즐겨찾기 합성 그룹 펼침 키

/** 열린 파일 탭. dirty = 미저장 편집. */
export interface OpenTab {
  path: string;
  title: string;
  content: string;
  dirty: boolean;
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const isFolderKind = (k: TreeKind) =>
  k === "virtual_folder" || k === "imported_folder" || k === "disk_folder";

/** 디스크 엔트리(DirEntryNode) → TreeNode(disk_*). scope=소유 imported_folder id로 key를 유일화
 *  → 같은 폴더가 여러 곳에 import돼도 펼침 상태(expanded[key])가 서로 독립. */
function diskToTree(d: DirEntryNode, scope: string): TreeNode {
  return {
    key: scope + "|disk:" + d.path,
    kind: d.isDir ? "disk_folder" : "disk_file",
    name: d.name,
    realPath: d.path,
    children: d.isDir ? d.children.map((c) => diskToTree(c, scope)) : [],
  };
}

/** SQLite 노드 그래프 → 렌더 트리. imported_folder 자식은 디스크에서 파생(D1). */
async function buildRoots(nodes: WorkspaceNode[]): Promise<TreeNode[]> {
  const byParent = new Map<string | null, WorkspaceNode[]>();
  for (const n of nodes) {
    const k = n.parentId ?? null;
    const arr = byParent.get(k);
    if (arr) arr.push(n);
    else byParent.set(k, [n]);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);

  async function build(n: WorkspaceNode): Promise<TreeNode> {
    const node: TreeNode = {
      key: n.id,
      id: n.id,
      kind: n.kind as TreeKind,
      name: n.name,
      realPath: n.realPath ?? undefined,
      parentId: n.parentId,
      sortOrder: n.sortOrder,
      children: [],
    };
    if (n.kind === "imported_folder" && n.realPath) {
      try {
        const disk = await readDirTree(n.realPath);
        node.children = disk.children.map((c) => diskToTree(c, n.id));
      } catch {
        /* 폴더가 사라졌으면 빈 채로 */
      }
    } else if (n.kind === "virtual_folder") {
      const kids = byParent.get(n.id) ?? [];
      node.children = await Promise.all(kids.map(build));
    }
    return node;
  }

  return Promise.all((byParent.get(null) ?? []).map(build));
}

/** 펼침 상태 병합: 존재하는 키만 보존(+합성 키) + 새 루트 폴더는 기본 열림. */
function mergeExpanded(prev: Record<string, boolean>, roots: TreeNode[]): Record<string, boolean> {
  const valid = new Set<string>();
  const walk = (n: TreeNode) => {
    valid.add(n.key);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  const next: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(prev)) {
    if (valid.has(k) || k.startsWith("__")) next[k] = v;
  }
  for (const r of roots) {
    if (isFolderKind(r.kind) && !(r.key in next)) next[r.key] = true;
  }
  if (!(FAVORITES_KEY in next)) next[FAVORITES_KEY] = true;
  return next;
}

interface AppState {
  themeId: string;
  language: string;

  // 뷰 프리퍼런스(localStorage 영속) — 첫 페인트 영향으로 동기 복원.
  splitRatio: number;
  editorZoom: number;
  previewZoom: number;
  fontRead: string;
  fontMono: string;
  fontUi: string;
  syncScroll: boolean;
  outlinePinned: boolean;
  outlineOpacity: number;
  activeSidebarTab: "workspace" | "recent"; // 사이드바 상단 탭
  autosave: boolean; // 자동저장(옵트인) — 편집 후 유휴 시 디스크 저장

  roots: TreeNode[]; // 워크스페이스 트리(그래프+디스크 파생)
  expanded: Record<string, boolean>; // 폴더 펼침 상태(key 기준)
  tabs: OpenTab[];
  activePath: string | null;
  openPaths: string[]; // 세션 복원용 — 마지막 열린 파일 경로(persist, 부팅 시 재오픈)
  recent: string[];
  favorites: string[];

  setTheme: (id: string) => void;
  setLanguage: (lng: string) => void;
  setSplitRatio: (r: number) => void;
  setEditorZoom: (z: number) => void;
  setPreviewZoom: (z: number) => void;
  resetZoom: () => void;
  setFontRead: (id: string) => void;
  setFontMono: (id: string) => void;
  setFontUi: (id: string) => void;
  setSyncScroll: (on: boolean) => void;
  setOutlinePinned: (on: boolean) => void;
  setOutlineOpacity: (v: number) => void;
  setSidebarTab: (tab: "workspace" | "recent") => void;
  setAutosave: (on: boolean) => void;

  hydrate: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  importFolder: (path: string) => Promise<void>;
  toggleFavorite: (path: string) => Promise<void>;

  // 워크스페이스 조작(가상 폴더 UUID 그래프). 전부 Rust 성공 → refreshWorkspace.
  createFolder: (parentId: string | null, name: string) => Promise<void>;
  addFileRefTo: (parentId: string | null, realPath: string) => Promise<void>;
  importFolderTo: (parentId: string | null, path: string) => Promise<void>;
  renameNode: (id: string, name: string) => Promise<void>;
  removeNode: (id: string) => Promise<void>;
  moveNode: (id: string, newParentId: string | null, newSortOrder: number) => Promise<void>;
  reorderChildren: (orderedIds: string[]) => Promise<void>;

  addFolder: (tree: DirEntryNode) => void;
  toggleDir: (key: string) => void;
  openFile: (path: string, content: string) => void;
  setActive: (path: string) => void;
  moveTab: (path: string, toIndex: number) => void;
  closeTab: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string) => void;
  reloadFile: (path: string, content: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      themeId: defaultThemeId,
      language: "en",

      splitRatio: 0.5,
      editorZoom: 1,
      previewZoom: 1,
      fontRead: "default",
      fontMono: "default",
      fontUi: "pretendard",
      syncScroll: true,
      outlinePinned: false,
      outlineOpacity: 0.92,
      activeSidebarTab: "workspace",
      autosave: false,

      roots: [],
      expanded: {},
      tabs: [],
      activePath: null,
      openPaths: [],
      recent: [],
      favorites: [],

      setTheme: (id) => set({ themeId: id }),
      setLanguage: (lng) => set({ language: lng }),
      setSplitRatio: (r) => set({ splitRatio: clamp(r, 0.2, 0.8) }),
      setEditorZoom: (z) => set({ editorZoom: clamp(z, 0.8, 1.8) }),
      setPreviewZoom: (z) => set({ previewZoom: clamp(z, 0.8, 1.8) }),
      resetZoom: () => set({ editorZoom: 1, previewZoom: 1 }),
      setFontRead: (id) => set({ fontRead: id }),
      setFontMono: (id) => set({ fontMono: id }),
      setFontUi: (id) => set({ fontUi: id }),
      setSyncScroll: (on) => set({ syncScroll: on }),
      setOutlinePinned: (on) => set({ outlinePinned: on }),
      setOutlineOpacity: (v) => set({ outlineOpacity: clamp(v, 0.3, 1) }),
      setSidebarTab: (tab) => set({ activeSidebarTab: tab }),
      setAutosave: (on) => set({ autosave: on }),

      // 부팅 시 로드 = refreshWorkspace + 세션 복원(마지막 열린 파일 재오픈).
      hydrate: async () => {
        await get().refreshWorkspace();
        // 세션 복원: persist된 openPaths를 디스크에서 다시 읽어 탭 재오픈(사라진 파일은 skip).
        // 내용은 파일에서 새로 읽으므로 저장된 문서만 복원(미저장 편집은 자동저장/닫기 가드가 담당).
        const paths = get().openPaths;
        const wantActive = get().activePath;
        for (const p of paths) {
          try {
            const content = await readFile(p);
            get().openFile(p, content);
          } catch {
            /* 파일이 사라졌으면 skip */
          }
        }
        if (wantActive && get().tabs.some((tb) => tb.path === wantActive)) {
          set({ activePath: wantActive });
        }
      },

      // SQLite 스냅샷 → 트리 재구성 + 즐겨찾기·최근 갱신 + 펼침 병합.
      refreshWorkspace: async () => {
        try {
          const snap = await wsLoad();
          const roots = await buildRoots(snap.nodes);
          const expanded = mergeExpanded(get().expanded, roots);
          set({ roots, expanded, favorites: snap.favorites, recent: snap.recent });
        } catch {
          /* SQLite 미가용(데모/브라우저) → 세션 상태 유지 */
        }
      },

      // 폴더 가져오기(루트) → imported_folder 노드 + 재로딩 + 백그라운드 인덱싱.
      importFolder: async (path) => {
        try {
          await wsImportFolder(crypto.randomUUID(), null, path);
          await get().refreshWorkspace();
        } catch (e) {
          console.error("폴더 가져오기 실패:", e);
        }
        void searchIndexFolder(path).catch(() => {});
      },

      toggleFavorite: async (path) => {
        try {
          const isFav = await wsToggleFavorite(path);
          set((s) => ({
            favorites: isFav
              ? [...s.favorites.filter((p) => p !== path), path]
              : s.favorites.filter((p) => p !== path),
          }));
        } catch {
          /* ignore */
        }
      },

      createFolder: async (parentId, name) => {
        try {
          await wsCreateFolder(crypto.randomUUID(), parentId, name);
          await get().refreshWorkspace();
        } catch (e) {
          console.error("폴더 생성 실패:", e);
        }
      },

      addFileRefTo: async (parentId, realPath) => {
        try {
          await wsAddFileRef(crypto.randomUUID(), parentId, realPath);
          await get().refreshWorkspace();
        } catch (e) {
          console.error("파일 추가 실패:", e);
        }
      },

      importFolderTo: async (parentId, path) => {
        try {
          await wsImportFolder(crypto.randomUUID(), parentId, path);
          await get().refreshWorkspace();
        } catch (e) {
          console.error("폴더 가져오기 실패:", e);
        }
        void searchIndexFolder(path).catch(() => {});
      },

      renameNode: async (id, name) => {
        try {
          await wsRename(id, name);
          await get().refreshWorkspace();
        } catch (e) {
          console.error("이름 변경 실패:", e);
        }
      },

      removeNode: async (id) => {
        try {
          await wsDelete(id);
          await get().refreshWorkspace();
        } catch (e) {
          console.error("제거 실패:", e);
        }
      },

      moveNode: async (id, newParentId, newSortOrder) => {
        try {
          await wsMove(id, newParentId, newSortOrder);
          await get().refreshWorkspace();
        } catch (e) {
          console.error("이동 실패:", e); // 사이클 등은 백엔드가 차단
          throw e;
        }
      },

      reorderChildren: async (orderedIds) => {
        try {
          await wsReorder(orderedIds);
          await get().refreshWorkspace();
        } catch (e) {
          console.error("재정렬 실패:", e);
        }
      },

      // 데모 시드 전용(디스크 트리를 루트로 삽입).
      addFolder: (tree) =>
        set((s) => {
          const node = diskToTree(tree, tree.path);
          return {
            roots: [...s.roots.filter((r) => r.key !== node.key), node],
            expanded: { ...s.expanded, [node.key]: true },
          };
        }),

      toggleDir: (key) => set((s) => ({ expanded: { ...s.expanded, [key]: !s.expanded[key] } })),

      openFile: (path, content) =>
        set((s) => {
          const exists = s.tabs.some((t) => t.path === path);
          const tabs = exists
            ? s.tabs.map((t) => (t.path === path ? { ...t, content, dirty: false } : t))
            : [...s.tabs, { path, title: baseName(path), content, dirty: false }];
          const recent = [path, ...s.recent.filter((p) => p !== path)].slice(0, 50);
          void wsTouchRecent(path).catch(() => {}); // SQLite 영속(데모/브라우저는 무시)
          return { tabs, activePath: path, recent };
        }),

      setActive: (path) => set({ activePath: path }),

      // 탭 순서 변경(포인터 드래그). 세션 한정(탭은 비영속).
      moveTab: (path, toIndex) =>
        set((s) => {
          const from = s.tabs.findIndex((t) => t.path === path);
          if (from < 0 || toIndex < 0 || toIndex >= s.tabs.length || from === toIndex) return {};
          const tabs = s.tabs.slice();
          const [moved] = tabs.splice(from, 1);
          tabs.splice(toIndex, 0, moved);
          return { tabs };
        }),

      closeTab: (path) =>
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.path === path);
          const tabs = s.tabs.filter((t) => t.path !== path);
          let activePath = s.activePath;
          if (s.activePath === path) {
            activePath = tabs.length ? tabs[Math.min(idx, tabs.length - 1)].path : null;
          }
          return { tabs, activePath };
        }),

      updateContent: (path, content) =>
        set((s) => ({
          tabs: s.tabs.map((tb) => (tb.path === path ? { ...tb, content, dirty: true } : tb)),
        })),

      markSaved: (path) =>
        set((s) => ({
          tabs: s.tabs.map((tb) => (tb.path === path ? { ...tb, dirty: false } : tb)),
        })),

      reloadFile: (path, content) =>
        set((s) => ({
          tabs: s.tabs.map((tb) => (tb.path === path ? { ...tb, content, dirty: false } : tb)),
        })),
    }),
    {
      name: "md-reader",
      partialize: (s) => ({
        themeId: s.themeId,
        language: s.language,
        expanded: s.expanded,
        splitRatio: s.splitRatio,
        editorZoom: s.editorZoom,
        previewZoom: s.previewZoom,
        fontRead: s.fontRead,
        fontMono: s.fontMono,
        fontUi: s.fontUi,
        syncScroll: s.syncScroll,
        outlinePinned: s.outlinePinned,
        outlineOpacity: s.outlineOpacity,
        activeSidebarTab: s.activeSidebarTab,
        autosave: s.autosave,
        // 세션 복원: 열린 파일 경로 + 활성 탭(내용은 비영속 — 용량, 부팅 시 디스크에서 재로딩).
        openPaths: s.tabs.map((tb) => tb.path),
        activePath: s.activePath,
      }),
    },
  ),
);
