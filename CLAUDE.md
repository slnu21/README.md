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
- 루트: `README.md`, `THIRD-PARTY-NOTICES.md`(자동생성 예정), `.gitignore`

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
- **오프라인**: 원격/CDN 금지, 모든 자산 번들. 릴리스 전 하드닝 CSP 적용(현재 `tauri.conf.json`의 csp는 `null` — [docs/notes/development.md](docs/notes/development.md)).
- **라이선스**: permissive(MIT/Apache/BSD/ISC 등)만 허용. GPL/AGPL/LGPL/SSPL 금지.
- **Store 패키징**: **MSIX → Store**(Microsoft 재서명 → 코드서명 인증서 불필요)가 기본. Tauri는 MSI/NSIS만 내므로 **MSIX 래핑 1단계** 필요. 매니페스트에 `runFullTrust`. 자세히: [docs/deployment/microsoft-store.md](docs/deployment/microsoft-store.md).

## 현재 상태 (2026-07-03 기준)
- **v0.1 릴리스 완료** — MVP(열기·편집·미리보기·저장·감시·최근·3테마·i18n·프레임리스·공식 마크다운 로고) + MSIX/NSIS/zip + GitHub(github.com/slnu21/README.md).
- **v0.2 기능 구현 완료**(로컬 검증: `tsc`·`vite build`·`cargo check` 모두 통과):
  - 리치 미리보기 — highlight.js 코드 하이라이트, KaTeX 수식(MathML 출력), markdown-it 플러그인 세트(각주·체크박스·콜아웃·sub/sup/mark/deflist 등), 아웃라인/TOC, mermaid(메인스레드 SVG 주입), 문서 내 찾기/바꾸기(@codemirror/search), 타이틀바 반응형(#118).
  - 워크스페이스 & 검색 — SQLite(rusqlite bundled) 도입, 전역 FTS5 검색, 즐겨찾기·최근·설정 영속화, imported 폴더 영속(자식은 디스크 파생=D1). 스키마: [docs/design/data-model.md](docs/design/data-model.md).
- **Rust 설치됨** → `cargo check`/`tauri dev/build` 가능. 미리보기 iframe은 `sandbox="allow-same-origin"`(allow-scripts는 절대 미포함, TOC 스크롤용).
- 남은 런타임 검증(사용자 `tauri dev`): DB 스모크(`%APPDATA%\com.readme.app\md-reader.db`·FTS5 생성), 검색 인덱싱·질의, mermaid 실제 렌더.

## 다음 단계
- v0.2 런타임 검증 → 릴리스(산출물 재빌드; THIRD-PARTY-NOTICES는 신규 deps 반영 완료).
- 후속: 내보내기 HTML/PDF(v0.3), 가상 폴더 생성 UI·드래그 재배치(Rust 커맨드는 준비됨, UI 후속), 설정 localStorage↔SQLite 이중화.

전체 로드맵은 [docs/README.md](docs/README.md) 참고.
