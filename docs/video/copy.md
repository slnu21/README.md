# README.md 소개 영상 — 스크린샷 · 카피

2026-08-01 촬영. **실제 화면 캡처**(v0.6.8 포터블 빌드, 1920×1080 무손실 PNG, Paper 테마 · 한국어 UI).
데모 워크스페이스는 `D:\Workspace`(Atlas · Pulsar · Prism · Clowder · ShotLog · Notes — md 62개).

Atlas 영상(`Workspace/start/video`)·Clowder 영상(`Workspace/claude/deck/video`)과 같은 방식 —
Remotion, KO/EN × 16:9/9:16 4종, 36초, 나레이션 없이 음악 + 자막.

> 영상 프로젝트 자체(`video/`)는 gitignore 대상이다. 이 문서가 **커밋되는 유일한 원본**이므로,
> 다시 찍어야 할 때 필요한 것은 전부 여기에 적는다.

---

## 1. 왜 이 순서인가

Atlas 는 기능 몽타주, Clowder 는 화면 전환이 이야기였다. README.md 는 **문서가 쌓이는 속도**가 이야기다.
그래서 **문제 → 정리 → 읽기 → 지원범위 → 키보드 → 신뢰** 순으로 간다. 하나의 주장을 계속 회수한다:

> **에이전트가 쓴 문서를, 사람이 읽는 자리.**

핵심 비트(B4)의 결정타는 따로 있다 — 가상 폴더가 디스크를 건드리지 않는다는 **사실 그대로**다:

> **파일은 그대로, 배치는 내 마음대로.**

---

## 2. 비트 구성 (총 36초 · 1080프레임 @30fps)

씬 길이 합 1220f − 전환 7×20f = 1080f. 합이 어긋나면 렌더가 즉시 실패한다(`ReadmePromo.tsx`).

### B1 · 훅 — 문제 (190f) · 타이포만

| | |
|---|---|
| **KO** | 에이전트가 코드를 쓰는 동안, → 문서도 같이 쌓입니다. |
| **EN** | While the agent writes the code, → the documents pile up too. |
| **KO 보조** | `CLAUDE.md · TASKS.md · ADR · 개발로그 · 회의록` (모노) |
| **EN 보조** | `CLAUDE.md · TASKS.md · ADRs · devlogs · meeting notes` |

### B2 · 워드마크 (120f) · 마크 + 태그라인

| | |
|---|---|
| **KO** | **README.md** — 에이전트가 쓴 문서를, 사람이 읽는 자리. |
| **EN** | **README.md** — Where you read what your agent wrote. |
| **보조** | 가볍고 100% 오프라인인 마크다운 리더 & 에디터 / A lightweight, 100% offline Markdown reader & editor |

### B3 · 문서 더미 (150f) · `01-pile` → `02-pile-scrolled`

| | |
|---|---|
| **KO** | 여섯 개 저장소, 예순두 개의 .md. → 폴더가 정한 순서대로 쌓여 있습니다. |
| **EN** | Six repos. Sixty-two Markdown files. → Stacked in the order the folders decided. |
| **KO 보조** | 내가 정한 순서가 아니라. |
| **EN 보조** | Not the order you decided. |

### B4 · 정리 ★ 핵심 (230f) · `03-newfolder` → `04-drag` → `05-arranged`

B3 와 **같은 카메라**(사이드바 확대)로 끝내 "어질러진 더미"와 "정리된 트리"가 운을 맞춘다.

| | |
|---|---|
| **KO** | 문서 종류대로 폴더를 만듭니다. → 끌어다 놓으면 그쪽으로 옮겨집니다. → 파일은 그대로, 배치는 내 마음대로. |
| **EN** | Make a folder for a kind of document. → Drag it in — it moves. → Files stay put. The arrangement is yours. |
| **KO 보조** | 디스크의 파일은 그 자리 그대로. |
| **EN 보조** | The file on disk never moves. |

### B5 · 읽기 (160f) · `06-split` → `14-reader-paper` + `15-dark`

| | |
|---|---|
| **KO** | 왼쪽에 쓰면, 오른쪽에 바로 조판됩니다. → 읽을 땐 편집기를 치웁니다. |
| **EN** | Type on the left. It typesets on the right. → When you're reading, the editor gets out of the way. |
| **보조** | 리딩 모드 · 라이트 · 다크 · 페이퍼 / Reading mode · Light · Dark · Paper |

### B6 · 다이어그램·수식 (170f) · `07-mermaid` → `08-math`

