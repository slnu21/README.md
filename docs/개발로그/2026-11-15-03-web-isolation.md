# 2026-11-15 (03) 데스크톱 번들에서 웹 전용 코드 제외 — 데스크톱 산출물이 main 과 바이트 동일

브랜치 `develop-web-edition`(이어서) · [TASKS](../TASKS.md) · 사용자 요구 "기존 데스크톱 앱은 전혀 변경이 없어야 한다" · **머지 전(사용자 검토 대기)**

## 배경

(02)는 `features` 표(런타임 객체)로 UI 를 갈랐다. 빌드가 그 값을 모르니 데스크톱 번들에도 웹 사이드바·웹 문구·웹 CSS·분기 코드가 실렸다
— 엔트리 JS 1,138.49 → 1,141.72KB, 로케일 JSON 에 `web.*` 26키, App.css 에 206줄, 스토어에 영속 키 하나(`sidebarCollapsed`).

## 변경

- **판 상수 `__WEB__`** — `vite.config.ts` `define` 이 빌드 때 리터럴로 바꾼다(데스크톱·vitest·프로브 = `false`). 선언은 `app/vite-env.d.ts`.
  UI 분기는 전부 이 상수로 — 데스크톱 빌드에서 웹 쪽 가지가 상수 접기로 사라지고, 웹 전용 모듈은 쓰는 곳이 없어져 import 째 빠진다.
- **규칙(찾은 것)**: `{__WEB__ && <X/>}` 는 데스크톱에 **`false` 자식**을 남겨 번들이 바뀐다(접기 후에도 배열 원소로 남는다). 웹 쪽은 반드시
  **`__WEB__ ? 웹 : 원래` 의 앞가지**로 — 접으면 원래 식만 남는다. 데스크톱 쪽 조건은 `!__WEB__ && 원래` / `if (!__WEB__ && 원래 조건)` 처럼 **상수를 왼쪽에**.
  그래서 접기 버튼은 타이틀바가 아니라 사이드바 슬롯 삼항 안에서 렌더하고 CSS 로 타이틀바 왼쪽 위에 고정했다(데스크톱 타이틀바 DOM 무접촉).
  내보내기 메뉴는 `exportMenu && active && (__WEB__ ? 웹 셋 : 원래 여섯)`, 빈 화면 앱 링크는 안내 문장 삼항 안으로.
- **웹 문구 분리** — `locales/ko.json`·`en.json` 은 main 그대로. `app/platform/web/locales/{ko,en}.json` 조각을 `platform/web/ui.ts` 가
  `addResourceBundle`(깊은 병합·덮어쓰기 금지)로 등록. `ui.ts` 는 웹 CSS(`platform/web/web.css`)도 싣는다 — 둘 다 `platform/web/index.ts` 만 import 하므로 웹 빌드에만.
- **웹 CSS** — App.css 는 main 그대로. 웹 CSS 는 App.css 보다 먼저 들어갈 수 있어 모든 규칙을 `.app.edition-web` 아래에 둬 **특이성으로** 이긴다.
- **스토어 원복** — `sidebarCollapsed` 를 빼고 `WebSidebar.tsx` 의 `useWebSidebarCollapsed`(localStorage `readme-md.web.sidebarCollapsed`)로. 데스크톱의 영속 `md-reader` 모양 불변.
- **표시 펜·캔버스 저장소 원복** — (02)는 `invoke` 호출을 platform 함수로 옮겼는데 그게 데스크톱 번들을 바꿨다. `lib/annot/api.ts`·`lib/canvas/cards.ts` 는
  main 그대로 두고 import 한 줄만 `@platform` 의 `invoke` 로(데스크톱 = Tauri invoke 재수출 → 같은 바인딩 · 웹 = `EWEB` 거절 대역). `isNative`·`annot*`·`canvas*` 플랫폼 함수 삭제.
- `WebSidebar.tsx` 에 웹 전용 소품을 모음(접기 버튼·접힘 훅·데스크톱 전용 안내 사양·빈 화면 링크·설정 한 줄 안내) — 모듈 최상위 부작용 없음(그래야 데스크톱에서 빠진다).
- 테스트 `platform/web/ui.test.ts` 3(ko/en 대칭·데스크톱 로케일 원문에 `web` 없음·등록 인자/실등록).

## 검증 — main 과 데스크톱 빌드 비교

main 을 임시 worktree(scratchpad, `node_modules` 정션)로 꺼내 같은 Vite 로 데스크톱 `vite build` 를 각각 돌려 `assets/` 를 비교(끝나고 정션 먼저 풀고 정리).

| 항목 | main | (02) 직후 | 이 커밋 |
|---|---|---|---|
| 엔트리 JS raw / gzip | 1,138.49 / 386.25 KB | 1,141.72 / 387.21 KB | **1,138.49 / 386.25 KB** |
| 엔트리 CSS raw / gzip | 52.69 / 10.38 KB | (App.css +206줄) | **52.69 / 10.38 KB** |
| 청크·자산 수 | 73 | 73 | **73** |
| 파일명(내용 해시) 일치 | — | — | **73/73**, 바이트 동일 73 |
| 자산 합계 | 7,427,625 B | — | **7,427,625 B** |

- 줄이지 않은 빌드(`minify:false`)로도 비교 — 공백을 무시하면 차이는 **주석 두 줄뿐**(JSX 안 주석이 그대로 실린 것, 압축 빌드에서는 사라짐).
  (02)→중간 단계의 +27B 는 줄이지 않은 diff 로 원인을 찾았다: platform 으로 옮긴 `annot*`/`canvas*` 함수와 `isNative`, JSX 의 `false` 자식.
- 파일이 해시까지 같으므로 데스크톱 DOM·문자열도 main 과 같다(같은 코드) — DOM 스냅샷 비교는 따로 하지 않았다.
- `tsc` 0 · vitest **919**(916 + ui 3) · `npm run build` 경고 1(**main 과 같은** 청크 500KB 경고) · `npm run build:web` 경고 0 · `probe:web` **28/28** · `cargo build` 경고 0
  · `probe:perf` PASS(bundle: entry_js 1111.8/1150 KiB · gzip 377.2/390 · css gzip 10.1/12)
  · 데스크톱 프로브 `layout`·`mermaid`·`rtl`·`canvas` PASS · **`probe:annot` 단독 3회 연속 PASS**(질감 켬 66.1/66.5/67.3ms · 끔 67.0/67.2/66.0ms)
  — (02) 때 cargo 빌드와 동시에 돌린 1회 "불변식 1건 위반"은 재현되지 않았다(어느 불변식이었는지는 그때 출력을 남기지 못했다).

## 비목표

웹 기능 자체는 (02)와 같다(W2 는 TASKS 메모).
