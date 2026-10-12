# README.md v1.1.0

2026-10-13 · 가볍고 100% 오프라인인 마크다운 리더 & 에디터. Windows x64.

**에이전트가 쓴 문서를, 사람이 읽는 자리.** — *Where people read what agents write.*

[한국어](#한국어) · [English](#english)

---

## 한국어

1.0 이 에이전트가 쓴 문서를 **받아 읽는** 고리였다면, 1.1 은 그 반대 방향입니다 — 사람이 읽다가 남긴 표시가 **에이전트에게 가는
지시**가 되고, 흩어진 문서들은 **한 장의 지도**가 됩니다.

> Microsoft Store 에는 0.10.0 다음으로 이 판이 나갑니다. 1.0 에서 바뀐 것(에이전트가 문서를 그 줄로 띄우기 · 큰 워크스페이스 성능 ·
> 검색 누락 수정 · 개인정보 처리방침 에이전트 절)도 함께 들어 있습니다 — [v1.0.0 노트](../v1.0.0/RELEASE_NOTES.md).

### 표시 펜 — 읽다가 칠한 자리가 리뷰가 됩니다

리딩 화면에서 글자를 고르면 펜 트레이가 뜹니다. **형광펜 · 밑줄 · 물결 밑줄 · 취소선 · 동그라미**, 색 다섯. 문단 왼쪽 여백의 ＋ 로
**별표 · 물음표 · 느낌표 · 체크 · 세로줄**. 표시마다 메모를 달 수 있고, 메모는 평소엔 접혀 있다가 표시 위에 머무르면 툴팁으로,
펼치면 오른쪽 레일에 늘어섭니다.

- **표시는 글자를 따라갑니다.** 창 폭 · 확대 · 글꼴 · 테마 · 글 방향 · 나란히 보기를 바꿔도, **에이전트가 문서를 고쳐 써도** 그 글자에
  붙어 있습니다. 위치를 화면 좌표가 아니라 *표시를 단 순간의 판*에 대한 글자 범위로 기억하고, 열 때마다 지금 판으로 옮기기 때문입니다.
- **고쳐졌으면 알려 줍니다.** 칠한 글자를 누가 고쳤으면 **바뀜** — 이전 → 지금을 보여 주고 [해결됨]으로 닫습니다. 지워졌으면
  **위치 잃음**으로 남아 [그 판 보기]로 원래 자리를 봅니다. 지적한 자리를 에이전트가 고쳤는지가 한눈에 보입니다.
- **펜마다 뜻이 있습니다** — 형광펜 = 중요, 물결 = 확인 필요, 취소선 = 빼도 됨 … 범례에서 내 말로 바꿀 수 있습니다.
- **에이전트가 읽습니다** — 브리지의 새 도구 `list_annotations` 가 표시마다 뜻 · 상태 · 줄 · 메모를 줍니다. "물결 친 곳 근거를 보강해 줘"를
  따로 말하지 않아도 됩니다. 에이전트를 연결하지 않았다면 [리뷰 요약 복사]로 같은 내용을 채팅창에 붙여 넣으세요.
- 원본 문서 파일은 바꾸지 않습니다. 내보내기에는 [표시 포함]·[메모 포함]을 켰을 때만 들어갑니다(기본 꺼짐).

### 캔버스 — 문서들의 지도

`.canvas` 파일을 열면 문서 카드를 넓은 판에 늘어놓고 선으로 잇습니다. **옵시디언과 같은 JSON Canvas 형식**이라 파일을 그대로 주고받습니다.

- 카드는 멀리서 보면 **제목만**(크게), 가까이 오면 **목차와 첫 문단**. 더블클릭하면 그 문서로 갑니다(`#제목` 이 있으면 그 자리로).
  카드에서 본문 전체를 그리지는 않습니다 — 지도는 읽으러 가는 길입니다.
- 글 카드 · 링크 카드 · 그룹 · 색 6 · 선 라벨 · 화살표. 카드 가장자리에서 끌어 잇고, 선 끝을 끌어 다른 카드로 옮깁니다.
- **색연필·형광펜으로 카드 사이에 그리고**, 지우개로 지웁니다.
- 워크스페이스 트리에서 문서를 끌어다 놓으면 카드가 됩니다. 원본 파일은 그대로입니다.
- 캔버스도 **검색 · 받은 문서함 · 문서 기록**에 그대로 잡힙니다. 에이전트가 문서 열 편과 함께 그 관계도를 `.canvas` 로 남기면,
  아침에 받은 문서함에서 지도부터 엽니다.
- 옵시디언에서 연 파일을 여기서 고쳐 저장해도, 옵시디언이 모르는 내용은 그대로 남습니다(반대로도).

### 그 밖에

- 에이전트 검색 결과에 **맞은 줄 번호** — 에이전트가 문서를 통째로 읽지 않고 그 절로 바로 갑니다. 하나도 안 맞으면 범위 안 문서 수를 알려 줍니다.
- **고침**: BOM(보이지 않는 표식)이 붙은 문서의 첫 제목이 미리보기와 내보내기에서 `# 제목` 글자 그대로 보이던 것.
- **고침**: 폴더 여럿을 한꺼번에 색인하면 한 폴더가 통째로 검색에서 빠지던 것(GitHub 에만 나간 1.0.0 의 회귀).
- **고침**: 앱을 켤 때 찾아낸 밤사이 변경이 받은 문서함 종에 바로 안 뜨던 것.
- **고침**: 리딩 모드 나란히 보기에서 오른쪽 문서가 150px 높이로만 보이던 것.
- 새 의존성 없음 · 네트워크 포트 없음 — 여전히 100% 오프라인.

---

## English

If 1.0 was the loop for **receiving** what agents write, 1.1 runs the other way — the marks you leave while reading become
**instructions for your agent**, and scattered documents become **one map**.

> On the Microsoft Store this version follows 0.10.0, so it also brings everything from 1.0 (agents opening a document at a line ·
> large-workspace performance · a search gap fixed · the agent section of the Privacy Policy) — see the [v1.0.0 notes](../v1.0.0/RELEASE_NOTES.md).

### Marking pens — what you mark while reading becomes the review

Select text in the reading view and a pen tray appears: **highlighter · underline · wavy underline · strike-through · circle**, five colors.
Use the **+** in the left margin for **star · question mark · exclamation · check · margin bar**. Any mark can carry a note; notes stay folded
and show as a tooltip when you hover, or line up in a rail on the right when expanded.

- **Marks follow the text.** Change the window width, zoom, font, theme, text direction or side-by-side view — or **let an agent rewrite the
  document** — and each mark stays on its words. A mark remembers a text range in *the version you marked*, not screen coordinates, and is
  carried to the current version every time you open it.
- **It tells you when the text changed.** If someone edited what you marked, the mark shows **Changed** — before → now — and you close it with
  [Resolved]. If it was deleted, it is listed as **Lost** and [View that version] shows where it was.
- **Every pen has a meaning** — highlighter = important, wavy = needs checking, strike = can be cut … rename them in the legend.
- **Your agent reads them** — the bridge's new `list_annotations` returns each mark's meaning, state, line and note, so "shore up the wavy
  parts" goes without saying. Not using an agent connection? [Copy review summary] puts the same list on your clipboard for any chat.
- The document file itself is never changed. Exports include marks and notes only when you tick [Include marks] / [Include notes] (off by default).

### Canvas — a map of your documents

Open a `.canvas` file to lay out document cards on a large board and connect them. It uses **JSON Canvas, the same format as Obsidian**, so files move freely between the two.

- From afar a card shows just its **title** (large); come closer for its **outline and first paragraph**. Double-click to go to the document
  (to the heading, if the node has one). Cards never render whole documents — the map is the way in.
- Text cards · link cards · groups · six colors · edge labels and arrows. Drag from a card's edge to connect, drag an edge's end to re-attach it.
- **Draw between cards with a pencil or a marker**, and erase.
- Drag a document from the workspace tree onto the board to add a card. The file itself stays where it is.
- Canvases are covered by **search, the Inbox and Document history** like any document. When an agent leaves a `.canvas` of how its ten new
  reports relate, the morning starts from the map in your Inbox.
- Edit and save a canvas that Obsidian created, and everything Obsidian put there that this app doesn't know is kept (and the other way round).

### Also

- **Line numbers in agent search results** — an agent can jump straight to the section instead of reading the whole file; when nothing matches, it is told how many documents were searched.
- **Fixed**: in documents saved with a BOM (Notepad, PowerShell), the first heading showed as literal `# Title` in the preview and in exports.
- **Fixed**: indexing several folders at once could leave one whole folder out of search (a regression in 1.0.0, which shipped on GitHub only).
- **Fixed**: changes found while the app started up did not reach the Inbox bell right away.
- **Fixed**: in the reading view's side-by-side layout, the right-hand document was only 150 px tall.
- No new dependencies · no network port — still 100% offline.

---

## 배포 산출물 / Artifacts
- `README_1.1.0_x64.msix` — Microsoft Store 업로드용(미서명, Microsoft 재서명). 실신원 Name=`SlnU.README.md` · Publisher=`CN=1398342C-A2D7-4B4A-BFE2-34D8CCFD7FBA`.
- `README.md_1.1.0_x64-setup.exe` — NSIS 인스톨러 / NSIS installer.
- `README_1.1.0_x64_portable.zip` — 무설치 포터블 / portable.

## 요구 사항 / Requirements
- Windows 10/11 x64 + WebView2 런타임(Win11 기본 내장) / WebView2 runtime (built into Windows 11).
- 100% 오프라인 · 계정/추적 없음 / 100% offline · no account, no tracking.

라이선스 고지 / License notices: `THIRD-PARTY-NOTICES.md`(1.0.0 대비 런타임 의존성 변경 없음 — 2026-10-13 확인 / no runtime dependency changes since 1.0.0).
