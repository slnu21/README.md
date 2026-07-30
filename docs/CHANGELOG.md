# 변경 로그

이 프로젝트의 모든 주요 변경을 기록한다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/),
버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따른다.

## [Unreleased]

마크다운 작성 기능 확충 1/5 — 단축키 발견 가능성. 로컬 검증(`tsc`·`vite build`·릴리스 빌드 신규 경고 0) + 상류 키맵 대조 스크립트 통과.

### Added
- **단축키 도움말(F1)** — 어떤 단축키가 있는지 앱에서 알 방법이 없던 것을, `F1` 또는 명령 팔레트의 "단축키"로 여는 목록으로 만들었다. 서식·편집·줄/선택·찾기·앱 5개 그룹, ko/en. 놀랍게도 **이미 동작하지만 아무 데도 안 적혀 있던 키가 27개**였다(`Ctrl+/` HTML 주석 토글, `Enter` 인용문 이어쓰기, `Alt+↑/↓` 줄 이동, `Ctrl+D` 다음 같은 낱말 선택 등) — 전부 목록에 실었다.
- **명령 팔레트에 서식 명령 노출** — 팔레트에 파일·뷰·설정 명령만 있고 편집 서식 명령은 하나도 없던 것을 추가하고, 항목 우측에 단축키를 함께 표기했다. 편집기 우클릭 메뉴에도 같은 방식으로 단축키를 표기.

### Changed
- **편집 액션을 레지스트리 하나로 통일** — 키맵·명령 팔레트·우클릭 메뉴·도움말이 각각 하드코딩돼 있어 한 곳만 고쳐도 나머지가 낡는 구조였다. `features/editor/actions.ts`를 **단일 진실원**으로 두고 네 소비처가 여기서 파생하게 했다. 특히 도움말이 낡으면 "없는 키를 안내"해 없는 것보다 해로우므로, 상류 키맵(`@codemirror/{commands,search,lang-markdown}`)과 대조해 27개 항목이 실제로 바인딩돼 있는지 검증했다(수식어 순서는 CodeMirror `normalizeKeyName` 규칙으로 정규화해 비교 — `Mod-Shift-k` ≡ 상류 `Shift-Mod-k`).

## [0.6.7]

v0.6.6 실사용 후속 — mermaid 다이어그램 라벨이 도형을 넘거나 잘리던 문제 수정 + 다이어그램 표시 3건 개선. 로컬 검증(`tsc`·`vite build`) + 릴리스 빌드(신규 경고 0) + Chromium 프로브 실측 + 실사용 확인 통과.

### Fixed
- **다이어그램 글자가 도형을 벗어나거나 잘리던 문제** — 미리보기 iframe은 스크립트가 차단돼(`sandbox="allow-same-origin"`) mermaid를 안에서 돌릴 수 없어 **앱 문서에서 재고 미리보기 문서에서 보여주는** 구조인데, 두 문서에서 다르게 해석되는 상속 CSS만큼 라벨 상자가 어긋나던 것(v0.6.6 편집기 버그와 같은 "측정=실제" 붕괴 계열). 원인 4겹:
  (1) **`dominant-baseline`이 정화에서 제거됨** — DOMPurify svg 허용목록에 이 속성만 빠져 있어(`alignment-baseline`은 있으나 `<text>`엔 적용 안 됨) mermaid가 자체 정화에 예외를 두는데, 우리 2차 정화가 그걸 다시 지워 sequence·quadrant·xychart·ER·class/state 노트 텍스트가 수직 중앙정렬을 잃고 baseline으로 내려앉았다 → `sanitizeSvg` 허용목록에 추가(표현용 속성, 보안 표면 변화 없음).
  (2) **줄높이 비대칭** — mermaid가 SVG에 심는 `<style>`은 글꼴·크기까지만 고정하고 `line-height`는 고정하지 않아, 측정(앱 문서 = `normal`)과 표시(미리보기 = `1.75`)가 어긋나 `foreignObject` 라벨이 상자보다 높아져 잘렸다(같은 라벨 실측 19.1px ↔ 25.5px, 줄당 6.4px 초과) → 양쪽이 **한 상수(`DIAGRAM_CTX_CSS`)를 공유**하도록 하고, mermaid를 화면 밖 측정 스테이지에 렌더(`mermaid.render`의 3번째 인자)해 문맥을 일치시켰다. `text-rendering`(앱 `optimizeLegibility` ↔ 미리보기 `auto`) 등 나머지 상속 속성도 같은 상수로 고정.
  (3) **한글 폴백 글꼴 비결정성** — mermaid 기본 스택에 한글 글리프가 없어 한글이 전부 문서별 폴백으로 해결되던 것 → 다이어그램 전용 글꼴에 한글 face를 명시하고(`"Trebuchet MS","Malgun Gothic",…`) 렌더 문서에 `lang`을 부여했다.
  (4) 위 (1)~(3)이 겹쳐 특히 **한글·다행 라벨**에서 증상이 두드러졌다.

