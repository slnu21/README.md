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

## 현재 상태 (2026-07-04 기준)
- **v0.1 릴리스 완료** — MVP(열기·편집·미리보기·저장·감시·최근·3테마·i18n·프레임리스·공식 마크다운 로고) + MSIX/NSIS/zip + GitHub(github.com/slnu21/README.md).
- **v0.2–v0.5 구현 완료**(로컬 검증 `tsc`·`vite build`·`cargo check` 통과 · **아직 미릴리스** — 패키지 버전 문자열은 `0.2.0` 그대로):
  - **v0.2** 리치 미리보기(highlight.js·KaTeX(MathML)·markdown-it 플러그인 세트·아웃라인/TOC·mermaid·문서 내 찾기/바꾸기) + 워크스페이스/검색(SQLite rusqlite bundled·전역 FTS5·즐겨찾기·최근·설정 영속). 스키마: [docs/design/data-model.md](docs/design/data-model.md).
  - **v0.3** 편집 UX 8종(드롭 열기·분할 폭 조정·글꼴 변경(시스템+번들 OFL)·펼침 상태 기억·에디터/미리보기 줌·paper 테마 톤·창 시각 구분 카드·편집 위치 스크롤 동기화).
  - **v0.4** 워크스페이스 재구성(가상 폴더 UUID 그래프 렌더·생성/이동/재정렬 포인터 DnD·즐겨찾기 최상단 고정·[워크스페이스\|최근] 사이드바 탭) + 아웃라인 우측 오버레이 + UI 폰트 Pretendard + 탭 오버플로우/재정렬.
  - **v0.5** 내보내기(자기완결 HTML: 이미지·선택 폰트 data URI 임베드 / PDF: OS 인쇄 대화상자) + `.md`/`.markdown` **파일 연결**(선언 + single-instance 실행인자 처리) + 기본 우클릭(브라우저) 메뉴 억제.
- **Rust 설치됨** → `cargo check`/`tauri dev/build` 동작. 미리보기 iframe은 `sandbox="allow-same-origin"`(allow-scripts는 절대 미포함). CSP 하드닝 적용됨.

## 다음 단계
- **배포 준비(진행 중)**: 릴리스 버전 확정(예: `0.2.0`→`0.5.0`) → `tauri.conf.json`·`Cargo.toml`·`package.json` 범프 → 산출물 재빌드(NSIS→MSIX 래핑→zip) → **THIRD-PARTY-NOTICES 재생성**(신규 deps `base64`·`tauri-plugin-single-instance` 반영) → `release/` 정리 → Store 재제출(**파일 연결은 MSIX 재제출 후 발효**).
- 후속: 내보내기 고도화(WebView2 `PrintToPdfAsync` 무대화상자 PDF 저장 — `commands/export.rs`), 설정 localStorage↔SQLite 이중화, 에디터 커스텀 우클릭 메뉴.

전체 로드맵은 [docs/README.md](docs/README.md) 참고.
