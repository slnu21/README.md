# 테마

CSS 변수 토큰 기반 **테마 레지스트리**. 코드 수정 없이 테마를 추가할 수 있다 —
`App.css`에는 테마 이름이 박힌 규칙이 **하나도 없다**(0개, 테스트로 확인 가능).

## 테마는 어디에 있나

**내장은 셋뿐이다.** 나머지는 `themes\` 폴더에 처음 한 번 넣어 주는 **파일**이다(v0.9.0).

| id | 이름(ko / en) | 어디에 | 성격 |
|---|---|---|---|
| `light` | 라이트 / Light | 내장 | 기본 |
| `dark` | 다크 / Dark | 내장 | |
| `paper` | 페이퍼 / Paper | 내장 | 크림톤 종이 |
| `hanji` | 한지 / Hanji | `10-hanji.jsonc` | 미색 바탕 · 먹 글자 · 주사(朱砂) 강조 · 발(簾) 무늬 |
| `epaper` | 전자잉크 / E-Paper | `20-epaper.jsonc` + `epaper.css` | 무채색 · 평면 · 링크는 밑줄 |
| `epaper-color` | 컬러 전자잉크 / Color E-Paper | `30-epaper-color.jsonc` + `.css` | 무채색 바탕에 강조만 유채색 |

**왜 파일로 내렸나**: 상수로 두면 사용자가 색 하나를 바꾸려 해도 같은 id 로 통째로 덮어써야
하고, 무엇을 물려받았는지 안 보인다. 팩을 주고받자는 기능에서 **우리 테마만 못 고치는 것이**
앞뒤가 안 맞았다. 내장에 셋을 남긴 것은 **파일이 하나도 없어도 앱이 반드시 쓸 수 있는
최소한**이기 때문이다 — 시드가 실패하거나 폴더를 통째로 비워도 이 셋은 사라지지 않는다.

파일이므로 **지우면 그 테마가 사라진다**(의도된 결과다). 지운 것이 되살아나지 않도록 시드는
판 번호(`themeSeedVersion`)로 한 번만 돈다 — 폴더가 비었는지로 판정하면 한지를 지운 사람에게
매번 다시 들이밀게 된다. 쓰기는 `create_new` 라 사용자의 편집본을 덮지 않으므로, 나중에
`SEED_VERSION` 을 올리면 **없는 파일만** 새로 들어간다.

이름은 여전히 i18n 키(`theme.<id>`)에서 온다 — 그래서 ko/en 이 유지된다. 대신 **시드 파일의
`name` 을 바꿔도 이 셋은 번역된 이름이 뜬다**(알려진 워트). 사용자가 만든 새 id 는 파일의
`name` 이 그대로 표시된다.

### 제목 위계는 테마 CSS 가 진다

`PREVIEW_CSS` 는 h1~h5 를 **전부 같은 `--prose-heading`** 으로 칠하고 h6 만 muted 다. 색이 있는
테마에서는 크기(1.95 / 1.45 / 1.2 / 1.06 / 1.0 / 0.92em)로 충분하지만, **무채색 테마에서는
h4·h5·h6 이 사실상 같은 줄로 보인다.** 그래서 전자잉크 계열은 자기 CSS(`epaper.css`)로
굵기·이중괘선·좌측 막대·자간을 얹어 여섯 단을 가른다 — 색은 한 자리도 직접 적지 않는다
(전부 `var(--prose-*)` 파생이라 테마를 바꿔도 어울린다).

컬러판은 **같은 사다리 위에 색만 얹는다**. 제목 6단계 색은 prose 토큰에 자리가 없으므로
(`heading` 하나뿐) 팩 CSS 맨 위에 자기 변수로 모아 선언한다:

```css
.md { --h1:#111b26; --h2:#16324a; --h3:#1f4e79; --h4:#2a6478; --h5:#606060; --h6:#6a6a6a; }
h1 { color: var(--h1); }  /* … */
```

**하한을 계층별로 나눴다.** 여섯 단을 전부 7:1 로 묶으면 쓸 수 있는 명도 폭이 `L <= 0.084` 로
좁아져 여섯 단이 서로 구분되지 않는다 — 사다리를 만들려다 없애는 셈이다. 문서 구조를 지는
h1~h3 은 7:1(`heading` 과 같은 잣대), 잔가지인 h4~h6 은 4.5:1(`muted` 와 같은 잣대), 그리고
**단조 감소**를 테스트로 못박는다(`themes/seeds.test.ts`).

## 토큰 세 층

### 1. 핵심 5토큰 — `tokens`

`--bg` `--fg` `--accent` `--surface` `--border`. **여기서 앱 크롬·CodeMirror·mermaid·미리보기가
전부 파생된다**(`App.css`의 `--muted`/`--faint`/`--hover`/… 는 `color-mix` 파생).

**반드시 6자리 hex** 여야 한다. `lib/mermaid.ts` `diagramConfig()`가 이 다섯을 khroma로 파생하므로
`color-mix()`·`var()`·`rgb()`가 섞이면 다이어그램 렌더가 통째로 터진다. `lib/mermaid.test.ts`가
모든 테마에 대해 `themeVariables` 결과를 `/^#[0-9a-f]{6}$/i` 로 검사한다.

### 2. 서식 색 23개 — `prose`

미리보기(리딩) 문서 안에서만 쓰는 `--prose-*`. 목록·의미·순서 계약은
[rendering.md](rendering.md#서식-색-위계prose-토큰) 참고.

**적지 않아도 된다.** 지정하지 않은 항목은 `PROSE_DEFAULT_CSS`가 핵심 5토큰에서
`color-mix`로 파생한다 → 사용자 테마의 최소 기재량이 0이다.

### 3. 면(面) 열거값 — `texture` · `elevation`

| 필드 | 값 | 뜻 |
|---|---|---|
| `texture` | `"none"`(기본) · `"hanji"` | 리딩 카드 바탕 무늬 |
| `elevation` | `"soft"`(기본) · `"flat"` | 카드·앱 그림자 |

**열거값인 이유**: 사용자 파일이 CSS 문자열을 그대로 넣게 두면 값 안의 `;`+`}` 로 스타일 블록을
벗어날 수 있다. 값을 hex와 열거값으로만 좁히면 그 경로가 구조적으로 사라진다.

한지 무늬는 손으로 뜬 종이에 남는 가로 발자국을 `repeating-linear-gradient` 로 흉내 낸다 —
자산 0바이트, 필터 합성 없음, 확대해도 안전. 인쇄·PDF에서는 `PRINT_CSS`가 끄고,
프레젠테이션에서는 `SLIDE_CSS`의 `background:transparent`(단축 속성)가 저절로 지운다.

`applyTheme()`는 `--shadow`를 **분기마다 반드시 대입한다** — `setProperty`는 속성을 지우지 않아,
안 그러면 `flat` → `soft` 로 되돌려도 그림자가 안 돌아온다.

## 사용자 테마 파일

`%APPDATA%\com.readme.app\themes.jsonc` — SQLite DB 옆. 설정 팝오버의
**테마 파일 열기** / **다시 불러오기** 두 버튼이 입구다(버튼 툴팁에 해석된 실제 경로가 뜬다).

> **MSIX 패키지본에서는 그 경로가 실제 경로가 아닐 수 있다.** Windows 는 패키지 앱의
> `%APPDATA%` 쓰기를 컨테이너로 돌린다(copy-on-write) — 그러면 `app_data_dir()` 이 주는 경로는
> 앱 안에서만 유효하고, 컨테이너 **밖**인 탐색기는 그 경로를 못 찾는다. v0.8.0 에서
> [테마 폴더 열기] 가 "폴더가 없다"로 죽던 정체가 이것이다. `app_paths::user_data_dir` 이
> **만들어 보고 어디에 생겼는지 보아**(이미 하던 `create_dir_all` 이 곧 probe 다) 물리 경로를
> 정한다. 자세히는 `docs/notes/development.md`.

```jsonc
{
  "version": 1,
  "themes": [
    {
      "id": "my-hanji",       // 있는 테마 id 를 쓰면 그 테마를 덮어쓴다
      "name": "내 한지",
      "extends": "hanji",     // 바탕 — 폴더의 팩(한지)도 바탕이 될 수 있다
      "type": "light",
      "texture": "hanji",
      "elevation": "soft",
      "tokens": { "bg": "#f2ecdf", "fg": "#221f1c" },
      "prose": { "heading": "#1f1c19", "marker": "#9c3a2e" }
    }
  ]
}
```

규칙: 색은 **6자리 hex 만**(`#abc` 는 `#aabbcc` 로 정규화, 그 밖은 무시) · 주석 가능 ·
트레일링 콤마 불가 · 값을 지우면 기본 파생으로 돌아간다.

**fail-soft** — 파일이 없으면 조용히 내장 테마만, JSON 이 깨지면 줄 번호를 토스트로 알리고
내장 테마를 유지, 잘못된 색은 그 항목만 버린다. 선택 중이던 테마가 파일에서 사라지면
기본 테마로 떨어진다.

### 부팅 순서 (첫 페인트 깜빡임 없음)

`main.tsx` 는 첫 페인트 전에 `applyTheme` 를 **동기** 호출한다. 디스크 읽기는 비동기 IPC라
그대로 두면 사용자 테마 사용자에게 light 가 한 번 번쩍인다 → **파일 원문을 스토어에 캐시**하고
(`customThemesText`, localStorage 는 동기), 부팅 때 그 원문을 동기 파싱해 레지스트리에 넣는다.
디스크 읽기는 그 뒤에 따라와 다르면 갱신한다(`themeRev` 증가 → 앱 크롬·미리보기 재적용).

**파싱 결과가 아니라 원문을 캐시하는 이유**: 검증을 안 거친 객체가 localStorage 를 통해 테마로
승격되는 경로가 없어지고, `Theme` 모양이 바뀌어도 낡은 캐시가 표류하지 않는다.

## 스타일 팩 — 테마가 갖는 CSS

테마는 색뿐 아니라 **모양**도 갖는다. 전역 `custom.css` 를 두지 않은 이유는 셋이다 —
끄는 방법이 없고, 두 사람의 팩이 섞이며, 공유 단위가 "CSS + 어느 테마" 로 흩어진다.
테마별로 두면 **전환이 곧 토글**이고, 한 번에 하나만 활성이라 충돌이 없다.

```
<앱 데이터 폴더>\
├── themes.jsonc              손으로 쓰는 내 테마 (앱이 기계적으로 다시 쓰지 않는다)
└── themes\
    ├── README.md             폴더 안내          ┐
    ├── 10-hanji.jsonc        한지               │ 첫 실행에 한 번 넣어 준다
    ├── 20-epaper.jsonc       전자잉크           │ (themes/seeds.ts · create_new)
    ├── 30-epaper-color.jsonc 컬러 전자잉크      │
    ├── epaper.css            <id>.css — 모양    │
    ├── epaper-color.css                        ┘
    └── slnu-gothic.jsonc     받은 팩 (테마 + styles 인라인)
```

**파일명 앞 번호가 읽는 순서이자 목록 순서다.** 번호가 없으면 `epaper-color` 가 `epaper` 보다
먼저 와(`-` < `.`) 목록이 뒤집힌다. 사이드카는 `<테마id>.css` 라야 하므로 번호가 붙지 않는다.

**앱이 `themes.jsonc` 를 기계적으로 다시 쓰지 않는 것**이 배치의 핵심이다. 그 파일은
주석이 곧 설명서인데, 가져오기가 거기 항목을 추가하면 사용자가 쓴 주석과 서식이 날아간다.
받은 것은 `themes\` 안에 별도 파일로 둔다 — **폴더에 떨어뜨리는 것이 곧 가져오기**다.

### 우선순위 — 원칙 하나

**내가 손으로 쓴 것이 남이 준 것을 이긴다.**

1. 내장 테마
2. `themes\*.jsonc` (파일명 오름차순 — 겹치면 뒤가 이긴다. 정렬은 Rust 가 한다)
3. `themes.jsonc` (최종 승자)

CSS 도 같다 — 사이드카 `themes\<id>.css` 가 팩에 인라인된 `styles` 를 이긴다.

**같은 순서가 `extends` 의 바탕이기도 하다.** 바탕 맵은 읽으면서 자라므로, 뒤에 읽는 것이
앞서 읽은 테마를 물려받을 수 있다 — 내 `themes.jsonc` 가 폴더의 한지를 바탕으로 삼는 것이
가장 흔한 쓰임이다. 반대로 **앞선 팩이 뒤에 올 팩을 물려받지는 못한다**(순서가 곧 규칙이다).
이게 없으면 한지가 파일로 내려간 순간 `"extends":"hanji"` 가 조용히 `light` 로 떨어진다.

### 두 형식

| | 형식 | 왜 |
|---|---|---|
| 편집용 | 사이드카 `<id>.css` | 진짜 `.css` 라 편집기가 문법을 강조한다 |
| 교환용 | 팩 안 `"styles": { "<id>": "…" }` | 파일 하나라 잃어버리지 않는다 |

내보내기(`buildThemePack`)가 앞을 뒤로 바꾼다. `extends` 로 물려받은 값까지 펼쳐 담으므로
**받는 쪽에 그 바탕 테마가 없어도 된다**. 기본값인 항목은 빼서 읽을 만한 파일로 남긴다.

### 주입 위치가 계약이다

`buildDoc` 의 `<style>` 순서: `PROSE_DEFAULT_CSS` → 테마 `:root` → `PREVIEW_CSS` →
**테마 CSS** → `extra`.

- `PREVIEW_CSS` **뒤** — 팩이 기본 모양을 덮을 수 있어야 한다.
- `extra` **앞** — 인쇄 여백·슬라이드 배치·읽기 폭 같은 **앱 설정**이 팩에 밀리면 안 된다
  (팩 하나 때문에 인쇄가 망가지는 일을 막는다).

## 공개 API — 팩이 기대도 되는 것

공유를 지원한다는 건 DOM 모양의 **일부를 얼린다**는 뜻이다. 전부가 아니라 아래만 약속한다.

| 훅 | 무엇 |
|---|---|
| `.md` | 문서 카드 루트 — 선택자를 이 안에 두기를 권한다 |
| `h1`~`h6` | `id`=제목 슬러그, `data-line`=원본 줄 번호 |
| 표준 태그 | `blockquote ul ol li table pre code hr img dl` |
| `.callout` | `.note` · `.warning` · `.tip` |
| `.footnotes` | `.footnote-ref` · `.footnote-backref` |
| `.task-list-item` | `.task-list-item-checkbox` |
| `.mermaid-rendered` | 다이어그램 래퍼(SVG 내부는 mermaid 소관) |
| `[data-line]` | 모든 블록 요소 |
| `--prose-*` 23개 | 색 어휘 |
| `.hljs-*` | 코드 강조(highlight.js 상류 어휘) |

**그 밖의 내부 클래스는 예고 없이 바뀐다.** 그리고 관례 한 줄 — **색은 `themes.jsonc`,
모양은 CSS.** 팩이 색을 literal 로 박으면 다른 테마에서 어긋난다.

### 안전 경계

| | |
|---|---|
| 스크립트 실행 | **불가** — iframe 에 `allow-scripts` 없음 + CSP `script-src 'self'` |
| 원격 요청 | **불가** — CSP `img-src` 가 막는다(`@import`·웹폰트·이미지 URL 전부) |
| 앱 크롬 변경 | **불가** — 주입 지점이 미리보기 문서 하나뿐이다 |
| 문서 내용 왜곡 | **가능** — `display:none`·`content:` 로 속일 수는 있다 |

즉 **훔치지는 못하고 속일 수는 있는** 수준이다. 그래서 유일하게 막는 것은
**`</style>`** 하나다 — 값이 그걸 품으면 스타일 요소를 닫고 임의 HTML 이 되므로
대소문자·공백 변형까지 잡아 CSS 를 통째로 버린다(`sanitizeThemeCss`). 색은 살아남는다.

CSS 파서는 넣지 않았다 — 큰 의존성이고 "검사했다"는 착각만 준다. 브라우저가 이미
모르는 규칙을 조용히 무시하고, 이상하면 **내장 테마로 한 번 전환**하면 빠져나온다.

## 구현

`src/app/themes/` — `index.ts`(레지스트리·내장 셋) · `prose.ts`(서식 토큰·기본값) ·
`apply.ts`(:root 주입) · `custom.ts`(파싱·CSS 검증·팩 만들기, 전부 순수) · `load.ts`(디스크 I/O·시드) ·
`seeds.ts`(처음 넣어 주는 팩 원문 — 한지·전자잉크·컬러 전자잉크와 제목 사다리 CSS) ·
`template.ts`(themes.jsonc 템플릿·폴더 안내문). Rust 는 `app_paths.rs`(물리 경로 해석)와
`commands/fs_ops.rs` 의 `theme_file_path`·`theme_dir_path`·`read_theme_bundle`.
미리보기 주입은 `lib/renderDoc.ts` `themeVarsCss()`. 상태는 `src/app/store`.
