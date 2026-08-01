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
npm test               # 단위 테스트(vitest, node 환경 — DOM 없음)
npm run probe:mermaid  # mermaid 렌더 실측 검사(Edge 헤드리스). `-- --shot out.png` 로 갤러리 캡처
npm run tauri dev      # 데스크톱 실행 (Rust 필요)
npm run tauri build    # 빌드 → src/src-tauri/target/release/bundle/
```
> 미리보기 렌더를 건드렸으면 `npm run probe:mermaid` 까지 통과해야 한다 — 측정(앱 문서)↔표시(미리보기
> 문서) 문맥이 어긋나면 라벨이 도형을 넘거나 잘리는데, 눈으로는 잘 안 보인다(v0.6.7·v0.6.8 연속 유출).

## 규약 / 결정사항
- **파일 I/O**: JS의 fs 플러그인이 아니라 **Rust 커맨드(`src-tauri/src/commands/fs_ops.rs`, `std::fs`)** 로 임의 경로 풀 접근. 프론트는 `src/app/lib/tauri.ts` 래퍼 사용.
- **미리보기 보안**: markdown-it 렌더 결과는 **반드시 DOMPurify 정화 후 샌드박스 iframe** 주입.
- **오프라인**: 원격/CDN 금지, 모든 자산 번들. **하드닝 CSP 적용됨**(`tauri.conf.json` `app.security.csp` — 원격 `http(s)` 차단, `img-src`에 `data:`/`asset:`, 인라인 스타일 허용). `script-src 'self'`(인라인 스크립트 불가).
- **라이선스**: permissive(MIT/Apache/BSD/ISC 등)만 허용. GPL/AGPL/LGPL/SSPL 금지.
- **Store 패키징**: **MSIX → Store**(Microsoft 재서명 → 코드서명 인증서 불필요)가 기본. Tauri는 MSI/NSIS만 내므로 **MSIX 래핑 1단계** 필요. 매니페스트에 `runFullTrust`. 자세히: [docs/deployment/microsoft-store.md](docs/deployment/microsoft-store.md).
- **소개 영상**: `video/`(Remotion, **gitignore 대상 = 로컬 전용** — Atlas·Clowder 영상과 같은 방침). 스토리보드·카피·촬영 재현 절차는 커밋되는 [docs/video/copy.md](docs/video/copy.md)에 있다. 촬영 전 `video/capture/userdata.ps1`로 실사용 DB·WebView2 프로필을 반드시 비켜 놓는다(전역 검색이 머신 전체 인덱스를 조회한다).

## 현재 상태 (2026-08-01 기준)
- **mermaid 라벨 가로 잘림 수정 + 헤드리스 프로브 커밋** — flowchart 노드 라벨·ER 셀 글자가 글자 중간에서 가로로 잘리던 것(v0.6.8). 원인 2겹: **(1) 노드 라벨이 `<foreignObject>` HTML로 나갔다** — mermaid 11의 `labelHelper`는 `evaluate(getConfig()?.htmlLabels)`로 **최상위 키만** 읽는데(`chunk-ZGVPDNZ5.mjs:43`) 기본값이 없어 `evaluate(undefined)=true`가 됐다. 앱은 `flowchart:{htmlLabels:false}`만 두고 있었다 → 상자 폭이 앱 문서 측정값으로 얼어붙은 뒤 미리보기 문서에서 재배치돼 `overflow:hidden`에 잘림. 간선 라벨(`getEffectiveHtmlLabels` 경로)과 sequence가 멀쩡했던 것이 단서. **(2) 앱 CSS가 측정 문맥을 오염**시켰다 — mermaid가 노드 그룹에 `class="node"`를 붙이는데 워크스페이스 트리 행도 `.node`라 `App.css:684 {font-size:13px}`가 걸려 **13px로 재고 16px로 그렸다**(모든 라벨이 정확히 123% = 16/13, 프로브 실측). 수정: 최상위 `htmlLabels:false`(+`flowchart` 키 유지 — swimlane·triangle이 직접 읽고 `getEffectiveHtmlLabels`의 `?? true` 폴백 때문) · `#mermaid-measure-stage .node{revert}` · `DIAGRAM_CTX_CSS`에 `font-family`·`font-size` 추가(상수는 `renderDoc.ts`로 통합) · `measureStage()`가 `lang`을 매 호출 갱신. **재발 방지로 헤드리스 프로브를 저장소에 남겼다**(`npm run probe:mermaid` — Vite Node API + Edge, 새 의존성 0, 갤러리 파일을 그대로 읽어 불변식 8종을 12개 설정에서 검사). **수정 전 FAIL → 후 PASS**를 둘 다 확인(foreignObject 88→6=journey만, 라벨 516개 전부 도형 안). vitest 243→**282개**, 갤러리에 17번 "가로 라벨 폭" 픽스처 추가(오류 블록은 18번). 받아들인 비용: 노드 라벨 안 아이콘·이미지·KaTeX(mermaid가 `htmlLabels:false`에서 미지원, 저장소·데모에 미사용).
- **소개 영상 4종 완성** — 36초 · KO/EN × 16:9/9:16 · h264 CRF18 + AAC 48kHz(`video/out/`, 각 17.4/17.2/5.9/5.7MB). 방향: **에이전트가 쏟아내는 md 문서를 원하는 워크스페이스로 재구성하고 읽는 도구** + 수식·다이어그램·가벼움. 태그라인 "에이전트가 쓴 문서를, 사람이 읽는 자리." / 핵심 비트 결정타 "파일은 그대로, 배치는 내 마음대로."(가상 폴더가 `node` 테이블만 만진다는 사실 그대로). 팔레트는 앱의 **Paper 테마**(크림·세피아)를 그대로 써서 앞선 두 영상(Atlas 차가운 블루·Clowder 어두운 앰버)과 구분. 스크린샷 17컷은 v0.6.8 포터블 실화면(1920×1080), 데모 워크스페이스는 `D:\Workspace`(6 저장소 · md 62개 · mermaid 3 · KaTeX 5 · 이미지 2). 촬영 전 **실사용 DB·WebView2 프로필을 비켜 놓았다가 원복**(전역 검색이 `pathPrefix` 없이 머신 전체 인덱스를 조회 — `AppShell.tsx:633` → `search.rs:171`). 프로젝트는 `video/`(gitignore), 재현 절차·좌표·함정은 [docs/video/copy.md](docs/video/copy.md).
  - **촬영 중 발견한 제품 버그 → 해결**: v0.6.8의 mermaid `flowchart`·ER 라벨 잘림. 확대율·다이어그램 너비·읽기 글꼴과 무관해 원인을 좁히기 어려웠고, `sequenceDiagram`만 멀쩡하다는 비대칭이 결정적 단서였다. 영상은 시퀀스 다이어그램으로 우회했다. 상세는 위 항목 참고.
