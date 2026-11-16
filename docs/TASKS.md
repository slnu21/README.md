# TASKS — README.md

세션 간 진행 상황의 단일 진실원. 새 세션은 이것부터 읽는다. 긴 이력은 `CLAUDE.md` "현재 상태"와 [개발로그](개발로그/INDEX.md).

## 진행 중

### 웹 에디션 — 운영 중(https://md.ondolworks.com)
- W1·W2 main 머지(`ed2ff41`) · Cloudflare Pages(루트 `src` · `npm ci && npm run build:web` · `web-dist` · `NODE_VERSION=24`) Git 자동 배포 · 2026-11-16 curl 확인: `/ko/`·`/en/` 200 · 루트 언어 고르기 · 404 · CSP · 자원 1년 immutable · `/markdown-viewer` → `/en/markdown-viewer/` 301 · `manifest-ko.webmanifest` 200 · Search Console sitemap 제출.
- `_headers` 중복(`/ko/`+`/ko/*` → "no-cache, no-cache") 제거 2026-11-16(`develop-headers-dedupe`).
- **남은 손 확인**: 실제 Chrome/Edge 에서 PWA 설치·탐색기 .md 열기(file_handlers)·파일 핸들 제자리 저장 권한·Firefox 폴백. 네이버 서치어드바이저 등록(사용자).

## 웹 에디션 — 남은 일(W3 후보)
- **상대경로 이미지(로컬 파일)**: 폴더 핸들(`showDirectoryPicker`)로 문서 옆 폴더에 닿기 — 지금은 URL 로 연 문서만 상대 이미지가 보인다. 붙여넣은 이미지 저장(`writeFileBase64`)도 같이.
- 광고: 300×250 자리(`contain:strict`) 안에서만 · 광고 도메인은 `_headers` CSP 허용 목록에 더함(script-src·frame-src·img-src) · 광고 새로고침·인위적 리로드 금지 · 그때 설명 본문의 "분석 정보를 보내지 않습니다" 문장을 고친다.
- 공유 링크 상한(32,000자)이 실사용에 맞는지 — 메신저별 실측.
- 상태바가 390px 폰에서 잘린다(W1 부터 · 지금은 넘침만 막음) · 랜딩 og:image 는 아이콘 — 전용 카드 이미지.
- 설명 본문 문구 원어민 검토(en).
## 대기 · 결정 필요
- 표시 펜 무료/Pro(T7) 결정 — 게이팅 코드 없음(CLAUDE.md "다음 단계").
