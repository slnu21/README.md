# 2026-10-11 (02) [v1.0] 기동 단축 — 렌더러를 첫 번들에서 빼기 (첫 JS 1,774 → 1,035 KB)

브랜치 `develop-startup-split`

## 배경

U1(01)이 남긴 후보를 사용자가 "단축 가능하면 진행"으로 정했다. 첫 번들 1.8 MB 에 마크다운 렌더러
(markdown-it·KaTeX·highlight.js)가 들어 있었는데, 미리보기 렌더는 워커가 하고 워커 청크가 같은 라이브러리를
따로 담는다 — **한 벌이 이중**이었다. 같은 날 U2 브리지 실사용도 시작했다(Store 설치본을 Claude Code 사용자
범위에 등록, Connected).

## 변경

- `lib/markdownLazy.ts` 신설 — 메인 스레드는 `loadMarkdown()`(동적 import, 한 번만 싣고 공유)으로만 렌더러에
  닿는다. 쓰는 곳 셋: `features/export/html.ts`(HTML 복사·내보내기·PDF) · `shell/Presentation.tsx` ·
  `shell/Preview.tsx` 데모 경로. 셋 다 이미 비동기 문맥이라 호출부 모양은 그대로다. 타입은 `import type`.
- `lib/fenceLangs.ts` 신설 — 편집기 코드펜스 자동완성 목록. 편집기가 이 상수 하나 때문에 `lib/markdown.ts`
  를 통째로 끌어오고 있었다. `markdown.ts` 는 `HIGHLIGHT_LANGS` 를 내보내고 **둘이 같은지 테스트가 본다**.
- `tools/bundle-map.mjs` 신설 — 첫 청크를 패키지별로 쪼갠다(새 의존성 0). 번들 예산이 떨어지면 무엇이
  돌아왔는지 보는 도구.
- 번들 예산 조임: 첫 JS 1,950 → **1,150 KB**, gzip 650 → **390 KB**(렌더러가 메인으로 돌아오면 떨어진다).
- 문서: performance.md(번들 표·첫 청크 구성·§6 후보 정리) · CHANGELOG · roadmap(U2 착수) · CLAUDE.md.

## 숫자

| | 전 | 후 |
|---|---:|---:|
| 첫 JS | 1,774 KB | 1,035 KB |
| 첫 JS gzip | 585 KB | 349 KB |
| 첫 청크(압축 전 렌더 길이) | 4,276 KB | 2,481 KB |

**기동 시간은 잠정** — 측정하는 동안 사용자가 게임 중이라 CPU 70~80% 였다. 새 판과 v0.10.0 을 번갈아 두 바퀴
잰 "WebView2 가 뜬 뒤 → 셸" 구간(우리 코드가 정하는 몫)이 새 판 631·724 / 기존 772·799 ms 로 약 100 ms 짧다.
같은 이유로 `probe:perf` 의 시간 항목도 이번엔 판정할 수 없었다(제 변경과 무관한 순수 함수 시간까지 30% 늘었다).
**한가할 때 `npm run probe:perf` 와 `node tools/perf-app.mjs` 를 다시 돌려 확정한다.**

## 결정·함정

- 남은 첫 청크 상위는 react-dom · CodeMirror · Tauri API · DOMPurify — 첫 화면에 다 필요하다. `lang-markdown`
  이 HTML 블록용으로 HTML·JS·CSS 문법(약 200 KB)을 정적으로 묶는 것은 패치 없이는 못 뺀다 → 여기서 멈춘다.
- 지연 import 는 하드닝된 CSP(`script-src 'self'`) 아래에서도 로컬 청크라 된다(mermaid 가 이미 그렇게 산다) —
  그래도 실물에서 확인했다(아래).

## 검증

- `tsc` · vitest **738 → 739**(FENCE_LANGS = HIGHLIGHT_LANGS) · Rust 무변경 · `vite build`(기존 청크 경고만)
- `probe:mermaid` · `probe:layout` · `probe:rtl` PASS(데모 경로가 이제 지연 import — rtl 프로브는 내보내기도 부른다).
  `probe:perf` 번들 PASS / 시간 항목은 부하로 판정 보류(위).
- **릴리스 모드 exe 실구동 6항목 PASS**(CDP · 실사용 데이터 비켜 놓고 원복): 미리보기(워커 · KaTeX · hljs) ·
  프레젠테이션이 수식 든 첫 슬라이드를 그림 · 닫힘 · 명령 팔레트 · **HTML 복사가 KaTeX 든 완전한 문서를
  클립보드에**(`Get-Clipboard -TextFormatType Html`) · 처리 안 된 예외 0.

## 비목표

- 워커 기동(첫 미리보기 약 650 ms 중 워커 청크 752 KB 적재) — 렌더에 다 필요한 라이브러리라 줄일 여지가 작다.
