# 2026-11-16 01 _headers 중복 제거

브랜치 `develop-headers-dedupe` · Atlas #41

## 배경

실배포 HTML 응답이 `Cache-Control: no-cache, no-cache`. Cloudflare Pages 의 `/ko/*` 는 `/ko/` 자신도 매칭하고, 겹치는 규칙의 같은 헤더는 쉼표로 합친다.

## 변경

- 생성기 — 정확 일치 `/ko/`·`/en/` 규칙 삭제(`/ko/*` 하나로).
- 테스트 — Pages 매칭 규칙(`*` = 빈 문자열 포함)으로 실제 경로마다 Cache-Control 규칙이 정확히 1개인지.
- `docs/TASKS.md`·`CLAUDE.md` — W2 '검토 대기' → 운영 중(md.ondolworks.com, curl 확인 결과).

## 검증

- vitest 964 · tsc 0 · probe:web 67/67 · 웹 빌드 전용 파일이라 데스크톱 산출물 무관.
