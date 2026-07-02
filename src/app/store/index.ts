// 전역 상태 (Zustand): 테마·언어 + 워크스페이스 트리·열린 탭.
// 테마·언어·최근은 localStorage에 영속화(persist). 탭/트리는 세션 한정(WBS 512).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultThemeId } from "../themes";
import type { DirEntryNode } from "../lib/tauri";

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

  roots: WsNode[]; // 가져온 폴더들
  expanded: Record<string, boolean>; // 폴더 펼침 상태(path 기준)
  tabs: OpenTab[];
  activePath: string | null;
  recent: string[]; // 최근 연 파일 경로(영속화)

  setTheme: (id: string) => void;
  setLanguage: (lng: string) => void;

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

      setTheme: (id) => set({ themeId: id }),
      setLanguage: (lng) => set({ language: lng }),

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
          const recent = [path, ...s.recent.filter((p) => p !== path)].slice(0, 8);
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
      // 세션 간 유지할 값만 영속화(탭/트리는 제외).
      partialize: (s) => ({ themeId: s.themeId, language: s.language, recent: s.recent }),
    },
  ),
);
