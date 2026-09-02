// `themes\` 폴더에 처음 넣어 주는 파일들. **의존성 0** — 파서가 이걸 실제로 읽을 수 있는지
// 단위 테스트가 검사하기 위해 따로 둔다(seeds.test.ts).
//
// **왜 내장 상수가 아니라 파일인가**: v0.8.0 까지 한지·전자잉크는 코드 안 상수였다. 그러면
// 사용자가 색 하나를 바꾸려면 같은 id 로 통째로 덮어써야 하고, 무엇을 물려받았는지 안 보인다.
// 파일로 내리면 **읽을 수 있고 고칠 수 있고 지울 수 있다** — 팩을 주고받는 것이 목적인
// 기능에서 우리 테마만 예외로 두는 것이 앞뒤가 안 맞았다.
//
// **파일명 앞의 번호는 우선순위이자 목록 순서다** — read_theme_bundle 이 파일명 순으로 읽고
// 뒤가 앞을 이긴다(fs_ops.rs). 사이드카는 `<테마id>.css` 라야 하므로 번호가 붙지 않는다.

import { THEME_FOLDER_GUIDE } from "./template";

/** 시드 판 번호. 올리면 **없는 파일만** 새로 들어간다(create_new 라 남의 편집본은 안전하다).
 *  지운 파일이 되살아나지 않도록 판 번호는 store 에 남는다(themeSeedVersion). */
export const SEED_VERSION = 1;

export interface SeedFile {
  /** 파일 이름(확장자 포함). */
  name: string;
  text: string;
}

/** 무채색·컬러 두 팩이 함께 쓰는 제목 위계 CSS. **한 곳에서 나와** 둘이 어긋나지 않는다. */
export const HEADING_LADDER_CSS = `/* 제목 위계 — 색이 없어도 층이 보이게. 무채색 테마에서는 크기만으로는 h4·h5·h6 이
   사실상 같은 줄로 보인다(1.06 / 1.0 / 0.92em). 굵기·괘선·막대·자간이 그 일을 나눠 진다.
   색은 한 자리도 직접 안 적었다 — 전부 var(--prose-*) 파생이라 테마를 바꿔도 어울린다. */

h1, h2, h3, h4, h5, h6 { font-weight: 700; }

/* h1 — 이중 괘선. 문서에 하나뿐인 자리라 가장 무겁게. */
h1 {
  border-bottom: 3px double var(--prose-heading-rule);
  padding-bottom: 0.28em;
  letter-spacing: -0.015em;
}

/* h2 — 단일 괘선. */
h2 { border-bottom: 1px solid var(--prose-heading-rule); }

/* h3 — 괘선 대신 왼쪽 굵은 막대. 가로선에서 세로선으로 바뀌는 것이 층의 경계다. */
h3 {
  border-bottom: none;
  padding-left: 0.55em;
  border-left: 5px solid var(--prose-heading);
}

/* h4 — 같은 막대를 얇게, 글자는 한 단 흐리게. */
h4 {
  font-weight: 600;
  padding-left: 0.55em;
  border-left: 2px solid var(--prose-marker);
  color: color-mix(in srgb, var(--prose-heading) 82%, var(--bg));
}

/* h5 — 막대를 뺀다. 남는 신호는 자간과 명도뿐. */
h5 {
  font-weight: 600;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, var(--prose-heading) 72%, var(--bg));
}

/* h6 — 자간을 더 벌린다. 색은 PREVIEW_CSS 의 --prose-muted 를 그대로 쓴다. */
h6 { font-weight: 600; letter-spacing: 0.1em; }
`;

const HANJI_JSONC = `// 한지 — 한국 전통 종이에 먹. v0.9.0 부터 이 파일이 원본이다.
//
// 색을 바꿔 보고 싶으면 여기를 고치고 [설정 ▸ 테마 다시 불러오기] 를 누르세요.
// 이 파일을 지우면 목록에서 한지가 사라집니다(되살리려면 앱 데이터를 지우거나 직접 다시 쓰면 됩니다).
{
  "version": 1,
  "themes": [
    {
      "id": "hanji",
      "name": "한지",
      "type": "light",
      "texture": "hanji",   // 손으로 뜬 종이에 남는 가로 발(簾)자국

      "tokens": {
        "bg": "#f2ecdf",
        "fg": "#221f1c",       // 먹 — 순검정은 미색 위에서 차갑게 뜬다
        "accent": "#9c3a2e",   // 주사(朱砂)
        "surface": "#e8e0cd",
        "border": "#d9cfb8"
      },

      // 안 적은 항목은 위 다섯에서 자동으로 나온다 — 그래서 일곱 줄이면 충분하다.
      "prose": {
        "heading": "#1f1c19",
        "headingRule": "#cbb997",   // 주사 대신 담묵·황토 — 제목마다 붉은 줄은 소란스럽다
        "quoteBar": "#9c3a2e",
        "quoteBg": "#ebe3d1",
        "marker": "#9c3a2e",        // 권점(圈點)
        "markBg": "#e8d9a8",
        "muted": "#6b6357"
      }
    }
  ]
}
`;

