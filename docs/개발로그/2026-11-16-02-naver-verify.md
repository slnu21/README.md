# 2026-11-16 02 네이버 서치어드바이저 소유 확인 파일

브랜치 `develop-naver-verify` · Atlas #41

## 변경

- ``SITE_VERIFICATION_FILES``(pages.ts) → 웹 플러그인이 web-dist 루트에 냄. **``src/public`` 에 두지 않은 이유: 데스크톱 빌드도 public 을 복사해 바이트 동일 원칙이 깨진다.** precacheList 에서 제외(테스트).
- 지우면 네이버 소유 확인이 풀린다.

## 검증

- site 테스트 24 · tsc 0 · build:web OK(web-dist 에 파일 있음, sw.js 에 없음) · 데스크톱 vite build 결과물에 파일 없음.