### Added
- **미리보기 확대에 다이어그램 연동** — 본문은 확대되는데 다이어그램만 절대 px에 고정돼 상대적으로 작아 보이던 것을, 확대 배율(`--reader-zoom`)을 렌더 문서에 넘겨 SVG가 비례 확대되게 했다. 프레젠테이션·내보내기도 같은 경로라 함께 적용된다.
- **다이어그램 너비 설정(맞춤 / 원본)** — 컬럼보다 넓은 차트가 축소만 되어 글자가 작아지던 것을, 설정 팝오버에서 고를 수 있게 했다(기본 **맞춤**). `원본`은 실제 크기로 그리고 블록 안에서 가로 스크롤한다. `display:flex`의 flex-shrink가 실제 제약이어서 `max-width:none`만으로는 안 되고 `flex:none` + 명시적 `width`(viewBox에서 읽은 `--diagram-w`)가 필요했다(Chromium 실측).
- **앱 테마 연동** — mermaid 기본 팔레트(흰 배경·노란 노트)가 dark/paper에서 문서와 튀던 것을, 앱 5토큰에서 파생한 `themeVariables`로 `base` 테마를 구성해 맞췄다.
- **회귀 픽스처 5종** — `docs/samples/mermaid-gallery.md`에 긴 한글 라벨·다행 라벨+노트·와이드 서브그래프·xychart(수직정렬)·고의 문법 오류 블록 추가.

## [0.6.6]

v0.6.5 실사용 후속 수정 — 편집기 커서/렌더 오작동 1건. 로컬 검증(`tsc`·`vite build`) + 릴리스 빌드(신규 경고 0) + dev 빌드 실사용 확인 통과.

### Fixed
- **줄바꿈된 줄을 스크롤하면 커서·렌더가 어긋나던 문제** — 화면 너비 때문에 여러 줄로 접힌 행을 지나 스크롤하면 어느 순간 커서가 사라지고 편집기가 부분만 그려지며, 클릭·위아래 이동·Home/End가 엉뚱한 줄로 가고 활성 줄과 왼쪽 줄번호 강조가 세로로 어긋나던 문제. 원인 2겹: (1) CodeMirror 6.43.4(뷰/높이 모델을 "tile tree"로 새로 짠 버전대)의 스크롤 시 렌더 트리 손상 → `@codemirror/view`를 **6.43.6**으로 패치 업데이트(상류 tile-tree corruption 수정 반영). (2) 분수 줄높이(13px×1.62=21.06px, 줌 시 소수 폰트 크기)가 줄바꿈 행(높이=행수×줄높이)에서 CodeMirror 높이 모델과 실제 렌더를 누적으로 어긋나게 함 → 에디터 폰트 크기·줄높이를 **정수 px로 고정**(`--editor-line-height`, `.cm-scroller`가 사용). 더불어 번들 폰트가 마운트 이후 로드될 때(`document.fonts` `loadingdone`)와 글꼴/줌 변경 시 폰트 메트릭을 강제 재측정하도록 보강(CM은 `document.fonts.ready`를 한 번만 구독해 lazy 폰트 swap 후 재측정하지 못하던 것 보완).

## [0.6.5]

