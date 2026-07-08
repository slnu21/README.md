# 변경 로그

이 프로젝트의 모든 주요 변경을 기록한다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/),
버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따른다.

## [Unreleased]

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

[0.6.0]: https://github.com/slnu21/README.md/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/slnu21/README.md/compare/v0.1.0...v0.5.0
[0.1.0]: https://github.com/slnu21/README.md/releases/tag/v0.1.0