- **v0.6.6 배포 준비 완료** — v0.6.5 실사용 후속 수정 1건: **편집기 줄바꿈 줄 스크롤 시 커서/거터/렌더 손상 수정**(커밋 `776d1ad`, 머지 `7493789`). 너비 때문에 여러 줄로 접힌 행을 지나 스크롤하면 어느 순간 커서가 사라지고 에디터가 부분만 렌더되며, 클릭·상하이동·Home/End가 엉뚱한 줄로 가고 활성 줄↔왼쪽 줄번호(거터) 강조가 세로로 밀리던 것 — 원인 2겹: **(1) CM 6.43.4 tile-tree 뷰포트 손상**(뷰/높이 모델을 "tile tree"로 리라이트한 버전대의 스크롤 시 렌더 트리 손상) → `@codemirror/view` **6.43.6** 패치 업(상류 tile-tree corruption 수정 반영). **(2) 분수 줄높이**(`.cm-scroller` `lineHeight:"1.62"` + `--editor-font-size`가 `.toFixed(1)`로 13×1.62=21.06px 등 소수)가 래핑 행(높이=행수×줄높이)에서 CM 높이모델과 실제 렌더를 누적으로 어긋나게 함 → `App.tsx`가 **정수 px 폰트크기·줄높이(`--editor-line-height`)** 를 주입하고 `.cm-scroller`가 사용(측정=실제=모델). 보강: 번들 폰트가 마운트 이후 로드될 때(`document.fonts` `loadingdone`)·글꼴/줌 변경 시 **`remeasureFont`**(내부 `mustMeasureContent="refresh"`)로 완전 재측정(CM은 `document.fonts.ready`를 1회만 구독해 lazy 폰트 swap 후 재측정 못하던 것 보완). 진단: DPI(배율 100%)·CJK 폭 기각, "줄바꿈 스크롤 후 발생·거터 밀림"이 결정적 단서. 로컬 검증(`tsc`·`vite build`) 통과 + **dev 빌드 실사용 확인**(래핑 스크롤·클릭·화살표·Home/End·거터 정렬 정상), 릴리스 빌드 통과(신규 경고 0, 청크 경고는 기존 mermaid/katex). 버전 단일원 0.6.5→0.6.6(package.json·tauri.conf.json·Cargo.toml+lock), CHANGELOG·릴노트·store-listing·THIRD-PARTY-NOTICES(@codemirror/view 6.43.6) 갱신. 산출물(NSIS/MSIX/zip) 빌드·패키징 완료, 실신원 MSIX(`release/v0.6.6/README_0.6.6_x64.msix` · Name=`SlnU.README.md`·Publisher=`CN=1398342C-A2D7-4B4A-BFE2-34D8CCFD7FBA`·`0.6.6.0`·runFullTrust, 매니페스트·exe FileVersion=0.6.6 실물 확인). **GitHub 릴리스·`v0.6.6` 태그·push 완료**(릴리스 커밋 `b9e4591` · <https://github.com/slnu21/README.md/releases/tag/v0.6.6> · 자산 NSIS/MSIX/zip 3종). 실신원 MSIX(`release/v0.6.6/README_0.6.6_x64.msix`) **Microsoft Store 제출은 사용자 직접 — 대기**.
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
