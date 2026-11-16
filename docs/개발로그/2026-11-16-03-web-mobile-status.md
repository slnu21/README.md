# 2026-11-16 03 웹 에디션 — 폰 폭 상태바·설명 힌트

브랜치 `develop-web-mobile-status` · Atlas #41

## 배경

390px 에서 문서를 열면 상태바 칸이 세로로 접히고("저장됨"·"단어 · ~1분"·"UTF-8"), "아래에 설명 ↓" 힌트가 상태바 위로 올라가 미리보기 글·다이어그램을 덮었다(W1 부터 알던 것, TASKS W3 후보).

## 변경(`app/platform/web/web.css` 만 — 마크업은 데스크톱과 공유라 CSS 로 고른다)

- ≤480px: 상태바 `.st` 줄바꿈 금지 + 뒤쪽 셋(Markdown·테마·UTF-8) 숨김 → 저장 상태 · 줄/열 · 단어/읽는 시간만.
- ≤900px: 문서가 열려 있으면(상태바 저장 점 `.dot-ok`/`.dot-dirty` 존재 — `:has()`) 힌트 숨김. 빈 화면에서는 그대로.

## 검증

- 390px CDP 실측: 문서 열림 → 힌트 숨김·상태바 한 줄·가로 넘침 0 / 빈 화면 → 힌트 보임.
- vitest 965 · `probe:web` 67/67 · 데스크톱 `vite build` 결과물에 `wi-hint` 흔적 0(`web.css` 는 `platform/web/ui.ts` 만 import).