const EPAPER_JSONC = `// 전자잉크 — 전자책 단말기의 회색 화면.
//
// **무채색이 설계의 핵심**이다. 색으로 구분할 수 없으므로 크기·굵기·괘선이 위계를 전담하고
// (모양은 옆의 epaper.css 가 맡는다), 링크는 linkUnderline 으로 밑줄을 단다.
// 단 하나의 예외가 error 다 — 렌더 오류는 색이 유일한 신호라 가라앉은 벽돌색을 남겼다.
// note/warn/tip 은 색이 아니라 **명도 순서**로 구분한다(진할수록 급하다).
//
// 스물세 항목을 전부 적어 둔 것은 일부러다 — 무엇을 정할 수 있는지 이 파일이 곧 목록이다.
{
  "version": 1,
  "themes": [
    {
      "id": "epaper",
      "name": "전자잉크",
      "type": "light",
      "elevation": "flat",   // 그림자 없음 — 반사식 화면에는 뜨는 면이 없다

      "tokens": {
        "bg": "#f3f2ee",
        "fg": "#1b1b1b",
        "accent": "#4a4a4a",   // 무채색 — 강조조차 회색이다
        "surface": "#e7e6e1",
        "border": "#d2d1cb"
      },

      "prose": {
        "heading": "#111111",
        "headingRule": "#c9c8c2",
        "link": "#1b1b1b",
        "linkUnderline": true,      // 색이 없으니 밑줄이 유일한 링크 표시다

        "quote": "#3f3f3f",
        "quoteBar": "#9a9a9a",
        "quoteBg": "#ebeae6",

        "code": "#2e2e2e",
        "codeBg": "#e4e3de",
        "preBg": "#ecebe6",
        "synKey": "#1f1f1f",
        "synStr": "#4f4f4f",

        "marker": "#5c5c5c",
        "rule": "#cfcec8",
        "tableHead": "#e7e6e1",
        "tableZebra": "#ecebe6",
        "markBg": "#dedcd4",
        "muted": "#545454",
        "selection": "#d4d3cd",

        "note": "#4a4a4a",
        "warn": "#2e2e2e",          // 가장 진하게 = 가장 급하게
        "tip": "#6a6a6a",
        "error": "#8a3f38"          // 유일한 유채색
      }
    }
  ]
}
`;

const EPAPER_COLOR_JSONC = `// 컬러 전자잉크 — 전자잉크의 무채색 바탕은 그대로 두고 **강조에만** 색이 든다.
//
// 이 파일이 "내 테마 만들기"의 본보기다. 하는 일은 셋뿐이다:
//   1. 바탕(bg·fg·surface·border)은 전자잉크 값을 그대로 쓴다 — 종이 느낌을 안 건드린다.
//   2. 강조만 바꾼다. 제목·링크는 찬색(남색 잉크), 목록 마커·형광은 따뜻한색(황토)이라
//      "구조"와 "표시"가 색으로 갈린다.
//   3. 제목 6단계 색 사다리는 옆의 epaper-color.css 가 맡는다(토큰에 자리가 없는 값).
//
// error 는 전자잉크의 벽돌색을 그대로 뒀다 — "오류만 붉다"는 규칙이 색이 생겨도 살아 있게.
{
  "version": 1,
  "themes": [
    {
      "id": "epaper-color",
      "name": "컬러 전자잉크",
      "type": "light",
      "elevation": "flat",

      "tokens": {
        "bg": "#f3f2ee",
        "fg": "#1b1b1b",
        "accent": "#1f4e79",   // 남색 잉크
        "surface": "#e7e6e1",
        "border": "#d2d1cb"
      },

      "prose": {
        "heading": "#16324a",       // 감청 — 6단계 사다리의 h2 자리
        "headingRule": "#c9c8c2",
        "link": "#1f4e79",
        "linkUnderline": false,     // 색이 생겼으니 밑줄이 유일한 신호가 아니다

        "quote": "#3f3f3f",
        "quoteBar": "#1f4e79",
        "quoteBg": "#ebeae6",

        "code": "#1f4e79",
        "codeBg": "#e4e3de",
        "preBg": "#ecebe6",
        "synKey": "#16324a",
        "synStr": "#6b4a1a",

        "marker": "#8a5a1f",        // 황토 — 목록 불릿·번호·체크박스
        "rule": "#cfcec8",
        "tableHead": "#e7e6e1",
        "tableZebra": "#ecebe6",
        "markBg": "#f0e3bd",        // ==형광== 도 같은 황토 계열
        "muted": "#545454",
        "selection": "#cfdae4",

        "note": "#1f4e79",
        "warn": "#8a5a1f",
        "tip": "#2f6146",
        "error": "#8a3f38"
      }
    }
  ]
}
`;