v0.6.4 실사용 후속 개선 — 에디터↔미리보기 동기화 체감 2건. 로컬 검증(`tsc`·`vite build`) + 릴리스 빌드(신규 경고 0) + 실사용 확인 통과.

### Added
- **미리보기 갱신 빈도 설정** — 입력 한 글자마다 미리보기가 다시 그려져 정신없던 것을, 설정 팝오버에서 **빠름(200ms) / 보통(500ms) / 느긋(1000ms)** 중 고르도록 했다(기본 **보통**). 기존 하드코딩 200ms 디바운스를 `previewDelay` 설정으로 전환하고 store에 영속(`partialize`).

### Fixed
- **미리보기 재렌더 시 스크롤 위치 초기화** — 미리보기가 갱신될 때마다 화면이 문서 맨 위로 튀던 문제. `srcdoc` 재대입이 iframe을 통째로 리로드해 `scrollTop`이 0이 되던 것을, 리로드 직전 상단 소스 줄을 저장했다가 `onIframeLoad`에서 복원(`restoreLineRef`). 기존 `data-line` 보간 로직을 `scrollDocToLine` 헬퍼로 추출해 재사용하며, 테마·글꼴·줌 변경 시에도 위치가 유지된다. 복원은 scroll 리스너 부착 전에 처리해 역동기화 에코를 피한다.

## [0.6.4]

v0.6.3 실사용 후속 개선 — 워크스페이스 사이드바에서 깊은 계층·긴 이름 파일의 전체 이름 확인. 로컬 검증(`tsc`·`vite build`) + 릴리스 빌드(신규 경고 0) + 실사용 확인 통과.

### Added
- **워크스페이스 사이드바 가로 스크롤** — 계층이 깊거나 이름이 긴 항목이 고정 폭(248px) 사이드바에서 잘리던 것을, 이름을 자연 너비로 펼치고 **가로 스크롤바**로 확인하도록 개선(VS Code 파일 탐색기 방식). 가로 스크롤 시 상단 툴바는 좌측에 고정. `.node .name`의 줄임표를 제거하고 `.tree`를 `width:max-content; min-width:100%`로, 스크롤 컨테이너는 기존 `.sidebar-body`(양축 `overflow:auto`)를 사용.
- **잘린 이름 툴팁** — 이름이 사이드바 밖으로 잘린 항목에 마우스를 잠시 올리면 **전체 이름을 네이티브 툴팁**으로 표시(`lib/hoverName.ts`의 `showFullNameOnClip` — 이름 rect가 `.sidebar-body` 가시 폭을 벗어났을 때만 `title` 세팅). 워크스페이스 트리·즐겨찾기·최근 탭 공통.

## [0.6.3]

v0.6.2 실사용 후속 수정. 로컬 검증(`tsc`·`vite build`·`cargo` dev 빌드 경고 0) + 실사용 확인 통과.

### Fixed
- **파일을 열자마자 미저장으로 표시** — `.md`를 열기만 해도 탭에 미저장 점과 "Unsaved"가 뜨던 문제. 근본 원인 2가지(둘 다 프로그램적 문서 로드를 사용자 편집으로 오인): (1) `read_file`이 반환한 원본 줄바꿈(Windows=CRLF)과 CodeMirror 문서의 내부 표현(LF)이 달라, 마운트 시 콘텐츠 동기화 effect가 문서 전체 교체를 dispatch → `onChange` → dirty. (2) `updateListener`가 `docChanged`면 무조건 `onChange`를 불러 프로그램적 교체와 사용자 편집을 구분하지 못함. **`contentSync` 애노테이션**을 정의해 프로그램적 교체에 표식을 붙이고 `updateListener`가 이를 건너뛰게 하고(사용자 입력은 표식이 없어 그대로 dirty — 편집 유실 없음), `readFile`에서 **CRLF/CR→LF 정규화**로 기준값을 에디터의 정준 표현과 맞춰 불필요한 교체 자체를 제거. 외부 변경 리로드 직후 같은 탭이 다시 dirty가 되던 문제도 함께 해소.

## [0.6.2]

