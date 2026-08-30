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
  // 한국 전통 종이에 먹. paper(크림톤)보다 채도가 낮은 미색 바탕에, 글자는 순검정이
  // 아니라 따뜻한 먹빛. 강조색은 주사(朱砂)·인주 붉은색 — 고서의 권점(圈點)·낙관과 같은
  // 자리에 쓰려고 목록 마커·인용 막대에 그대로 배치한다.
  // 다이어그램 선은 붉어지지 않는다 — lib/mermaid.ts lineColor 는 --accent 가 아니라 --fg 파생이고,
  // --accent 는 noteBkgColor(14%)에만 옆게 스민다.
  hanji: {
    id: "hanji",
    name: "Hanji",
    type: "light",
    texture: "hanji",
    tokens: {
      "--bg": "#f2ecdf",
      "--fg": "#221f1c", // 먹 — 순검정(#000)은 미색 위에서 차갑게 뜼다
      "--accent": "#9c3a2e", // 주사(朱砂)
      "--surface": "#e8e0cd",
      "--border": "#d9cfb8",
    },
    prose: {
      heading: "#1f1c19",
      headingRule: "#cbb997", // 주사 대신 담묵·황토 — 제목마다 붉은 줄은 소란스럽다
      quoteBar: "#9c3a2e",
      quoteBg: "#ebe3d1",
      marker: "#9c3a2e", // 권점(圈點)
      markBg: "#e8d9a8", // 황토 형광 — 종이에 맞는 단색
      muted: "#6b6357",
    },
  },
  // 전자잉크 리더기. **무채색이 설계의 핵심**이다 — 색으로 구분할 수 없으므로 크기·굵기·
  // 괘선이 위계를 전담하고, 링크는 linkUnderline 로 밑줄을 단다. 그림자도 없애다(elevation:"flat").
  // 단 하나의 예외가 error 다 — 렌더 오류·삭제된 줄은 색이 유일한 신호라 가라앉은 벽돌색을 남겼다
  // (회색 종이에 붉은 펌 자국 하나). note/warn/tip 은 명도 순서로 구분한다.
  epaper: {
    id: "epaper",
    name: "E-Paper",
    type: "light",
    elevation: "flat",
    tokens: {
      "--bg": "#f3f2ee",
      "--fg": "#1b1b1b",
      "--accent": "#4a4a4a", // 무채색 — 강조조차 회색이다
      "--surface": "#e7e6e1",
      "--border": "#d2d1cb",
    },
    prose: {
      heading: "#111111",
      headingRule: "#c9c8c2",
      link: "#1b1b1b",
      linkUnderline: true, // 색이 없으니 밑줄이 유일한 링크 표시다
      quote: "#3f3f3f",
      quoteBar: "#9a9a9a",
      quoteBg: "#ebeae6",
      code: "#2e2e2e",
      codeBg: "#e4e3de",
      preBg: "#ecebe6",
      marker: "#5c5c5c",
      rule: "#cfcec8",
      tableHead: "#e7e6e1",
      tableZebra: "#ecebe6",
      markBg: "#dedcd4",
      muted: "#545454",
      selection: "#d4d3cd",
      note: "#4a4a4a",
      warn: "#2e2e2e", // 가장 진하게 = 가장 급하게
      tip: "#6a6a6a",
      error: "#8a3f38", // 유일한 유채색
      synKey: "#1f1f1f",
      synStr: "#4f4f4f",
    },
  },
};

export const defaultThemeId = "light";
