# 변경 로그

이 프로젝트의 모든 주요 변경을 기록한다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/),
버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따른다.

## [Unreleased] — 다음 릴리스 대상 (v0.2–v0.5 통합, 목표 버전 `0.5.0`)

> 로컬 검증(`tsc`·`vite build`·`cargo check`) 통과. 패키지 버전 문자열은 아직 `0.2.0` — 배포 준비 단계에서 범프.

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

[Unreleased]: https://github.com/slnu21/README.md/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/slnu21/README.md/releases/tag/v0.1.0
