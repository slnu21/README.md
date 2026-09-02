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
  /** 이 테마만의 CSS(스타일 팩). 미리보기 문서에 PREVIEW_CSS **뒤**로 붙어 모양을 덮는다.
   *  색이 아니라 모양을 담당한다 — 색은 tokens·prose 가 정한다는 관례를 지킨다.
   *  주입 전 `sanitizeThemeCss` 를 통과한 값만 여기 들어온다. */
  css?: string;
}

export const BUILTIN_THEMES: Readonly<Record<string, Theme>> = {
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
  // 한지·전자잉크·컬러 전자잉크는 **내장이 아니라 `themes\` 폴더의 파일**이다(themes/seeds.ts).
  // 우리 테마만 코드에 숨겨 두면 "받은 팩은 고칠 수 있는데 기본 테마는 못 고친다"가 되어
  // 팩을 주고받자는 기능과 앞뒤가 안 맞는다. 여기 셋만 남긴 것은 **파일이 하나도 없어도
  // 앱이 반드시 쓸 수 있는 최소한**이기 때문이다 — 시드가 실패하거나 사용자가 폴더를
  // 통째로 비워도 이 셋은 사라지지 않는다.
};

export const defaultThemeId = "light";

/** **살아 있는** 레지스트리. 내장 테마 + 사용자 테마 파일을 합친 결과다.
 *  조회부(apply.ts · renderDoc.ts · mermaid.ts · AppShell.tsx)는 전부 호출 시점에 `themes[id]` 를
 *  보므로, 이 객체를 **제자리에서** 고치면 전부 그대로 따라온다. */
export const themes: Record<string, Theme> = { ...BUILTIN_THEMES };

/** 사용자 테마를 반영해 레지스트리를 다시 재는다. 파일이 진실원이므로 매번 통째로 재구성한다
 *  — 파일에서 사라진 테마가 지워져야 하기 때문이다.
 *
 *  **`export let` 으로 재대입하지 않는다** — 라이브 바인딩 미묘함을 아예 만들지 않기 위해
 *  const 객체를 제자리에서 고친다(어떤 import 형태든 같은 것을 본다).
 *  순서도 계약이다 — 내장 테마가 선언 순서대로 먼저, 새 사용자 테마가 뒤에 붙는다.
 *  같은 id 로 덮어쓴 테마는 **자리를 지킨다**(지우고 다시 넣으면 맨 뒤로 밀린다). */
export function setUserThemes(user: Record<string, Theme>): void {
  for (const k of Object.keys(themes)) delete themes[k];
  for (const [k, v] of Object.entries(BUILTIN_THEMES)) themes[k] = user[k] ?? v;
  for (const [k, v] of Object.entries(user)) if (!(k in BUILTIN_THEMES)) themes[k] = v;
}

/** 타이틀바·팔레트가 보는 표시 순서. */
export function listThemeIds(): string[] {
  return Object.keys(themes);
}
