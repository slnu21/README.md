# TASKS — README.md

세션 간 진행 상황의 단일 진실원. 새 세션은 이것부터 읽는다. 긴 이력은 `CLAUDE.md` "현재 상태"와 [개발로그](개발로그/INDEX.md).

## 진행 중

### 웹 에디션 W2 — 구현 완료(검토 대기)
- 브랜치 `develop-web-w2`(worktree `Workspace/.worktrees/md-reader/develop-web-w2/`) · 시작 2026-11-15 · 데브로그 [(04) web-w2](개발로그/2026-11-15-04-web-w2.md) · W1 은 main 머지 완료(`5407808`).
- **데스크톱 불변(사용자 요구)**: 데스크톱 `vite build` 산출물이 main 과 76/76 파일 SHA-256 동일(index.html 포함). 규칙은 CLAUDE.md 규약(삼항 앞가지 · 웹 훅은 `bridge.ts` 로만 · `index.html` 무접촉).
- **한 것**: 배포 파일(`_headers` CSP·캐시 · `_redirects` · 404 · sitemap · robots) · `/<en|ko>/<랜딩>/` 8장 + 루트 언어 고르기 · 첫 화면 = 앱 / 아래 = 보이는 설명 본문(사용자 설계 변경) · 언어 전환 = 다른 URL 로 이동 + 탭 IndexedDB 보관·복원 · `?url=` · 공유 링크 · PWA(sw.js·manifest·file_handlers·launchQueue) · Ondol Works 브랜드 링크.
- **다음 단계**: ① 사용자 검토 → `main` 에 `--no-ff` 머지 · worktree 정리(머지·push 는 사용자 확인 뒤) ② Cloudflare Pages 프로젝트 만들기(루트 `src` · `npm ci && npm run build:web` · 출력 `web-dist` · `NODE_VERSION=24`) + 커스텀 도메인 `md.ondolworks.com` — 사용자 확인 게이트 ③ 배포 뒤 실브라우저로: 응답 헤더(CSP)·`/markdown-viewer` 301·PWA 설치·탐색기에서 .md 열기(file_handlers)·Search Console 에 sitemap 제출 ④ 실제 Chrome/Edge 에서 손으로: 파일 핸들 제자리 저장 권한·Firefox 폴백(W1 남은 것).

## 웹 에디션 — 남은 일(W3 후보)
- **상대경로 이미지(로컬 파일)**: 폴더 핸들(`showDirectoryPicker`)로 문서 옆 폴더에 닿기 — 지금은 URL 로 연 문서만 상대 이미지가 보인다. 붙여넣은 이미지 저장(`writeFileBase64`)도 같이.
- 광고: 300×250 자리(`contain:strict`) 안에서만 · 광고 도메인은 `_headers` CSP 허용 목록에 더함(script-src·frame-src·img-src) · 광고 새로고침·인위적 리로드 금지 · 그때 설명 본문의 "분석 정보를 보내지 않습니다" 문장을 고친다.
- 공유 링크 상한(32,000자)이 실사용에 맞는지 — 메신저별 실측.
- 상태바가 390px 폰에서 잘린다(W1 부터 · 지금은 넘침만 막음) · 랜딩 og:image 는 아이콘 — 전용 카드 이미지.
- 설명 본문 문구 원어민 검토(en).
## 대기 · 결정 필요
- 표시 펜 무료/Pro(T7) 결정 — 게이팅 코드 없음(CLAUDE.md "다음 단계").
