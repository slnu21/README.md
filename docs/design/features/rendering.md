# 마크다운 렌더링

엔진 **markdown-it** + 플러그인으로 "최대한 다양한 기능"을 지원한다.

## 활성 예정 기능/플러그인
- GFM 류: 표, 체크리스트(task-lists), 자동 링크(linkify), 취소선.
- 인라인 확장: sub/sup, mark, ins, abbr, emoji.
- 블록: footnote, deflist, container(admonition/callout), multimd-table.
- 구조: front-matter, anchor + toc.
- 수식: **KaTeX**(폰트 번들). 다이어그램: **mermaid**(지연 렌더).
- 코드 하이라이트: **highlight.js**(언어 지연 로드).

## 보안
- `html: true`(원시 HTML 허용)지만 렌더 결과는 **반드시 DOMPurify로 정화** 후 **샌드박스 iframe** 주입.
- DOMPurify가 지운 `href`(허용 스킴 밖)는 **`data-blocked-href`에 값만 기록**한다. href를 되살리지 않으므로 보안 경계는 그대로고, "눌러도 아무 일 없는 링크"에 이유를 붙일 수 있다.

## 링크 열기
미리보기·프레젠테이션이 같은 규칙을 쓴다. 순수 분류는 `lib/links.ts`(`classifyLink`·`howFromModifiers`, vitest), DOM 글루는 `lib/previewLinks.ts`.

| 대상 | 클릭 | Ctrl(⌘)+클릭 | Alt+클릭 |
|---|---|---|---|
| `http`·`https`·`mailto`·`tel` | OS 기본 브라우저 | (같음) | (같음) |
| `#앵커` | 문서 내 스크롤 | (같음) | (같음) |
| 내부 `.md`·`.txt` | 현재 탭 활성 | 옆 패널(`openBeside`) | 탐색기에서 위치 |
| 그 밖의 로컬 파일 | OS 기본 앱 | (같음) | 탐색기에서 위치 |

- **맨클릭이 곧 열기다.** 미리보기는 편집면이 아니라 읽는 면이라 클릭에 다른 뜻이 없고, 같은 화면의 내부 문서 링크가 이미 맨클릭으로 열린다. 수식어는 *추가* 목적지에만 쓴다.
- **웹 주소는 `plugin:opener|open_url`** 로 연다. `open_path`는 `opener:default` 스코프에 없어 ACL이 거부한다(v0.6.8~v0.7.0 동안 외부 링크가 죽어 있던 원인). capability는 바꾸지 않는다.
- **로컬 파일은 우리 커맨드 `commands/shell_open.rs open_with_default`** 가 연다. `opener:allow-open-path` + `{"path":"**"}`를 여는 대신 **Rust에서 확장자 허용 목록을 검사**한다 — 링크 대상은 문서 작성자가 쓴 문자열이므로 프런트가 뚫려도 `.exe`가 열리면 안 된다. 실행·스크립트·간접 실행(`lnk`·`url`·`hta`·`chm`)·**로컬 html**은 `EUNSAFE`로 거절하고 대신 탐색기에서 위치를 연다. 없으면 `ENOENT`.
- **실패는 삼키지 않는다** — `shell/Toast.tsx` + 스토어 `notice`(비영속)로 화면에 남긴다. 링크에는 목적지를 `title`로 단다.
- **markdown-it 의 `validateLink` 가 먼저 거른다** — `javascript:`·`file:`·`vbscript:`·`data:` 는 **링크 자체가 만들어지지 않고 글자로 남는다.** 그래서 `data-blocked-href`·`file:///` 처리는 문서에 **원시 HTML 로 적힌 `<a>`** 와 그 밖의 스킴(`obsidian:` 등)에 대해 동작한다. 실검증 픽스처도 그 둘을 HTML 로 적어야 재현된다.
- `file:///`는 로컬 경로로 옮겨 다룬다(호스트가 붙은 UNC `file://server/share`는 무시). 스킴이 한 글자일 때만 Windows 드라이브 문자로 본다 — 등록된 URL 스킴은 모두 두 글자 이상이라, 이 규칙이 `obsidian:`류가 로컬 경로 분기로 새는 것을 막는다.
- 링크로 감싼 이미지(배지)는 **링크가 라이트박스를 이긴다**. 감싸지 않은 이미지만 라이트박스.

## 글 방향(bidi — 페르시아어·아랍어·히브리어)

