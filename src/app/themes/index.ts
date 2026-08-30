// Theme registry: CSS 변수 토큰 기반. dark/light 내장 + paper(종이질감) 등 확장.
// 코드 수정 없이 테마를 추가할 수 있도록 정의를 레지스트리로 관리한다.

import type { Elevation, ProseTokens, Texture } from "./prose";

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
  /** 미리보기(리딩) 서식 색. 적지 않은 항목은 PROSE_DEFAULT_CSS 가 5토큰에서 파생한다 →
   *  테마가 한 항목도 안 적어도 동작한다(사용자 테마의 최소 기재량 = 0). */
  prose?: Partial<ProseTokens>;
  /** 바탕 무늬. 열거값이다 — 사용자 CSS 문자열을 그대로 받지 않는다(themes/prose.ts 주석). */
  texture?: Texture;
  /** 카드 그림자. flat = 그림자 없는 전자잉크 화면. */
  elevation?: Elevation;
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
