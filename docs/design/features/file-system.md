# 파일 시스템

## 접근 방식
- 파일/폴더 선택: Tauri **dialog** 플러그인 → 경로 획득.
- 읽기/쓰기/편집: **Rust 커맨드(`std::fs`)** — 일반 데스크톱 프로세스와 동일한 풀 접근(임의 경로). JS측 fs 스코프/`../` 제약 우회.
- 상대경로 이미지/리소스: **asset 프로토콜**(`convertFileSrc`)로 열린 문서 디렉터리 스코프 한정 서빙.
- 파일 감시: Rust **notify** → 변경 이벤트 emit → 자동 갱신.

## Store 패키징과의 관계
- Tauri 산출물은 **풀 트러스트 Win32 앱** → 파일 접근 유지. 자세한 내용: [deployment/microsoft-store.md](../../deployment/microsoft-store.md).

구현: `src/src-tauri/src/commands/fs_ops.rs`, `watch.rs`, `assets.rs`, `src/app/lib/tauri.ts`.