| | |
|---|---|
| **KO** | 다이어그램은 코드 블록 하나로. → 수식도 그대로 나옵니다. |
| **EN** | A diagram is one code block. → So is the math. |
| **보조** | ` ```mermaid ` / `$$ … $$ · KaTeX` |

### B7 · 키보드 (110f) · `11-palette` + `12-search` + `13-f1` 크롭 3장

| | |
|---|---|
| **KO** | 손은 키보드에 둔 채로. |
| **EN** | Hands stay on the keyboard. |
| **보조** | `Ctrl+P · Ctrl+Shift+P · F1` |

### B8 · 아웃트로 (90f) · `16-present` 흐리게 + 로고 + Store 배지

| | |
|---|---|
| **KO** | 에이전트가 쓴 문서를, 사람이 읽는 자리. · v0.6.8 · 설치 5.5 MB · 100% 오프라인 |
| **EN** | Where you read what your agent wrote. · v0.6.8 · 5.5 MB installer · 100% offline |

---

## 3. 화면에 올린 숫자

- **설치 5.5 MB** — `release/v0.6.8/README.md_0.6.8_x64-setup.exe` = 5,741,657 B 실측.
- **100% 오프라인** — CSP `default-src 'self'`, 외부 origin 없음(`tauri.conf.json`).
- **62개 md** — `D:\Workspace` 실측(생성 스크립트가 매번 세어 출력한다).

**올리지 않은 것**: 메모리·기동 시간. 스토어 리스팅과 설계 문서의 "메모리를 적게", "빠르게 켜지고"는
설계 목표 산문일 뿐 저장소에 측정치가 없다. Electron 비교(`~100MB+`)도 경쟁 제품을 잰 적이 없어 뺐다.

---

## 4. 스크린샷 목록 (`video/public/shots/`)

전부 1920×1080, 실제 화면, Paper 테마(15번만 Dark).

| 파일 | 담긴 것 | 쓰임 |
|---|---|---|
| `01-pile.png` | Atlas `docs/` 를 펼친 트리 — ADR·개발로그가 보인다 | B3 |
| `02-pile-scrolled.png` | 아래로 스크롤 — Pulsar·Prism 이어짐 | B3 |
| `03-newfolder.png` | "폴더 이름" 모달에 `회고` 입력 | B4 |
| `04-drag.png` | **드래그 중** — `PTY.md` 흐림 + `이번 주` 강조 + 고스트 칩 | B4 ★ |
| `05-arranged.png` | 가상 폴더 5개가 최상단, 아래 가져온 저장소 6개 | B4 |
| `06-split.png` | 좌 `Atlas/CLAUDE.md` 원본 / 우 조판 | B5 |
| `07-mermaid.png` | 시퀀스 다이어그램(리딩 모드 + 넓게) | B6 |
| `08-math.png` | EMA · P95 디스플레이 수식 | B6 |
| `09-outline.png` | 아웃라인 오버레이 고정(제목 13개) | 예비 |
| `10-quickopen.png` | `Ctrl+P` + `ADR` — 8건, 경로 `D:\Workspace\…` | 예비 |
| `11-palette.png` | `Ctrl+Shift+P` 빈 상태 — 명령 전체 목록 | B7 |
| `12-search.png` | 전역 검색 `역압` — 7건 스니펫 | B7 |
| `13-f1.png` | `F1` 단축키 도움말(v0.6.8 헤드라인) | B7 |
| `14-reader-paper.png` | 리딩 모드 · 개발로그 + 벤치 이미지 | B5 |
| `15-dark.png` | Dark 테마 · 다이어그램 재테마 | B5 |
| `16-present.png` | 프레젠테이션 `3 / 9` | B8 |
| `17-tabs.png` | 탭 10개 | 예비 |

### 확대해서 보여줄 지점

1920 폭 정지 화면을 그냥 띄우면 글자가 안 읽힌다. 비트마다 **한 곳만** 확대한다.

- B3·B4 → 사이드바(`focus.x ≈ 0.09`). 0.5 면 크림색 사각형에 줄무늬 하나가 된다.
- B4 드래그 → 고스트 칩 + `이번 주` 드롭 강조를 크롭으로 떼어낸다.
- B6 수식 → 디스플레이 수식은 단 안에서 가운데 정렬이라 풀프레임 확대는 좌우를 버린다. 크롭.
- B7 → 오버레이 3종 전부 크롭.

---

## 5. 촬영 재현 (다시 찍을 때)

도구는 `video/capture/`(gitignore 대상이지만 스크립트는 그 폴더에 보존).

1. **`.\capture\userdata.ps1`** — 실사용 DB·WebView2 프로필을 비켜 놓는다. **건너뛰면 안 된다:**
   전역 검색이 `pathPrefix` 없이 호출돼(`AppShell.tsx` → `commands/search.rs`) 이 머신에 인덱싱된
   **모든 파일**이 조회되고, 열린 탭 경로가 localStorage 에서 복원된다. 촬영 후 `-Restore`.
2. 데모 워크스페이스 생성 — `make-demo.ps1`(구분자 파일 `demo-*.txt` 를 UTF-8 로 읽어 62개 md 작성 +
   `System.Drawing` 으로 그림 2장 생성). PS 5.1 이 BOM 없는 UTF-8 `.ps1` 을 ANSI 로 읽으므로
   **한글은 스크립트가 아니라 데이터 파일에** 둔다.
3. **`.\capture\stage.ps1 -Fresh`** — v0.6.8 포터블 기동 · 보조 모니터에 정확히 1920×1080 배치 ·
   작업표시줄 숨김 · 6개 폴더 등록. 폴더 등록은 네이티브 피커를 쓰지만 **카메라 밖에서** 한다
   (피커에 사용자 프로필 경로가 나온다).
4. 설정 한 번 — 언어 `한`, 테마 `Paper`, 에디터·미리보기 확대 **140%**(기본 13/16px 은 영상에서 안 읽힌다),
   미리보기 갱신 `빠름`, 자동 저장 끔.
5. `workspace.json` 을 "워크스페이스 가져오기(JSON)" 로 주입 — 가상 폴더 5개 + 참조 31개가 한 번에.
   카메라 밖에서 한다. FTS 인덱스는 그대로 남는다(`ws_import` 는 `node` 테이블만 건드린다).
6. 컷 촬영. **매 캡처 직전 `Park`** — 탭·검색 결과·트리 행의 `title` 이 전부 전체 경로다.
   `최근` 탭과 전역 찾기·바꾸기 패널은 아예 쓰지 않는다.

### 좌표 (1920×1080, 세로 스크롤바가 있는 상태)

| 대상 | 좌표 |
|---|---|
| 워크스페이스 툴바 `새 폴더` / `+`(폴더 가져오기) / 백업·복원 | `(85,103)` / `(180,103)` / `(211,103)` |
| 트리 행 | `즐겨찾기` = y140, 그 아래 n번째 = **y = 168 + 28n**, 클릭 x = 120 |
| 테마 Light / Dark / Paper | `(1598,22)` / `(1632,22)` / `(1666,22)` |
| 언어 한 / EN | `(1710,22)` / `(1741,22)` |
| 설정 톱니 | `(1786,22)` |
| 설정 — 에디터 확대 −/+ · 미리보기 확대 −/+ | `(1700,182)`/`(1773,182)` · `(1700,220)`/`(1773,220)` |
| 설정 — 미리보기 갱신 빠름·보통·느긋 | `(1693,259)` / `(1731,259)` / `(1768,259)` |
| 설정 — 리딩 폭 좁게·보통·넓게 | `(1694,298)` / `(1731,298)` / `(1768,298)` |
| 전역 검색 상자 | `(1466,22)` |
| 폴더 선택 대화상자 "폴더 선택" 버튼 | `(789,502)` |

> 툴바 x 좌표는 **사이드바 세로 스크롤바 유무에 따라 15px 정도 밀린다.** 본촬영 전 캘리브레이션 컷을
> 한 장 찍어 `crop.ps1` 로 확인한다.

### 함정

- 입력 주입은 **`mouse_event`/`keybd_event`** 를 쓴다 — PowerShell 에서 `SendInput` 은 성공을 반환하고도
  이벤트가 창에 닿지 않는다(INPUT 공용체 마샬링).
- 휠 델타는 부호 없는 dword 다. 아래로 스크롤(-120)은 2의 보수(`4294967176`)로 넘겨야 한다.
- 폴더 선택 대화상자는 경로를 붙여넣고 **Enter 를 치면 폴더 안으로 들어가기만 한다.** "폴더 선택"
  버튼을 눌러야 선택된다.
- 미리보기 확대는 **Ctrl+휠이 안 먹는다** — 미리보기가 iframe 이라 휠 이벤트가 부모 창 리스너에
  닿지 않는다. 설정 팝오버의 +/− 버튼을 쓴다.
- 파일명은 **깊이 3에서 17 표시열**을 넘기면 사이드바에 가로 스크롤바가 생기고 이름이 잘린다
  (한글 2열, 라틴 1열). ADR 은 `ADR-01-db.md`, 개발로그는 `07-28-간트줌.md` 식으로 짧게.

---

## 6. 알려진 제품 문제 (촬영 중 발견)

**v0.6.8 에서 mermaid `flowchart`·ER 다이어그램의 라벨이 잘린다.** 도형 안 글자가 오른쪽에서
글자 중간에 끊긴다. 한글뿐 아니라 **영문도** 잘린다(`CUSTOMER` → `CUSTOME`, `string` → `strin`).

- 재현: 앱 자체 회귀 픽스처 `docs/samples/mermaid-gallery.md` 를 v0.6.8 에서 열면 1·2번 다이어그램에서
  바로 보인다. 데모 문서(`Pulsar/docs/design/링버퍼.md`)에서도 동일.
- 확인한 것: 미리보기 확대율(100%·140%)과 무관, `다이어그램 너비`(맞춤·원본)와 무관,
  읽기 글꼴을 맑은 고딕으로 바꿔도 동일. **`sequenceDiagram` 은 멀쩡하다**(라벨이 도형 밖에 있다).
- v0.6.7 이 "다이어그램 글자가 도형을 벗어나거나 잘리던 문제"를 고쳤다고 적혀 있으므로, 남은
  경로이거나 회귀다. 별도 작업 단위로 다뤄야 한다.
- **영상에서는 시퀀스 다이어그램으로 우회했다**(`Atlas/docs/design/그래프.md`).
