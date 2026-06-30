# 테마

CSS 변수 토큰 기반 **테마 레지스트리**. 코드 수정 없이 테마 추가 가능.

- 내장: **light**, **dark**, **paper**(종이질감 — 리더 가독성).
- 토큰: `--bg`, `--fg`, `--accent`, `--surface`, `--border` (확장 가능).
- 에디터(CodeMirror)·미리보기 테마를 함께 동기화.

구현: `src/app/themes/index.ts`. 상태: `src/app/store`.