설정 **글 방향: 자동 / 왼→오 / 오→왼**(설정 창 + 팔레트, 전역·영속, 기본 자동). 편집기·미리보기·
프레젠테이션·HTML/PDF 내보내기가 같은 값을 따른다. 사용자 요청("Farsi 로 쓰려니 RTL 을 지원하지
않는다")에서 시작했다. 픽스처 `docs/samples/rtl-persian.md` · 기하 검사 `npm run probe:rtl`.

**RTL 정확성은 언어가 아니라 기하 문제다.** 글자를 어느 쪽부터 놓을지는 유니코드 양방향 알고리즘이
글자 속성으로 정하고 Chromium 이 실행한다. 우리가 만드는 것은 브라우저가 그렇게 하도록 **놔두는 것**
— 기준 방향, 정렬, 여백·막대의 좌우 — 이고, 그건 픽셀 좌표로 잰다. 페르시아어를 읽을 필요가 없다.

| 층 | 무엇을 | 어디서 |
|---|---|---|
| 렌더러 | 잎 블록(p·h1~h6·th·td·dt·dd·caption)에 `dir="auto"`, 컨테이너(ul·ol·li·blockquote·table·dl·콜아웃)에 **계산한** `data-dir` (ltr 또는 rtl) — 설정과 무관하게 항상 | `lib/markdown.ts` `bidi_dir` 코어 룰 · 판정은 `lib/bidi.ts` |
| 문서 | 루트 `.md` 에 `dir`(자동이면 본문 첫 강한 글자) + `data-dir-mode` | `lib/renderDoc.ts` `buildDoc` |
| CSS | 좌우는 전부 논리 속성 · 강제 모드는 `.md[data-dir-mode=x] :is([dir=auto],[data-dir]){direction:x}` 두 줄 · `pre,math{direction:ltr}` · 인라인 `code{unicode-bidi:plaintext}` · 다이어그램은 `DIAGRAM_CTX_CSS` 의 `direction:ltr` | `PREVIEW_CSS` |
| 편집기 | 자동 = 줄마다 첫 강한 글자로 `dir`(강한 글자 없는 줄은 위 줄을 따른다 — 표 구분 행) + `perLineTextDirection` · 강제 rtl = `.cm-editor[dir=rtl]`(거터가 오른쪽으로) · 펜스 코드 줄은 언제나 `dir=ltr` · URL 은 LTR, 인라인 코드는 자기 방향으로 **격리**(`bidiIsolate`, outerDecorations) | `features/editor/direction.ts` |

- **컨테이너는 우리가 계산해야 한다.** 브라우저의 `dir="auto"` 는 *dir 속성을 가진 자식을 통째로 건너뛴다*(HTML directionality 알고리즘). 잎마다 auto 를 달면 부모 `ul`·`blockquote`·`table` 은 볼 텍스트가 없어 항상 LTR 로 떨어지고 — 목록 여백·인용문 막대·표 열 순서가 왼쪽에 남는다. 같은 이유로 문서 루트도 `dir=auto` 가 아니라 계산값이다.
- **왜 렌더러가 설정을 모르는가.** 워커의 렌더 결과가 설정에 묶이지 않는다 — 방향 전환은 테마 바꾸듯 `buildDoc` 재조립만으로 즉시 되고, 내보낸 HTML 이 화면과 같은 속성을 담는다. `dir` 은 UA 수준 표현 힌트라 저자 CSS 의 `direction` 이 이기므로 강제 모드가 두 줄로 된다.
- **코드는 코드다.** 어느 모드에서도 `pre` 와 펜스 코드 줄은 LTR. 인라인 코드는 문단에서 격리해 자기 첫 글자로 정한다 — RTL 문장 속 `foo_bar()` 가 뒤집히지 않는다.
- **다이어그램 래퍼도 LTR 고정.** SVG 글자 자체는 `unicode-bidi` 없이는 `direction` 을 무시하지만(SVG 명세, 실측) 래퍼의 flex 시작점·가로 스크롤 원점은 따른다 → 루트가 RTL 이면 원본 모드의 넓은 차트가 오른쪽 끝에서 시작해 앞부분이 가려진다(고정을 빼고 재면 -1750px). `probe:mermaid` 가 paper 설정 넷을 루트 RTL 로 띄워 잰다.
- **문서 안 혼용이 기본이다.** 페르시아어 문서의 영어 문단은 왼쪽 정렬로, 한국어 문서의 페르시아어 인용은 오른쪽 정렬로 각자 놓인다. 강제 모드는 자동 판정이 어긋나는 문서(숫자·영어로 시작하는 문단)용 탈출구다. 방향 표식 문자(LRM `U+200E`·RLM `U+200F`)를 문단 앞에 붙이는 표준 수단도 존중한다.
- **`ltr` 강제 = 오늘 그대로.** 자동 판정은 첫 글자가 L 이면 ltr 이라 ko/en 문서는 좌표 하나 안 바뀐다(`probe:rtl` 이 영어·한국어 문단의 정렬 변을 함께 잰다).
- **안 한 것**: 앱 크롬 미러링(사이드바를 오른쪽으로 — Windows 앱은 UI 언어가 RTL 일 때만 미러링한다) · 페르시아어 UI 번역(별개 요청) · 아랍 문자 글꼴 번들(시스템 글꼴 선택으로 대신 — Vazirmatn 을 설치해 고르면 된다; 번들은 새 의존성 = 확인 게이트) · 검색의 `ی/ي`·`ک/ك` 접기(unicode61 이 안 한다, 알려진 한계).

### 검증이 언어를 모르고도 되는 이유
`probe:rtl` 은 진짜 앱 셸을 마운트해 픽스처를 열고 auto → rtl → ltr → auto 를 오가며 잰다: 페르시아어 문단 첫 글자의 사각형이 콘텐츠 상자 오른쪽 변에 닿는가(±1.5px) · 같은 문단을 `dir="rtl"` 로 직접 그린 **참조**와 첫 글자 x 가 같은가(브라우저가 정답 오라클) · 혼합 문단 `سلام 123 hello.` 의 시각 순서가 페르시아어 > hello > 마침표인가 · 인용문·콜아웃 막대가 `border-right` 인가 · 목록 여백이 `padding-right` 인가 · 표 첫 열이 오른쪽인가 · `pre`·`math` 가 ltr 인가 · 영어·한국어 문단은 왼쪽 정렬 그대로인가 · 편집기에서 `textDirectionAt` 이 줄마다 맞는가, RTL 줄 시작 커서가 오른쪽 변인가, RTL 글자 묶음 안에서 ← 가 논리적으로 앞으로 가는가(head 증가), URL 이 `dir=ltr` 로 격리돼 순서를 지키는가, 강제 rtl 에서 거터가 오른쪽으로 갔는가 · 내보낸 HTML 이 같은 속성을 담는가. 고치기 전(또는 일부러 되돌린 뒤) **FAIL 7건**을 먼저 봤다. 원어민 눈의 *자연스러움*(글꼴의 ZWNJ 처리·마크다운 기호의 자리)은 잴 수 없다 — 요청한 사용자에게 사전 빌드로 확인받는다.

## 서식 색 위계(prose 토큰)

미리보기 문서의 서식 색은 **`--prose-*` 커스텀 속성 23개**가 정한다. 정의는 `src/app/themes/prose.ts`,
사용은 `lib/renderDoc.ts` `PREVIEW_CSS` 하나 — 리딩·분할·프레젠테이션·HTML/PDF 내보내기가 같은 규칙을 본다.

| 묶음 | 변수 |
|---|---|
| 제목 | `--prose-heading` · `--prose-heading-rule`(h1·h2 밑줄) |
| 본문 | `--prose-link` · `--prose-link-deco` · `--prose-marker`(불릿·순번·체크박스) · `--prose-muted`(각주·캐션·h6) · `--prose-mark-bg` · `--prose-selection` |
| 인용 | `--prose-quote` · `--prose-quote-bar` · `--prose-quote-bg` |
| 코드 | `--prose-code` · `--prose-code-bg` · `--prose-pre-bg` · `--prose-syn-key` · `--prose-syn-str` |
| 선·표 | `--prose-rule`(hr·표 테두리·pre 테두리) · `--prose-table-head` · `--prose-table-zebra` |
| 콜아웃 | `--prose-note` · `--prose-warn` · `--prose-tip` · `--prose-error`(렌더 오류·삭제된 코드 줄) |
| 면 | `--paper-texture` · `--prose-card-shadow` (둘 다 열거값에서 생성) |

### 순서가 계약이다

`buildDoc` 은 `<style>` 을 **`PROSE_DEFAULT_CSS` → 테마 `:root` → `PREVIEW_CSS`** 순서로 쌀는다.
셀렉터 특정도가 같으므로 나중이 이긴다:

- 기본값이 테마보다 **앞**에 와야 테마 지정이 이긴다. 기본값을 `PREVIEW_CSS` 안에 두면 모든 테마를 덮어버린다.
- 그래서 기본값은 `PROSE_DEFAULT_CSS` 에만 있고, 테마는 **직접 정한 항목만** 내보낸다 → 새 테마가 prose 를
  하나도 안 적어도 동작하고(5토큰에서 `color-mix` 로 파생), 재빌드마다 나가는 바이트도 줄어든다.
- `lib/renderDoc.prose.test.ts` 가 세 가지를 못박는다: `PREVIEW_CSS` 가 참조하는 모든 변수에 기본값이 있다 ·
  `PREVIEW_CSS` 에는 `--prose-*` 선언이 없다 · 조립문 순서가 기본값→테마→규칙이다.

### 값은 6자리 hex 또는 열거값만

`themeVarsCss()` 가 직렬화 직전에 `isHex6()` 로 한 번 더 거른다. 이유 둘:

1. **mermaid** — `diagramConfig` 가 5토큰을 khroma 로 파생하므로 `color-mix()`·`var()` 가 섞이면 렌더가 터진다.
2. **CSS 탈출** — 값에 `;` 와 `}` 를 넣으면 `:root{}` 블록을 벗어난다. 사용자 자기 파일이라 보안 경계는
   아니고 샌드박스에 스크립트도 없지만, 값을 hex·열거값으로 좁히면 그 경로가 **구조적으로** 사라진다.

그래서 질감·그림자는 사용자 CSS 문자열이 아니라 **열거값**이다(`texture`·`elevation` → 사전 정의 상수).

### 가독성 하한을 테스트로 지킨다

`themes/prose.test.ts` 가 모든 내장 테마에 대해 본문 7:1, 제목 7:1, 강조·인용·각주·코드·마커 4.5:1 을 재고,
`PROSE_DERIVED`(JS 복사본)가 `PROSE_DEFAULT_CSS`(CSS 원본)와 **같은 식인지** 문자열로 대조한다 — 한쪽만 고치면
대비 검사가 거짓 통과하기 때문이다. 인용문 기본값이 62%일 때 paper 에서 3.81:1 로 떨어지는 것을
이 검사가 잡아 70%로 올렸다.

## 다이어그램 라벨 안 인라인 HTML
`htmlLabels:false`(v0.6.9, 라벨 잘림 수정) 이후 mermaid는 라벨을 SVG `<text>`로 그린다. 그 경로에는 HTML 해석기가 없어서, **살릴 수 없는 태그를 지우지 않고 글자로 그린다**(`markdownToLines`가 html 토큰을 한 단어로 밀어 넣는다). 그래서 넘기기 전에 소스를 한 번 고른다 — 순수 함수 `lib/mermaidText.ts`(`normalizeDiagramHtml`·`detectDiagramKind`, vitest), 호출 지점은 `renderMermaid` 하나뿐이라 미리보기·프레젠테이션·HTML 내보내기가 같은 규칙을 쓴다.

| 소스에 쓴 것 | 처리 | 왜 |
|---|---|---|
| `<br>`·`<BR>`·`<br/>`·`<br />`·`<br class="x">` | bare `<br>`로 통일 | mermaid 자체 정규화는 `/<br\s*\/?>/`(대소문자 구분·속성 없음) 뿐이라 나머지가 글자로 샜다. timeline은 자기 정규식으로 **bare만** 자른다 |
| `<b> <i> <u> <span> <code> <strong> <em> …` | 태그만 제거, 글자는 유지 | SVG 라벨 경로에 표현 수단이 없다. 태그가 도형 안에 찍히는 것만 막는다 |
| `&nbsp;` | NBSP 문자(U+00A0) | sequence·journey는 이걸 만나면 **파싱이 통째로 실패**한다(mermaid는 `#nbsp;`를 쓴다) |
| `<a href>`·화살표·`<<interface>>`·제네릭 | 건드리지 않음 | mermaid 문법이거나 사용자가 쓴 주소다 |

- **`data-src`는 원문 그대로 둔다.** 정규화는 mermaid로 넘길 때만 한다 — 문서 파일이 조용히 다시 쓰이지 않는다.
- **`<b>`→`**`(마크다운) 변환은 하지 않는다.** flowchart 라벨은 마크다운으로 파싱되지 않아(백틱 마크다운 문자열일 때만) `**`가 또 글자로 보인다 — 리터럴을 다른 리터럴로 바꾸는 셈이다.
- **상류 한계(mermaid.live도 같다).** pie·journey·gitGraph·xychart·quadrant·packet·treemap은 줄바꿈 자체를 못 한다 → 그 계열에서는 `<br>`을 **공백**으로 바꾼다(태그가 글자로 보이는 것만 막는다). classDiagram **멤버 줄**과 flowchart **frontmatter title**도 줄바꿈이 안 되고, sequence는 `<br>`은 되지만 서식 태그는 안 된다.
- 회귀 가드: 갤러리 19번 픽스처 + `npm run probe:mermaid`의 `[x]` 검사(렌더된 글자에 태그가 있으면 실패).

## 성능
- 파싱·하이라이트는 **Web Worker**에서. 입력 디바운스. 무거운 블록은 IntersectionObserver 지연.

참고: `src/app/lib/markdown.ts`, `src/app/workers/markdown.worker.ts`, [architecture](../architecture.md).
