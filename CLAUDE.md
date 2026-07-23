# CLAUDE.md

이 파일은 Claude Code(및 협업자)가 이 저장소에서 작업할 때 빠르게 맥락을 잡기 위한 안내다.

## 프로젝트
**README.md** (저장소 디렉터리: `md-reader`) — 경량 마크다운 **리더 & 에디터**. Windows 데스크톱, **Microsoft Store** 배포, **100% 오프라인**. 향후 유료화(상업화) 가능성을 열어둠(배포 앱은 상업적 사용 허용). 제품 표시명=README.md · 기술 식별자=`readme-md`/`com.readme.app` · 내부 exe=`md-reader.exe`.

## 기술 스택
Tauri v2(Rust 셸) · React + TypeScript + Vite · CodeMirror 6(에디터) · markdown-it(렌더) · SQLite+FTS5(워크스페이스/검색) · Zustand · i18next(ko/en).
자세히: [docs/design/architecture.md](docs/design/architecture.md), 결정 근거: [docs/design/decisions/0001-tech-stack-and-packaging.md](docs/design/decisions/0001-tech-stack-and-packaging.md).

## 폴더 구조
- `docs/` — 설계·배포·법무 문서, html 시안, 변경로그 (인덱스: `docs/README.md`)
- `src/` — 앱 소스. **`src/app/`** = 웹 프론트엔드(UI), **`src/src-tauri/`** = Rust 셸
- `release/` — 버전별 배포 산출물
- 루트: `README.md`, `THIRD-PARTY-NOTICES.md`(생성됨: npm+cargo deps + 번들 폰트 OFL 전문), `.gitignore`

> ⚠️ 프론트엔드 소스는 Tauri 기본 `src/`가 아니라 **`app/`** 다(최상위 `src` 폴더와의 `src/src` 혼동 방지). `src/index.html`·`src/tsconfig.json`이 `app/`를 참조.

## 명령
```bash
cd src
npm install            # 최초 1회 (node_modules는 커밋 안 됨)
npx tsc --noEmit       # 프론트 타입체크 (Rust 없이 가능)
npm run tauri dev      # 데스크톱 실행 (Rust 필요)
npm run tauri build    # 빌드 → src/src-tauri/target/release/bundle/
```

## 규약 / 결정사항
- **파일 I/O**: JS의 fs 플러그인이 아니라 **Rust 커맨드(`src-tauri/src/commands/fs_ops.rs`, `std::fs`)** 로 임의 경로 풀 접근. 프론트는 `src/app/lib/tauri.ts` 래퍼 사용.
- **미리보기 보안**: markdown-it 렌더 결과는 **반드시 DOMPurify 정화 후 샌드박스 iframe** 주입.
- **오프라인**: 원격/CDN 금지, 모든 자산 번들. **하드닝 CSP 적용됨**(`tauri.conf.json` `app.security.csp` — 원격 `http(s)` 차단, `img-src`에 `data:`/`asset:`, 인라인 스타일 허용). `script-src 'self'`(인라인 스크립트 불가).
- **라이선스**: permissive(MIT/Apache/BSD/ISC 등)만 허용. GPL/AGPL/LGPL/SSPL 금지.
- **Store 패키징**: **MSIX → Store**(Microsoft 재서명 → 코드서명 인증서 불필요)가 기본. Tauri는 MSI/NSIS만 내므로 **MSIX 래핑 1단계** 필요. 매니페스트에 `runFullTrust`. 자세히: [docs/deployment/microsoft-store.md](docs/deployment/microsoft-store.md).

