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

## 현재 상태 (2026-07-08 기준)
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