v0.6.1 실사용 후속 보완 — 워크스페이스/탭 드래그 피드백, 탭 우클릭 메뉴, 스크롤 동기화·파일 연결 버그 수정. 로컬 검증(`tsc`·`vite build`·`cargo check` + 릴리스 빌드 실행) 통과.

### Added
- **드래그 고스트** — 워크스페이스 트리와 열린문서 탭을 드래그할 때 커서를 따라오는 **반투명 항목 칩**(아이콘+이름)으로 무엇을 옮기는지 표시. 기존 원본 흐리게·드롭 위치선은 유지.
- **탭 우클릭 컨텍스트 메뉴** — 열린문서 탭에서 우클릭: 워크스페이스에 추가 · 탭 닫기 · 다른 탭 모두 닫기 · 모든 탭 닫기 · 파일 위치 열기(탐색기) · 경로 복사. 일괄 닫기는 미저장 탭이 있으면 저장/버림 확인 다이얼로그를 거침.
- **참조 추가 메뉴** — 가져온 폴더 안 개별 파일 우클릭에 "워크스페이스에 참조 추가"(바로가기 생성) 추가.
- **가져온 폴더 그룹 강조** — 가져온 폴더의 **폴더 행에 마우스를 올리면** 묶음 전체(폴더+하위+좌측 레일)가 함께 강조(함께 이동하는 단위임을 안내).

### Changed
- **워크스페이스 드래그 의미 통일 = 항상 '이동'** — 이제 드래그 대상은 그래프 노드(가상 폴더·파일참조·가져온 폴더 루트)뿐이고 결과는 언제나 이동/재정렬. 가져온 폴더의 하위 개별 항목(disk_file/disk_folder)은 '폴더째 이동하는 단위'라 **드래그 불가**(잡으면 금지 칩으로 안내). v0.6.1의 "개별 파일→가상폴더 드래그 = 참조 편입"은 의미가 모호해 **제거**하고, 참조 추가는 우클릭 메뉴로 명시화.

### Fixed
- **에디터↔미리보기 스크롤 동기화 진동** — 에디터에 포커스를 두고 스크롤하면 미리보기가 "문서 맨 위↔현재 위치"로 반복 점프하던 문제. 상단 가시줄 계산(`topVisibleLine`)이 거터/상단 패딩에서 좌표 매핑에 실패하면 `0`(문서 처음)을 반환하던 것을 **콘텐츠 영역 좌표 + 비정밀 모드**로 교정.
- **탐색기에서 .md 열기 시 활성화 누락** — 콜드 스타트에서 세션 복원(`hydrate`)이 파일 열기보다 늦게 끝나며 활성 탭을 이전 세션 문서로 덮어써, 연 파일이 조용히 탭에만 추가되던 문제. **파일 열기를 세션 복원 이후로 순서화**해 항상 활성이 되도록 수정.

## [0.6.1]

릴리스 v0.6.0 이후 실사용 피드백 3건 수정. 로컬 검증(`tsc`·`vite build` + 릴리스 빌드 실행, WebView2 DevTools로 렌더 결과 확인) 통과.

### Fixed
- **mermaid 다이어그램 렌더** — `flowchart`·`erDiagram`·`classDiagram`·`stateDiagram`·`quadrantChart` 등이 릴리스 빌드에서 안 나오던 문제 해결. 근본 원인 2가지: (1) 소스의 `-->`·`->>`·`<|--`(`<`/`>` 포함) 때문에 DOMPurify(mXSS 방지)가 placeholder의 `data-src`를 통째로 제거 → 소스를 **base64로 실어** 회피. (2) `foreignObject` 안 HTML 라벨이 DOMPurify 네임스페이스 검사에 걸려 글자가 비던 문제 → **`foreignobject`를 HTML 통합지점(`HTML_INTEGRATION_POINTS`)으로 등록**해 라벨 보존. 렌더 실패 시 실제 오류 메시지를 표면화(빈 블록 대신 원인 표시). 회귀 픽스처 `docs/samples/mermaid-gallery.md`(12종) 추가.
- **파일 연결 실행 시 창 전면화** — `.md`/`.markdown` 더블클릭 시 앱이 안 뜬 것처럼 보이던 문제. 웜 스타트(single-instance)에서 `set_focus()`만으로는 Windows에서 최소화/뒤 창이 안 올라오므로 **`unminimize()`+`show()`+`set_focus()`** 로 확실히 전면화(파일 유무 무관). 콜드 스타트도 파일 인자 실행 시 창을 표시·포커스.