## 현재 상태 (2026-07-23 기준)
- **v0.6.5 릴리스** — v0.6.4 실사용 후속 개선 1건: **미리보기 갱신 빈도 설정화 + 재렌더 시 스크롤 위치 보존**(커밋 `ace9ddd`, 머지 `bd9ba1a`). 한 글자마다 미리보기가 재렌더돼 산만하던 것 — 하드코딩 200ms 디바운스를 **`previewDelay` 설정**으로 전환하고 설정 팝오버에 빠름(200)/보통(500)/느긋(1000ms) 세그먼트 추가(기본 보통, store 영속). 함께, `iframe.srcdoc` 재대입이 문서를 통째로 리로드해 스크롤이 항상 맨 위로 튀던 것을 재대입 직전 상단 소스 줄을 저장했다가 `onIframeLoad`에서 복원(**`restoreLineRef`**, 기존 data-line 보간을 **`scrollDocToLine`** 헬퍼로 추출해 재사용) — 테마·글꼴·줌 변경 시에도 위치 유지, 복원은 scroll 리스너 부착 전 처리해 역동기화 에코 회피. 부수로 **패키징 스크립트 결함 수정**(커밋 `a2455a7`, 머지 `a71f0ad`): cargo `target-dir`이 `D:`로 리다이렉트됐는데 스크립트가 고정 경로를 봐 잔여 v0.6.4 exe를 새 버전으로 포장할 뻔한 것 — `packaging/_paths.ps1`에 경로 해석(`CARGO_TARGET_DIR`→`.cargo/config.toml`→기본)과 exe FileVersion 불일치 시 throw하는 가드 추가. 로컬 검증(`tsc`·`vite build`)+릴리스 빌드 통과(신규 경고 0), 릴리스 exe 기동 확인. 산출물(NSIS/MSIX/zip) 빌드·패키징, 실신원 MSIX(`SlnU.README.md`·`0.6.5.0`, 매니페스트 실물 확인) **GitHub 릴리스·`v0.6.5` 태그 푸시 완료**(릴리스 커밋 `234a205`). 실신원 MSIX(`release/v0.6.5/README_0.6.5_x64.msix`) **Microsoft Store 제출 완료(2026-07-23) — 인증·게시 대기**.
- **v0.6.4 릴리스** — v0.6.3 실사용 후속 개선 1건: **워크스페이스 사이드바 깊은 항목 이름 표시**(커밋 `b2105b5`, 머지 `4431cf6`). 계층이 깊거나 이름이 긴 파일이 고정 폭(248px) 사이드바에서 줄임표로 잘려 전체 이름을 볼 수 없던 것 — `App.css`에서 `.node .name` 줄임표 제거 + `.tree` `width:max-content; min-width:100%`로 **가로 스크롤**(VS Code 파일 탐색기 방식, 가로 스크롤 시 툴바 `sticky left:0` 고정), `lib/hoverName.ts`의 **`showFullNameOnClip`** 로 이름이 `.sidebar-body` 가시 폭을 벗어나 **실제 잘린 항목에만 네이티브 title 툴팁**(워크스페이스 트리·즐겨찾기·최근 탭 공통). 로컬 검증(`tsc`·`vite build`)+릴리스 빌드 통과(신규 경고 0, 청크 크기 경고는 기존 mermaid/katex 번들), 릴리스 exe 실사용 확인. 산출물(NSIS/MSIX/zip) 빌드·패키징, 실신원 MSIX(`SlnU.README.md`·`0.6.4.0`, 매니페스트 실물 확인) **GitHub 릴리스·`v0.6.4` 태그 푸시 완료**(릴리스 커밋 `e956c0d`). 실신원 MSIX(`release/v0.6.4/README_0.6.4_x64.msix`) **Microsoft Store 제출(2026-07-21) → 게시 완료**(2026-07-23 확인: `Get-AppxPackage SlnU.README.md` → `0.6.4.0` · `SignatureKind=Store`).
- **v0.6.3 릴리스** — v0.6.2 실사용 후속 수정 1건: **파일 열자마자 dirty 표시 수정**(커밋 `6937275`, 머지 `3f9bd57`). 프로그램적 문서 로드(파일 열기·외부 변경 리로드)가 사용자 편집으로 오인돼 dirty가 켜지던 결함 — `features/editor`에 **`contentSync` 애노테이션** 도입 → `updateListener`가 표식 붙은 트랜잭션은 `onChange`를 건너뜀 + `lib/tauri.ts` `readFile`에서 **CRLF/CR→LF 정규화**로 마운트 시 불필요한 문서 교체 제거. 로컬 검증(`tsc`·`vite build`)+릴리스 빌드 통과(신규 경고 0), dev 빌드 실사용 확인. 산출물(NSIS/MSIX/zip) 빌드·패키징, 실신원 MSIX(`SlnU.README.md`·`0.6.3.0`, 매니페스트 실물 확인) **GitHub 릴리스·`v0.6.3` 태그 푸시 완료**(릴리스 커밋 `a549e1d`). 실신원 MSIX(`release/v0.6.3/README_0.6.3_x64.msix`) **Microsoft Store 제출 완료(2026-07-17) — 인증·게시 대기**.
- **v0.6.2 릴리스** — v0.6.1 실사용 후속 보완: 워크스페이스·탭 드래그 시 커서 추종 항목 칩(고스트) + **드래그=항상 '이동'으로 통일**(가져온 폴더의 개별 항목은 이동 불가·드래그 시 금지 칩, 참조 추가는 우클릭 "워크스페이스에 참조 추가"로 명시 — v0.6.1의 개별파일→가상폴더 참조 DnD는 모호해 제거) · 가져온 폴더 **폴더 행 hover 시 그룹 전체 강조** · **열린문서 탭 우클릭 메뉴**(워크스페이스 추가·현재/다른/모든 탭 닫기·파일 위치 열기·경로 복사) · **스크롤 동기화 진동 수정**(`topVisibleLine`이 거터/상단 패딩에서 0 반환하던 것 → 콘텐츠 좌표+비정밀 모드) · **탐색기 .md 열기 활성화 누락 수정**(콜드스타트에서 세션복원 hydrate가 파일열기를 덮어쓰던 경합 → 파일 열기를 hydrate 이후로 순서화). 로컬 검증(`tsc`·`vite build`·`cargo check`)+릴리스 빌드 통과, 실사용 확인. 산출물(NSIS/MSIX/zip) 빌드·패키징, 실신원 MSIX(`SlnU.README.md`) **GitHub 릴리스·`v0.6.2` 태그 푸시 완료**(릴리스 커밋 `047ea45`). 실신원 MSIX(`SlnU.README.md`) **Microsoft Store 게시 완료(2026-07-10)**.
- **v0.6.1 릴리스 완료** — v0.6.0 이후 실사용 3건 수정: mermaid 렌더(er/flowchart 등이 소스 `-->` 때문에 DOMPurify가 `data-src`를 삭제 → base64 전달로 회피, foreignObject 라벨은 `sanitizeSvg`의 `HTML_INTEGRATION_POINTS:{foreignobject:true}`로 보존, 렌더 오류 표면화 + 12종 회귀 픽스처 `docs/samples/mermaid-gallery.md`) · 파일연결 웜스타트 창 전면화(`unminimize+show+set_focus`) · 워크스페이스 디스크파일→가상폴더 참조 DnD + 가져온폴더 그룹 시각화. 릴리스 빌드+WebView2 DevTools(원격 디버깅)로 실측 검증. 산출물 빌드·패키징, 실신원 MSIX **Microsoft Store 게시 완료**. GitHub `main` 푸시 + `v0.6.1` 태그, 커밋 `171703c`.
- **v0.6.0 릴리스 완료** — 버전 `0.6.0` 범프, 산출물(NSIS/MSIX/zip) 빌드·패키징, 실신원 MSIX(`SlnU.README.md`) **Microsoft Store 게시 완료**. GitHub `main` 푸시 + `v0.6.0` 태그 완료. 커밋 `27fe7b4`.
- **v0.6 구현 완료**(로컬 검증 `tsc`·`vite build` 통과): 명령 팔레트·파일 퀵오픈(T2) · 리더 UX(라이트박스·리딩/프레젠테이션 모드·양방향 스크롤·리딩 폭 · T4) · 전역 찾기·바꾸기(T3) · 에디터 작성 도구(서식 단축키·자동 목록 · T1) · 에디터 우클릭 메뉴(T6) · HTML 클립보드/워크스페이스 JSON I/O(T5) · 데이터 안전(닫기 가드·세션 복원·자동저장) · 파일 타입 구분 · 상대경로 이미지(data URI) · 선택 강조·머메이드 버그 수정. 남은 로드맵: T7 상업화 게이팅(시기상조 · 보류).
- **v0.1 릴리스 완료** — MVP(열기·편집·미리보기·저장·감시·최근·3테마·i18n·프레임리스·공식 마크다운 로고) + MSIX/NSIS/zip + GitHub(github.com/slnu21/README.md).
- **v0.2–v0.5 릴리스 완료**(패키지 버전 `0.5.0`):
  - **v0.2** 리치 미리보기(highlight.js·KaTeX(MathML)·markdown-it 플러그인 세트·아웃라인/TOC·mermaid·문서 내 찾기/바꾸기) + 워크스페이스/검색(SQLite rusqlite bundled·전역 FTS5·즐겨찾기·최근·설정 영속). 스키마: [docs/design/data-model.md](docs/design/data-model.md).
  - **v0.3** 편집 UX 8종(드롭 열기·분할 폭 조정·글꼴 변경(시스템+번들 OFL)·펼침 상태 기억·에디터/미리보기 줌·paper 테마 톤·창 시각 구분 카드·편집 위치 스크롤 동기화).
  - **v0.4** 워크스페이스 재구성(가상 폴더 UUID 그래프 렌더·생성/이동/재정렬 포인터 DnD·즐겨찾기 최상단 고정·[워크스페이스\|최근] 사이드바 탭) + 아웃라인 우측 오버레이 + UI 폰트 Pretendard + 탭 오버플로우/재정렬.
  - **v0.5** 내보내기(자기완결 HTML: 이미지·선택 폰트 data URI 임베드 / PDF: OS 인쇄 대화상자) + `.md`/`.markdown` **파일 연결**(선언 + single-instance 실행인자 처리) + 기본 우클릭(브라우저) 메뉴 억제.
- **Rust 설치됨** → `cargo check`/`tauri dev/build` 동작. 미리보기 iframe은 `sandbox="allow-same-origin"`(allow-scripts는 절대 미포함). CSP 하드닝 적용됨.

## 다음 단계
- **후속(로드맵)**: T7 상업화 게이팅(export·advancedThemes Pro — Store 트래픽·Pro 기능 확보 후), 내보내기 고도화(WebView2 `PrintToPdfAsync` 무대화상자 PDF — `commands/export.rs`), 설정 localStorage↔SQLite 이중화(저가치·보류).

전체 로드맵은 [docs/README.md](docs/README.md) 참고.
