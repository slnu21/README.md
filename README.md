# README.md

**README.md** — 경량 마크다운 **리더 & 에디터**. Windows 데스크톱, Microsoft Store 배포, 100% 오프라인.
> 제품명 = **README.md** (마크다운의 원형 파일 이름을 그대로 · "read me"). 저장소 디렉터리는 `md-reader` 유지.

## 폴더 구조
```
md-reader/
├─ docs/      # 설계·배포·법무 문서, html 시안, 변경로그 (→ docs/README.md)
├─ src/       # 앱 소스코드 (Tauri v2 + React + TypeScript)
│  ├─ app/        # 웹 프론트엔드 (UI)
│  └─ src-tauri/  # Rust 네이티브 셸
├─ release/   # 버전별 배포 산출물 (→ release/README.md)
├─ THIRD-PARTY-NOTICES.md  # 의존성 라이선스 고지 (생성됨: npm 46 + cargo 265)
└─ README.md
```

## 기술 스택
Tauri v2 · React · TypeScript · Vite · CodeMirror 6 · markdown-it · SQLite(FTS5). 자세한 내용: [docs/design/architecture.md](docs/design/architecture.md).

## 개발 시작
```bash
# 1) Rust 설치 (최초 1회) — https://www.rust-lang.org/tools/install
# 2) 프론트엔드 의존성
cd src
npm install
# 3) 개발 실행 (데스크톱 창)
npm run tauri dev
```
> 현재 이 환경에는 Rust가 미설치라 `tauri dev/build`는 Rust 설치 후 동작합니다. 타입체크(`npx tsc --noEmit`)는 바로 가능.

자세한 안내: [docs/notes/development.md](docs/notes/development.md).

## 라이선스
- 앱 사용 조건: [docs/legal/EULA.md](docs/legal/EULA.md) (상업적 사용 허용).
- 의존성: 전부 permissive(MIT/Apache/BSD 등) — [ADR 0001](docs/design/decisions/0001-tech-stack-and-packaging.md).
- 서드파티 고지: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) (자동 생성, 단독 GPL/AGPL/LGPL/SSPL 없음).
