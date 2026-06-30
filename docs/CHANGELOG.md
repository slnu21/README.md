# 변경 로그

이 프로젝트의 모든 주요 변경을 기록한다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/),
버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따른다.

## [Unreleased]
### Added
- 프로젝트 초기 구조 확정: `docs` / `src` / `release` 3폴더.
- Tauri v2 + React + TypeScript + Vite 베이스 스캐폴딩(`src/`), 프론트 소스 `app/`로 배치.
- 프론트엔드 모듈 스켈레톤(editor·preview·workspace·search·tabs·export·viewers·licensing, themes·locales·store·lib·workers).
- Rust 커맨드 스켈레톤(fs_ops·workspace·search·watch·export, db·assets) 및 `read_file`/`write_file` 구현.
- `tauri-plugin-dialog` 연동, 창/번들(`webviewInstallMode`) 설정.
- 설계·배포·법무 문서 초안.

[Unreleased]: https://example.com/compare
