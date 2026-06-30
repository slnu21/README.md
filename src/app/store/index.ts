// 전역 상태 (Zustand): 테마, 언어 등. 탭/활성 문서는 구현 단계에서 확장.
import { create } from "zustand";
import { defaultThemeId } from "../themes";

interface AppState {
  themeId: string;
  language: string;
  setTheme: (id: string) => void;
  setLanguage: (lng: string) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  themeId: defaultThemeId,
  language: "en",
  setTheme: (id) => set({ themeId: id }),
  setLanguage: (lng) => set({ language: lng }),
}));