### Added
- **워크스페이스 파일 → 폴더 드래그 이동** — 가져온 폴더 안 디스크 파일을 가상 폴더로 드래그하면 **참조(file_ref)로 편입**(디스크 미변경, 로컬퍼스트). 가상 폴더 "into" 히트존 확대(20~80%)로 잘 잡히게 개선. **가져온 폴더(imported)는 하위가 통째로 묶인 단위**임을 좌측 레일 + "가져옴/linked" 배지로 시각화(ko/en).

## [0.6.0]

키보드 내비게이션 · 리더 UX · 전역 찾기바꾸기 · 작성 도구 중심의 대규모 업데이트. 로컬 검증(`tsc`·`vite build`) 통과.

### Added
- **(T1) 에디터 작성 도구** — 서식 단축키(Ctrl+B/I/E/K 토글: 굵게·기울임·인라인 코드·링크), 자동 목록 이어쓰기(-/번호/체크박스), 괄호·백틱 자동 닫기, 스마트 붙여넣기(선택 위 URL→링크), 상태바 커서 줄:열·선택 글자수·읽기 시간.
- **(T5) 이식성** — HTML 클립보드 복사(text/html+text/plain), 워크스페이스 JSON 내보내기/가져오기(노드 그래프).
- **(T4) 리더 UX** — 이미지 라이트박스, 리딩(집중) 모드, 프레젠테이션 모드(전체화면 슬라이드 · `---` 분할), 양방향 스크롤 동기화, 리딩 폭(좁게/보통/넓게).
- **(T2) 명령 팔레트·퀵오픈** — 명령 팔레트(Ctrl+Shift+P), 파일 퍼지 퀵오픈(Ctrl+P), 경량 퍼지 매처. 워크스페이스 파일 타입 구분(마크다운 전용 아이콘·비문서 흐림·열기 비활성).
- **(T3) 전역 찾기·바꾸기** — 워크스페이스 문서 대상 리터럴/정규식 검색, 파일별 미리보기·선택(기본=현재 파일), 파괴적 확인 다이얼로그, 미저장 편집 보호.
- **(T6) 에디터 커스텀 우클릭 메뉴** — 잘라내기/복사/붙여넣기 + 서식(굵게/기울임/코드/링크) + 모두 선택.
- **데이터 안전** — 창 닫기 저장 확인, 탭 닫기 확인, 세션 복원(열린 탭 재오픈), 자동저장(옵트인).

### Changed / Fixed
- 편집 활성 줄에서 선택 영역 가시성 수정(활성줄 배경 알파 합성 + 선택 대비 강화).
- mermaid flowchart 라벨 렌더 수정(`htmlLabels:false` + sanitizer 확장).
- 상대경로 이미지 표시 — 미리보기·프레젠테이션을 data URI 인라인(Rust `read_file_base64`)으로 통일(asset scope/CSP/정규화 우회).
- 설정 아이콘을 실제 톱니바퀴로 교체(태양 아이콘과 혼동 제거).
- 워크스페이스 상호작용 버그 — 폴더 중복 등록(StrictMode 리스너 누수 + Rust idempotent), 그래프 노드 클릭 불가(pointer capture), 디스크 키 유일화, dev single-instance 비활성화.

### Dependencies
- 추가(npm): `@codemirror/autocomplete` — 기존 transitive 포함이라 THIRD-PARTY-NOTICES 변화 없음(확인). Rust 의존성 변화 없음.

## [0.5.0]

> v0.2–v0.5 통합 릴리스. 로컬 검증(`tsc`·`vite build`·`cargo check`) 통과.

