# 2026-11-17 (01) web-analytics — 웹 에디션 Cloudflare Web Analytics 허용

- Pages 가 끼워 넣는 쿠키 없는 방문 통계 비콘을 CSP 가 막고 있었다(콘솔 오류 · 통계 0). 사용자 결정으로 허용.
- `buildCsp`: `script-src 'self' https://static.cloudflareinsights.com`(`CF_ANALYTICS_SCRIPT`). 전송은 기존 `connect-src https:` 로 이미 통과. sw.js 는 다른 출처 요청을 안 건드림.
- 웹 본문 '오프라인·개인정보' 문구: '분석 정보를 보내지 않습니다' → 문서 내용은 안 보내고 방문 수만 Cloudflare Web Analytics 로(ko/en).
- 웹 빌드 전용 파일만 수정(platform/web/site) — 데스크톱 산출물 무관.
- 검증: vitest 965 · probe:web RESULT=OK (67)
