// 폰트 프리셋(기능 3). 시스템 폰트 + 번들된 고급 폰트(OFL). 모두 오프라인.
// 값(id)은 store(fontRead/fontMono)에 저장하고, 여기서 실제 CSS 폰트 스택으로 해석한다.
// 고급 폰트는 앱 오리진(self) 자산으로 로드 — @font-face는 lazy라 선택 시에만 실제 다운로드된다.
import loraR from "@fontsource/lora/files/lora-latin-400-normal.woff2?url";
import loraI from "@fontsource/lora/files/lora-latin-400-italic.woff2?url";
import loraB from "@fontsource/lora/files/lora-latin-700-normal.woff2?url";
import jbR from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url";
import nanumK from "@fontsource/nanum-myeongjo/files/nanum-myeongjo-korean-400-normal.woff2?url";
// Pretendard: 단일 파일이 한글+라틴 전체 포함(748KB, 서브셋 분할 없음).
import pretendardR from "@fontsource/pretendard/files/pretendard-latin-400-normal.woff2?url";

export interface FontPreset {
  id: string;
  name: string;
  stack: string;
}

// 번들 폰트 @font-face — 메인 문서 head + 미리보기 iframe 양쪽에 주입한다.
const abs = (u: string) => new URL(u, window.location.href).href;
export const FONT_FACE_CSS = [
  `@font-face{font-family:'Lora';font-style:normal;font-weight:400;font-display:swap;src:url('${abs(loraR)}') format('woff2')}`,
  `@font-face{font-family:'Lora';font-style:italic;font-weight:400;font-display:swap;src:url('${abs(loraI)}') format('woff2')}`,
  `@font-face{font-family:'Lora';font-style:normal;font-weight:700;font-display:swap;src:url('${abs(loraB)}') format('woff2')}`,
  `@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:400;font-display:swap;src:url('${abs(jbR)}') format('woff2')}`,
  `@font-face{font-family:'Nanum Myeongjo';font-style:normal;font-weight:400;font-display:swap;src:url('${abs(nanumK)}') format('woff2')}`,
  `@font-face{font-family:'Pretendard';font-style:normal;font-weight:400;font-display:swap;src:url('${abs(pretendardR)}') format('woff2')}`,
].join("");

/** 읽기(미리보기 본문) 폰트 프리셋. ★=번들된 고급 폰트(OFL). */
export const readFonts: FontPreset[] = [
  { id: "lora", name: "Lora ★ (고급 세리프)", stack: `'Lora',Georgia,"Times New Roman",serif` },
  { id: "nanum", name: "나눔명조 ★ (고급 한글)", stack: `'Nanum Myeongjo','Lora',Georgia,serif` },
  { id: "pretendard", name: "Pretendard ★ (고급 산세리프)", stack: `'Pretendard','Segoe UI',system-ui,-apple-system,sans-serif` },
  { id: "default", name: "Palatino (Serif)", stack: `"Palatino Linotype","Book Antiqua",Georgia,"Times New Roman",serif` },
  { id: "georgia", name: "Georgia", stack: `Georgia,"Times New Roman",serif` },
  { id: "cambria", name: "Cambria", stack: `Cambria,"Times New Roman",serif` },
  { id: "sans", name: "Segoe UI (Sans)", stack: `"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif` },
  { id: "malgun", name: "맑은 고딕", stack: `"Malgun Gothic","맑은 고딕","Segoe UI",system-ui,sans-serif` },
];

/** 에디터(코드) 폰트 프리셋 — 모노스페이스. ★=번들된 고급 폰트(OFL). */
export const monoFonts: FontPreset[] = [
  { id: "jetbrains", name: "JetBrains Mono ★ (고급)", stack: `'JetBrains Mono',ui-monospace,"Cascadia Code",Consolas,monospace` },
  { id: "default", name: "Cascadia Code", stack: `"Cascadia Code","Cascadia Mono",ui-monospace,Consolas,monospace` },
  { id: "consolas", name: "Consolas", stack: `Consolas,"Cascadia Mono",ui-monospace,monospace` },
  { id: "courier", name: "Courier New", stack: `"Courier New",Courier,monospace` },
  { id: "lucida", name: "Lucida Console", stack: `"Lucida Console",Consolas,monospace` },
];

/** 앱 UI(크롬) 폰트 프리셋. Pretendard 기본 — 한글+라틴 커버. */
export const uiFonts: FontPreset[] = [
  { id: "pretendard", name: "Pretendard ★", stack: `'Pretendard',"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif` },
  { id: "system", name: "Segoe UI (시스템)", stack: `"Segoe UI Variable Text","Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,sans-serif` },
  { id: "malgun", name: "맑은 고딕", stack: `"Malgun Gothic","맑은 고딕","Segoe UI",system-ui,sans-serif` },
];

// ── 내보내기용 폰트 임베드 ──
// 자기완결 HTML 내보내기는 선택한 읽기 폰트를 data URI @font-face로 파일에 내장해
// 여는 환경과 무관하게 미리보기와 동일한 서체로 보이게 한다(앱오리진 url()은 앱 밖에서 깨짐).
export interface FontFace {
  family: string;
  weight: number;
  style: "normal" | "italic";
  url: string;
}

// 번들 서체(family) → woff2 자산. 위 FONT_FACE_CSS와 동일 소스.
const BUNDLED_FACES: Record<string, FontFace[]> = {
  Lora: [
    { family: "Lora", weight: 400, style: "normal", url: loraR },
    { family: "Lora", weight: 400, style: "italic", url: loraI },
    { family: "Lora", weight: 700, style: "normal", url: loraB },
  ],
  "JetBrains Mono": [{ family: "JetBrains Mono", weight: 400, style: "normal", url: jbR }],
  "Nanum Myeongjo": [{ family: "Nanum Myeongjo", weight: 400, style: "normal", url: nanumK }],
  Pretendard: [{ family: "Pretendard", weight: 400, style: "normal", url: pretendardR }],
};

// 읽기 폰트 id → 임베드할 번들 서체(스택에 등장하는 번들 family). 시스템 폰트는 빈 배열(스택 폴백).
const READ_FONT_FACES: Record<string, string[]> = {
  lora: ["Lora"],
  nanum: ["Nanum Myeongjo", "Lora"],
  pretendard: ["Pretendard"],
};

/** 선택한 읽기 폰트에 대해 내보내기 HTML에 임베드할 번들 페이스 목록(없으면 빈 배열=시스템 폴백). */
export function bundledWoff2For(readFontId: string): FontFace[] {
  const families = READ_FONT_FACES[readFontId] ?? [];
  return families.flatMap((f) => BUNDLED_FACES[f] ?? []);
}

export function readStack(id: string): string {
  return (readFonts.find((f) => f.id === id) ?? readFonts[0]).stack;
}

export function monoStack(id: string): string {
  return (monoFonts.find((f) => f.id === id) ?? monoFonts[0]).stack;
}

export function uiStack(id: string): string {
  return (uiFonts.find((f) => f.id === id) ?? uiFonts[0]).stack;
}

// 폰트 크기 기준(px). 줌 배율을 곱해 최종 크기를 산출.
export const BASE_EDITOR_PX = 13;
export const BASE_READER_PX = 16;
