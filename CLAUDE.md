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

## 현재 상태 (2026-06-30 기준)
- **스캐폴딩 + 모듈 스켈레톤 완료**(대부분 스텁). 기능 구현은 아직 시작 전.
- 구현된 것: `read_file`/`write_file` Rust 커맨드, dialog 플러그인 연동, 테마/i18n/store 기본 골격.
- 프론트 타입체크 통과. **이 환경엔 Rust 미설치** → `tauri dev/build`는 `rustup` 설치 후 가능.
- 설치된 프론트 의존성(코어): zustand, i18next/react-i18next, markdown-it(+types), dompurify, @tauri-apps/plugin-dialog. **미설치(구현 시 추가)**: CodeMirror `@codemirror/*`, highlight.js, katex, mermaid, pdfjs-dist, markdown-it 플러그인들. Rust의 rusqlite·notify는 `Cargo.toml`에 주석으로 표시.

## 다음 단계 (MVP v0.1 로드맵)
1. 파일/폴더 열기(dialog → Rust read) + 워크스페이스 트리 사이드바
2. 탭 + CodeMirror 6 에디터 연결
3. 실시간 미리보기(markdown-it 워커 → DOMPurify → iframe) + 이미지(asset 프로토콜)
4. 저장, 파일 감시, 최근, 다크/라이트

전체 로드맵·기능 상세는 [docs/README.md](docs/README.md) 참고.
