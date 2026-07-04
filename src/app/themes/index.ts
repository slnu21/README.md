// Theme registry: CSS 변수 토큰 기반. dark/light 내장 + paper(종이질감) 등 확장.
// 코드 수정 없이 테마를 추가할 수 있도록 정의를 레지스트리로 관리한다.

export interface ThemeTokens {
  "--bg": string;
  "--fg": string;
  "--accent": string;
  "--surface": string;
  "--border": string;
}

export interface Theme {
  id: string;
  name: string;
  type: "light" | "dark";
  tokens: ThemeTokens;
}

export const themes: Record<string, Theme> = {
  light: {
    id: "light",
    name: "Light",
    type: "light",
    tokens: {
      "--bg": "#ffffff",
      "--fg": "#1a1a1a",
      "--accent": "#2563eb",
      "--surface": "#f5f5f5",
      "--border": "#e2e2e2",
    },
  },
  dark: {
    id: "dark",
    name: "Dark",
    type: "dark",
    tokens: {
      "--bg": "#1e1e1e",
      "--fg": "#e6e6e6",
      "--accent": "#60a5fa",
      "--surface": "#252526",
      "--border": "#333333",
    },
  },
  paper: {
    id: "paper",
    name: "Paper",
    type: "light",
    tokens: {
      // 더 연한 크림톤 + 진한 연필(그래파이트) 글자색.
      "--bg": "#fcf9f2",
      "--fg": "#2e2c28", // 진한 연필심 느낌의 따뜻한 그래파이트
      "--accent": "#8a5a2b", // 세피아 잉크(링크·헤딩)
      "--surface": "#f6f2e8",
      "--border": "#e9e1d1",
    },
  },
};

export const defaultThemeId = "light";