### Added
- **(v0.2) 리치 미리보기** — highlight.js 코드 하이라이트, KaTeX 수식(MathML 출력), markdown-it 플러그인 세트(각주·체크박스·콜아웃·sub/sup/mark/ins/abbr/deflist·멀티라인 표·front-matter·anchor), 아웃라인/TOC, mermaid(메인스레드 SVG 주입), 문서 내 찾기/바꾸기(@codemirror/search).
- **(v0.2) 워크스페이스 & 전역 검색** — SQLite(rusqlite bundled)+FTS5, 즐겨찾기·최근·설정 영속화, 폴더 가져오기(디스크 파생 트리). 스키마: [design/data-model.md](design/data-model.md).
- **(v0.3) 편집 UX 8종** — 파일 드래그앤드롭 열기, 편집/미리보기 분할 폭 조정, 글꼴 변경(시스템 프리셋 + 번들 OFL: Lora·JetBrains Mono·나눔명조·Pretendard), 워크스페이스 펼침 상태 기억, 에디터/미리보기 줌(Ctrl +/−/0·Ctrl+휠), 편집 위치 미리보기 스크롤 동기화, 설정 팝오버.
- **(v0.4) 가상 폴더 워크스페이스** — UUID 노드 그래프 렌더, 폴더 생성·파일/폴더 추가·이름변경·제거, 포인터 기반 드래그 이동/재정렬(`ws_reorder`), 즐겨찾기 최상단 고정, [워크스페이스\|최근] 사이드바 탭, 아웃라인 우측 오버레이(호버·핀·투명도), UI 폰트 Pretendard, 탭 오버플로우 스크롤·드래그 재정렬.
- **(v0.5) 내보내기** — 자기완결 HTML(로컬 이미지·선택 폰트 data URI 임베드), PDF(OS 인쇄 대화상자 경유). Rust `read_file_base64`, 공유 렌더 `lib/renderDoc.ts`. 상세: [design/features/export.md](design/features/export.md).
- **(v0.5) `.md`/`.markdown` 파일 연결** — `bundle.fileAssociations`(NSIS/MSI) + MSIX 매니페스트 `windows.fileTypeAssociation`; `tauri-plugin-single-instance`로 실행 인자→기존 창 열기(콜드=`take_pending_open`, 웜=`open-file` 이벤트).

### Changed
- **(v0.3)** paper 테마 톤 조정(연한 크림 배경 + 진한 연필 그래파이트 글자색), 미리보기 카드형 시각 구분(페인 폭 추종).
- **(v0.5)** 기본 우클릭(WebView2 브라우저) 메뉴 억제 — 에디터 텍스트 메뉴·워크스페이스 커스텀 메뉴는 유지.
- 하드닝 CSP 적용(원격 `http(s)` 차단, `script-src 'self'`, `img-src`에 `data:`/`asset:`).

### Dependencies
- 추가(npm): `@fontsource/{lora,jetbrains-mono,nanum-myeongjo,pretendard}` (OFL-1.1).
- 추가(cargo): `base64`, `tauri-plugin-single-instance` (permissive) → THIRD-PARTY-NOTICES 재생성 대상.

## [0.1.0]
### Added
- **MVP** — 파일 열기·편집·미리보기·저장, 외부 변경 감시, 최근 문서, 3테마(light/dark/paper), i18n(ko/en), 프레임리스 창, 공식 마크다운 로고.
- **배포** — MSIX(Microsoft Store)/NSIS/portable zip, GitHub(github.com/slnu21/README.md).
- **기반** — 프로젝트 구조(`docs`/`src`/`release`), Tauri v2 + React + TypeScript + Vite 스캐폴딩(프론트 소스 `app/`), 프론트/Rust 모듈 스켈레톤, 파일 I/O는 Rust 커맨드(`fs_ops`), `tauri-plugin-dialog` 연동, 설계·배포·법무 문서 초안.

[0.6.2]: https://github.com/slnu21/README.md/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/slnu21/README.md/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/slnu21/README.md/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/slnu21/README.md/compare/v0.1.0...v0.5.0
[0.1.0]: https://github.com/slnu21/README.md/releases/tag/v0.1.0
