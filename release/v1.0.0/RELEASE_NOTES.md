# README.md v1.0.0

> **초안(2026-10-12)** — 버전 상향(0.10.0 → 1.0.0)·태그·GitHub 릴리스·Store 제출은 확인 게이트다. 출하일·산출물 크기·
> 스크린샷 링크는 그때 채운다.

가볍고 100% 오프라인인 마크다운 리더 & 에디터. Windows x64.

**에이전트가 쓴 문서를, 사람이 읽는 자리.** — *Where people read what agents write.*

[한국어](#한국어) · [English](#english)

---

## 한국어

### 1.0 이 뜻하는 것

0.6 에서 0.10 까지 석 달 동안, 이 앱은 "md 파일 여는 가벼운 프로그램"에서 **AI 에이전트가 쏟아내는 문서를 사람이 받아 읽는
자리**가 되었습니다. 0.10.0 에서 그 고리를 이어 붙였고(에이전트 브리지 · 받은 문서함 · 문서 기록), 1.0 은 그것을 **실제로 써
보고, 숫자로 재 보고, 고친** 판입니다. 새 기능은 하나뿐입니다. 대신 이제 "가볍다"·"안전하다"에 숫자와 실측이 붙습니다.

### 여기까지 온 길 — 0.6 → 1.0

| 판 | 무엇이 생겼나 |
|---|---|
| **0.6** | 명령 팔레트·빠른 열기 · 리딩/프레젠테이션 모드 · 전역 찾기·바꾸기 · 작성 도구 · 닫기 가드·세션 복원·자동저장 |
| 0.6.1–0.6.9 | 실사용 후속 — 다이어그램 라벨이 넘치고 잘리던 것(원인 네 겹), 편집기 줄바꿈 스크롤, 파일 열자마자 "수정됨"… **0.6.8 에서 단위 테스트를 들였고, 0.6.9 부터 다이어그램 검사를 저장소에 남깁니다**(한 번 버렸다가 같은 문제가 다시 나갔습니다) |
| 0.6.8 | 작성 기능 확충 — 단축키 도움말 · 서식 단축키 · 자동완성 · 이미지 붙여넣기 · 표 도구 |
| **0.7** | 가져온 폴더 자동 재동기화 · 새 문서 만들기 · 리딩 모드 좌우 분할 · 링크 클릭이 실제로 열리도록(0.7.1) |
| **0.8** | 한지·전자잉크 테마 · 제목·인용·목록의 색 위계 · **내 테마 파일과 스타일 팩**(색과 모양을 남과 주고받기) |
| **0.9** | 테마가 폴더 안의 파일이 됨 · 컬러 전자잉크 · Store 설치본의 데이터 폴더 결함 수정 |
| **0.10** | **에이전트 브리지(MCP)** · **받은 문서함** · **문서 기록·되돌리기** · 오른쓰기 언어(RTL) · 좁은 창 툴바 접기 |
| **1.0** | 성능 예산 · 브리지 실사용 수정 · 업데이트 실측 · 방침·문서 정리 · 줄 지정 열기 |

### 1.0 에서 바뀐 것

**에이전트가 문서를 띄울 때 그 줄로.** 에이전트가 "보고서 3절의 결론을 보세요"라며 문서를 띄우면 그 자리가 화면 위에
옵니다 — 미리보기·편집기 모두, 옆 패널로 열 때도, 앱이 꺼져 있을 때도.

**처음으로 잰 숫자.** 기준선을 먼저 재고, 튀는 것을 고쳤습니다.

- 문서 5천 개 폴더의 첫 색인 **132초 → 6초** · 흔한 낱말 검색 **86 → 8.5ms** · 에이전트 검색 62 → 12ms.
  밤새 100개가 바뀐 아침의 첫 실행 9초 → 1초 남짓.
- 앱이 처음 싣는 코드 **40% 감소**(1,774 → 1,035KB) — 기동이 약 40ms 빨라졌습니다(솔직한 숫자입니다).
- 재는 장치(`probe:perf` 등)와 예산 파일을 저장소에 남겨, 다음 판부터는 숫자가 나빠지면 검사가 멈춥니다.

**브리지를 실제로 붙여 쓰며 고친 것.**

- 워크스페이스 밖 문서를 읽으려 하면 **다음에 할 일을 함께** 알려 줍니다. 오류 문구는 한국어·영어 두 벌입니다.
- 검색 범위를 저장소 전체처럼 넓게 줘도 그 안의 워크스페이스 문서만 찾아 줍니다. `/` 로 쓴 경로로 범위를 주면 0건이던 것도 고쳤습니다.
- 다른 프로그램이 문서를 고치는 동안 **검색에서 그 문서가 잠깐 빠지던 것** — 1만 4천 번 중 900번 가까이 빠지던 것이 0번입니다.

**읽던 자리.** 다른 문서를 열면 앞 문서를 읽던 높이에서 열리던 것, 옆 패널을 열면 주 패널이 맨 위로 돌아가던 것을 고쳤습니다.

**문서.** 개인정보 처리방침에 **AI 에이전트 연결** 절이 생겼습니다 — 앱은 아무것도 보내지 않지만, **연결한 에이전트가 읽어 간
내용은 그 에이전트 제공자의 방침**을 따릅니다. 검색 색인·문서 기록이 본문 사본을 기기 안에 둔다는 것도 적었습니다.
README 에 에이전트 연결 안내(ko/en)가 생겼습니다.

### 알아 둘 점

- **업데이트**: 에이전트가 연결돼 있는 동안 Windows 는 앱이 실행 중인 것으로 봅니다. 업데이트가 미뤄지면 앱과 에이전트 세션을
  닫았다가 다시 여세요. 업데이트 뒤 에이전트가 끊겼으면 다시 연결합니다(Claude Code 는 `/mcp`).
- 업데이트 뒤 첫 실행에서 색인 정보를 한 번 정리합니다(문서 5천 개 기준 0.1초 · 문서·기록·워크스페이스는 그대로).
- **새 의존성이 없습니다.** 네트워크 포트를 열지 않습니다 — 100% 오프라인 그대로입니다.

---

## English

### What 1.0 means

Over three months from 0.6 to 0.10, this app went from "a light program that opens .md files" to **the place where people read the
documents AI agents produce**. 0.10.0 closed that loop (agent bridge · inbox · document history). 1.0 is the release where we
**used it for real, measured it, and fixed what we found**. There is only one new feature; instead, "lightweight" and "safe" now
come with numbers and measurements.

### How we got here — 0.6 → 1.0

| Version | What arrived |
|---|---|
| **0.6** | Command palette & quick open · reading/presentation modes · global find & replace · writing tools · close guard, session restore, autosave |
| 0.6.1–0.6.9 | Follow-ups from real use — diagram labels overflowing and clipping (four causes), editor wrap scrolling, "modified" right after opening… **unit tests arrived in 0.6.8, and since 0.6.9 the diagram checks live in the repository** (we threw one away once and the same bug shipped again) |
| 0.6.8 | More writing tools — shortcut help · formatting shortcuts · autocomplete · image paste · table tools |
| **0.7** | Imported folders resync automatically · new document · side-by-side reading · links actually open (0.7.1) |
| **0.8** | Hanji and E-Paper themes · color hierarchy for headings, quotes, lists · **your own theme files and style packs** (share colors and shapes) |
| **0.9** | Themes became files in a folder · Color E-Paper · fixed the Store install's data-folder bug |
| **0.10** | **Agent bridge (MCP)** · **Inbox** · **Document history & restore** · right-to-left scripts · toolbar that folds in narrow windows |
| **1.0** | Performance budget · fixes from using the bridge daily · update behavior measured · policy and docs · open at a line |

### What changed in 1.0

**When an agent opens a document, it opens at the line.** If an agent says "see the conclusion in section 3" and opens the report,
that spot is at the top of the screen — in the preview and the editor, in the side panel too, even when the app was closed.

**Numbers, measured for the first time.** We measured the baseline first and fixed what stood out.

- First index of a 5,000-document folder **132 s → 6 s** · common-word search **86 → 8.5 ms** · agent search 62 → 12 ms.
  The first launch on a morning after 100 overnight changes: 9 s → about 1 s.
- **40% less code** loaded at startup (1,774 → 1,035 KB) — launch is about 40 ms faster (an honest number).
- The measuring tools (`probe:perf` and others) and a budget file now live in the repository, so a regression stops the checks.

**Fixed while using the bridge for real.**

- When an agent tries to read outside your workspace, it is now told **what to do next**. Error messages come in Korean and English.
- An agent may give a wide search scope such as a whole repository; it gets only the workspace documents inside it. A scope written with `/` used to return nothing — fixed.
- **A document briefly vanished from search** while another program was editing it — nearly 900 times in 14,000 searches; now zero.

**Where you were reading.** Opening another document no longer starts it at the previous document's height, and opening the side
panel no longer sends the main panel back to the top.

**Docs.** The Privacy Policy has a new **AI agent connection** section: the app sends nothing, but **what a connected agent reads is
governed by that agent provider's policy**. It also states that the search index and document history keep copies of document text
on your device. The README now explains how to connect an agent (Korean/English).

### Good to know

- **Updating**: while an agent is connected, Windows treats the app as running. If an update is postponed, close the app and your
  agent sessions and reopen them. If the agent is disconnected after an update, reconnect it (`/mcp` in Claude Code).
- The first launch after updating tidies the search index once (0.1 s for 5,000 documents · documents, history and workspace untouched).
- **No new dependencies.** No network port is opened — still 100% offline.

---

## 배포 산출물 / Artifacts
- `README_1.0.0_x64.msix` — Microsoft Store 업로드용(미서명, Microsoft 재서명). 실신원 Name=`SlnU.README.md` · Publisher=`CN=1398342C-A2D7-4B4A-BFE2-34D8CCFD7FBA`.
- `README.md_1.0.0_x64-setup.exe` — NSIS 인스톨러 / NSIS installer.
- `README_1.0.0_x64_portable.zip` — 무설치 포터블 / portable.

## 요구 사항 / Requirements
- Windows 10/11 x64 + WebView2 런타임(Win11 기본 내장) / WebView2 runtime (built into Windows 11).
- 100% 오프라인 · 계정/추적 없음 / 100% offline · no account, no tracking.

라이선스 고지 / License notices: `THIRD-PARTY-NOTICES.md`(0.10.0 대비 런타임 의존성 변경 없음 — 2026-10-12 확인 / no runtime dependency changes since 0.10.0).
