// 처음 만들어 주는 사용자 테마 파일. **의존성 0** — 파서가 이걸 실제로 읽을 수 있는지
// 단위 테스트가 검사하기 위해 따로 둔다(템플릿이 곧 사용자의 첫 경험이다 — 오타 하나면
// 파일을 열자마자 경고 토스트를 보게 된다).

/** 처음 만들어 주는 파일. **이 파일 자체가 설명서다** — JSONC 를 고른 이유가 이것이다. */
export const THEME_FILE_TEMPLATE = `// README.md — 내 테마
//
// 이 파일을 저장한 뒤 [설정 ▸ 테마 다시 불러오기] 를 누르면 바로 반영됩니다.
//
//   · 색은 6자리 16진수만 씁니다: "#rrggbb" (짧은 "#abc" 도 됩니다)
//     rgb()·색 이름·CSS 함수는 무시되고, 그 항목만 원래 색으로 남습니다.
//   · 주석(// 와 /* */)은 써도 되지만, 마지막 쉼표(,)는 안 됩니다.
//   · 항목을 지우면 그 자리는 자동 계산된 기본값으로 돌아갑니다.
//   · "extends" 로 기본 테마를 바탕에 깔면 바꾸고 싶은 값만 적으면 됩니다.
//   · "id" 를 기본 테마와 같게 하면(light·dark·paper·hanji·epaper) 그 테마를 덮어씁니다.
//
// 잘못 적어도 앱이 죽지는 않습니다. 무시한 항목은 알림으로 알려 드립니다.
{
  "version": 1,
  "themes": [
    {
      "id": "my-hanji",
      "name": "내 한지",
      "extends": "hanji",   // 바탕 테마 (없으면 light)
      "type": "light",      // "light" | "dark" — 그림자 방향과 색 구성표
      "texture": "hanji",   // "none" | "hanji" — 리딩 카드의 발(簾) 무늬
      "elevation": "soft",  // "soft" | "flat" — "flat" 은 그림자 없음(전자잉크 느낌)

      // 앱 전체(사이드바·탭·편집기·미리보기·다이어그램)가 이 다섯에서 파생됩니다.
      "tokens": {
        "bg": "#f2ecdf",       // 바탕
        "fg": "#221f1c",       // 글자
        "accent": "#9c3a2e",   // 강조(링크·선택·다이어그램 노트)
        "surface": "#e8e0cd",  // 바탕보다 살짝 뜨는 면(사이드바·표 머리글)
        "border": "#d9cfb8"    // 테두리
      },

      // 미리보기(리딩 모드) 서식 색. 안 적은 항목은 위 다섯에서 자동으로 나옵니다.
      "prose": {
        "heading": "#1f1c19",       // 제목 h1~h6
        "headingRule": "#cbb997",   // h1·h2 아래 밑줄
        "link": "#9c3a2e",
        "linkUnderline": false,     // true = 항상 밑줄(색이 없는 테마용)

        "quote": "#4a443b",         // 인용문 글자
        "quoteBar": "#9c3a2e",      // 인용문 왼쪽 막대
        "quoteBg": "#ebe3d1",       // 인용문 바탕

        "code": "#652e26",          // 인라인 코드 글자
        "codeBg": "#e8d7ca",        // 인라인 코드 바탕
        "preBg": "#ece6d9",         // 코드 블록 바탕
        "synKey": "#84352a",        // 코드 강조 — 키워드
        "synStr": "#7a4a3c",        // 코드 강조 — 문자열

        "marker": "#9c3a2e",        // 목록 불릿·번호·체크박스
        "rule": "#d9cfb8",          // 가로선·표 테두리
        "tableHead": "#e8e0cd",     // 표 머리글 바탕
        "tableZebra": "#efe8d9",    // 표 짝수 행 바탕
        "markBg": "#e8d9a8",        // ==형광== 바탕
        "muted": "#6b6357",         // 각주·캡션·h6
        "selection": "#e0c9b8",     // 글자 끌어 선택했을 때

        "note": "#9c3a2e",          // ::: note
        "warn": "#a8641f",          // ::: warning
        "tip": "#3f6f4a",           // ::: tip
        "error": "#a3382c"          // 렌더 오류·삭제된 코드 줄
      }
    }
  ]
}
`;

/** `themes/` 폴더에 처음 들어가는 안내문. **[테마 폴더 열기]가 이 파일을 선택해 연다** —
 *  그래야 탐색기가 폴더 *안*에서 열리고(부모에서 폴더만 선택되는 게 아니라), 무엇보다
 *  "이 폴더에 뭘 넣지?"에 그 자리에서 답이 된다. `.md` 라 이 앱으로 바로 열어 읽을 수도 있다.
 *  폴더가 비어 있을 때만 만든다 — 지운 사람에게 다시 들이밀지 않는다. */
export const THEME_FOLDER_GUIDE = `# 테마 폴더 / Theme folder

여기에 넣는 것 / What goes here:

| 파일 | 뜻 |
|---|---|
| \`*.jsonc\` | 받은 테마 팩. 넣기만 하면 읽힙니다 — 이게 "가져오기"입니다. |
| \`<테마id>.css\` | 그 테마만의 모양(CSS). 예: \`my-hanji.css\` |

바꾼 뒤 **설정 ▸ 테마 다시 불러오기**를 누르세요.

## 규칙 셋 / Three rules

1. **색은 \`themes.jsonc\`, 모양은 CSS.** 색을 CSS에 적으면 다른 테마에서 어긋납니다.
2. **색은 토큰으로.** \`#9c3a2e\` 대신 \`var(--prose-marker)\` 를 쓰면 어느 테마에서나 맞습니다.
3. **내가 손으로 쓴 것이 이깁니다.** 같은 id면 \`themes.jsonc\` 가 이 폴더의 팩을 이깁니다.

## 쓸 수 있는 선택자 / Stable hooks

\`.md\`(문서 루트) · \`h1\`~\`h6\`(\`id\`=제목 슬러그, \`data-line\`=원본 줄) ·
\`blockquote ul ol li table pre code hr img dl\` · \`.callout\`(\`.note\` \`.warning\` \`.tip\`) ·
\`.footnotes\` \`.footnote-ref\` · \`.task-list-item\` · \`.mermaid-rendered\` · \`.hljs-*\` · \`[data-line]\`

그 밖의 내부 클래스는 예고 없이 바뀔 수 있습니다.

## 예시 — 제목 앞 세로 막대

\`\`\`css
/* <테마id>.css */
h2 { position: relative; padding-left: 16px; }
h2::before {
  content: "";                       /* 글자가 아니라 빈 상자 */
  position: absolute; left: 0; top: .18em; bottom: .18em;
  width: 4px; border-radius: 2px;
  background: var(--prose-marker);   /* 토큰 — 테마를 따라간다 */
}
\`\`\`

원격 주소(웹폰트·이미지 URL)는 오프라인 앱이라 막혀 있습니다. \`data:\` URI 로 넣으세요.
`;