const EPAPER_CSS = `/* 전자잉크 — 무채색 화면의 제목 위계 */

${HEADING_LADDER_CSS}`;

/** 컬러판은 **같은 사다리 위에** 색만 얹는다 — 사다리를 다시 적지 않는다. */
const EPAPER_COLOR_CSS = `/* 컬러 전자잉크 — 모양은 전자잉크와 같고, 제목에 색 사다리를 더 얹는다.
   prose 토큰에는 제목 색이 하나뿐이라(--prose-heading) 6단계를 담을 자리가 없다.
   그럴 때는 **팩 CSS 맨 위에 자기 변수로 모아 선언**한다 — 리터럴을 규칙마다
   흩뿌리지 않는 방법이고, 색을 바꿀 때 여기 여섯 줄만 고치면 된다. */

.md {
  --h1: #111b26;  /* 먹빛 감청 — 거의 검정 */
  --h2: #16324a;  /* 감청 */
  --h3: #1f4e79;  /* 남색 */
  --h4: #2a6478;  /* 청록 */
  --h5: #606060;  /* 회색 — 여기서 색이 빠진다 */
  --h6: #6a6a6a;  /* 옅은 회색 */
}

${HEADING_LADDER_CSS}
/* 색 사다리는 위 모양 규칙 **뒤**에 온다 — 같은 특정도라 나중이 이긴다. */
h1 { color: var(--h1); }
h2 { color: var(--h2); }
h3 { color: var(--h3); border-left-color: var(--h3); }
h4 { color: var(--h4); }
h5 { color: var(--h5); }
h6 { color: var(--h6); }
`;

export const SEED_FILES: readonly SeedFile[] = [
  // 안내문이 먼저다 — [테마 폴더 열기] 가 이 파일을 선택해 열어 폴더 *안*을 보여 준다.
  // 시드가 들어가고 나면 폴더가 비는 일이 없어 openThemeFolder 의 "비었을 때 만든다" 분기는
  // 사실상 안 돌기 때문에, 여기서 함께 넣지 않으면 안내문을 영영 못 보게 된다.
  { name: "README.md", text: THEME_FOLDER_GUIDE },
  { name: "10-hanji.jsonc", text: HANJI_JSONC },
  { name: "20-epaper.jsonc", text: EPAPER_JSONC },
  { name: "30-epaper-color.jsonc", text: EPAPER_COLOR_JSONC },
  { name: "epaper.css", text: EPAPER_CSS },
  { name: "epaper-color.css", text: EPAPER_COLOR_CSS },
];

/** `read_theme_bundle` 이 돌려주는 것과 같은 모양의 한 항목(확장자 뗀 이름 · 진짜 파일명 · 본문). */
export interface SeedEntry {
  name: string;
  file: string;
  text: string;
}

/** 시드를 **디스크에서 읽은 것처럼** 묶는다. 파일이 아직 없을 때의 대역(load.ts)과
 *  테스트가 같은 것을 보게 하려고 여기 둔다 — 두 곳이 각자 묶으면 어긋난다. */
export function seedEntries(ext: ".jsonc" | ".css"): SeedEntry[] {
  return SEED_FILES.filter((f) => f.name.endsWith(ext)).map((f) => ({
    name: f.name.slice(0, -ext.length),
    file: f.name,
    text: f.text,
  }));
}
