// 전역 상태 (Zustand): 테마·언어 + 워크스페이스 트리·열린 탭·즐겨찾기·최근.
// 워크스페이스/즐겨찾기/최근은 SQLite(단일 소스오브트루스), 부팅 시 hydrate 로 로드.
// 테마·언어는 localStorage(persist)로 즉시 복원(첫 페인트 플래시 방지).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultThemeId } from "../themes";
import {
  readDirTree,
  wsLoad,
  wsImportFolder,
  wsToggleFavorite,
  wsTouchRecent,
  searchIndexFolder,
  type DirEntryNode,
} from "../lib/tauri";

/** 사이드바 트리 노드(가져온 폴더 미러). path 를 식별자로 사용. */
export interface WsNode {
  name: string;
  path: string;
  isDir: boolean;
  children: WsNode[];
}

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

interface AppState {
  themeId: string;
  language: string;

  roots: WsNode[]; // 가져온 폴더들(디스크 파생)
  expanded: Record<string, boolean>; // 폴더 펼침 상태(path 기준)
  tabs: OpenTab[];
  activePath: string | null;
  recent: string[]; // 최근 연 파일 경로(SQLite)
  favorites: string[]; // 즐겨찾기 경로(SQLite)

  setTheme: (id: string) => void;
  setLanguage: (lng: string) => void;

  hydrate: () => Promise<void>;
  importFolder: (path: string) => Promise<void>;
  toggleFavorite: (path: string) => Promise<void>;

  addFolder: (tree: DirEntryNode) => void;
  toggleDir: (path: string) => void;
  openFile: (path: string, content: string) => void;
  setActive: (path: string) => void;
  closeTab: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string) => void;
  reloadFile: (path: string, content: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      themeId: defaultThemeId,
      language: "en",

      roots: [],
      expanded: {},
      tabs: [],
      activePath: null,
      recent: [],
      favorites: [],

      setTheme: (id) => set({ themeId: id }),
      setLanguage: (lng) => set({ language: lng }),

      // 부팅 시 SQLite에서 워크스페이스 로드. imported_folder는 디스크에서 자식 파생(D1).
      hydrate: async () => {
        try {
          const snap = await wsLoad();
          const roots: WsNode[] = [];
          const expanded: Record<string, boolean> = {};
          for (const node of snap.nodes) {
            if (node.kind !== "imported_folder" || !node.realPath) continue;
            try {
              const tree = await readDirTree(node.realPath);
              roots.push(tree);
              expanded[tree.path] = true;
            } catch {
              /* 폴더가 사라졌으면 skip */
            }
          }
          set({ roots, expanded, favorites: snap.favorites, recent: snap.recent });
        } catch {
          /* SQLite 미가용(데모/브라우저) → 무시하고 세션 상태 유지 */
        }
      },

      // 폴더 가져오기: SQLite에 imported_folder 루트 저장 → 트리 파생 → 백그라운드 인덱싱.
      importFolder: async (path) => {
        try {
          await wsImportFolder(crypto.randomUUID(), null, path);
        } catch {
          /* 영속화 실패해도 세션 트리는 표시 */
        }
        try {
          const tree = await readDirTree(path);
          set((s) => ({
            roots: [...s.roots.filter((r) => r.path !== tree.path), tree],
            expanded: { ...s.expanded, [tree.path]: true },
          }));
        } catch (e) {
          console.error("폴더 열기 실패:", e);
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

      addFolder: (tree) =>
        set((s) => ({
          roots: [...s.roots.filter((r) => r.path !== tree.path), tree],
          expanded: { ...s.expanded, [tree.path]: true },
        })),

      toggleDir: (path) =>
        set((s) => ({ expanded: { ...s.expanded, [path]: !s.expanded[path] } })),

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
      // 테마·언어만 localStorage에 영속(워크스페이스/최근/즐겨찾기는 SQLite).
      partialize: (s) => ({ themeId: s.themeId, language: s.language }),
    },
  ),
);
