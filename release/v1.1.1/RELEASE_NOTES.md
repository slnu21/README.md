# README.md v1.1.1

2026-11-13 · 가볍고 100% 오프라인인 마크다운 리더 & 에디터. Windows x64.

[한국어](#한국어) · [English](#english)

---

## 한국어

1.1 에서 나온 **표시 펜**의 실사용 후속판입니다. 세 가지 피드백을 반영했습니다.

### 표시 펜 사용 모드 — 켜기 · 보기만 · 끄기

글을 드래그할 때마다 펜 트레이가 떠서 그냥 복사하려던 것까지 방해된다는 피드백이 있었습니다. 설정에 **[표시 펜]** 을 두었습니다.

| 모드 | 드래그하면 펜 | 여백 ＋ | 단 표시·메모 | 표시 고치기·지우기 |
|---|---|---|---|---|
| **켜기**(기본) | 뜸 | 있음 | 보임 | 됨 |
| **보기만** | 안 뜸 | 없음 | 보임 | 됨 |
| **끄기** | 안 뜸 | 없음 | 숨김 | — |

- 끄기는 **숨기기만** 합니다. 저장된 표시와 메모는 지우지 않으므로 다시 켜면 그대로 돌아옵니다. 에이전트의 `list_annotations` 와 [표시 포함] 내보내기도 그대로입니다.

### 넓은 화면에서도 메모 레일이 "좁다"며 안 펼쳐지던 것

- 메모를 펼치면 본문 오른쪽에 레일이 생기는데, 지금까지는 **본문 폭을 그대로 둔 채** 남는 폭에 레일이 들어갈 때만 펼쳤습니다.
- 그래서 리딩 폭 **[넓게]** 는 본문이 화면 전체라 **어떤 창에서도** 안 펼쳐졌고, **[보통]** 도 약 1,210px 가 필요해 배율이 높은 화면 · 사이드바 · 나란히 보기에서는 툴팁으로 돌아갔습니다.
- 이제 **본문을 조금 좁혀서** 레일 자리를 만듭니다. 본문이 480px 보다 좁아져야 할 만큼 창이 작을 때만 툴팁으로 보여 줍니다.

### 메모 툴팁이 잘 안 뜨던 것

- 메모가 달린 표시에 마우스를 올리고 잠깐(0.45초) 머무르면 툴팁이 뜨는데, **마우스가 1px 만 움직여도 기다림이 처음부터 다시 시작**됐습니다. 사람 손은 완전히 멈추지 않으니 사실상 잘 안 떴습니다.
- 이제 **같은 표시 위에서는 움직여도 그대로 뜹니다.** 툴팁 쪽으로 마우스를 옮기는 동안(0.4초)에는 닫히지 않고, 표시를 알아보는 범위도 줄 위아래로 조금 넓혔습니다(밑줄·물결은 글자 아래에 그려지므로).

## English

A follow-up to the **marking pens** introduced in 1.1, based on three pieces of feedback.

### Pen modes — On · View only · Off

Selecting text always popped up the pen tray, even when you just wanted to copy. Settings now has **Marking pens**:

| Mode | Pens on selection | Margin + | Marks & notes | Edit/delete marks |
|---|---|---|---|---|
| **On** (default) | yes | yes | shown | yes |
| **View only** | no | no | shown | yes |
| **Off** | no | no | hidden | — |

- Off only **hides**. Saved marks and notes are kept and come back when you turn the pens on again; the agent's `list_annotations` and the *Include marks* export are unaffected.

### Notes rail said "the window is narrow" on wide screens

- The rail only opened when it fit beside the text column **at its current width**. With the **Wide** reading width the column filled the whole window, so it never opened; with **Normal** it needed about 1,210 px, so high display scaling, the sidebar or side-by-side reading pushed it back to tooltips.
- The text column now **narrows to make room**. Notes fall back to tooltips only when the column would have to go below 480 px.

### Note tooltips were hard to open

- Hovering a mark shows its note after a short pause (0.45 s), but **every 1 px of mouse movement restarted the wait** — and hands are never perfectly still.
- Movement over the same mark no longer restarts it, the tooltip stays open for 0.4 s while you move onto it, and the hover area around each line is a little taller (underlines and waves sit below the text).

## 배포 산출물 / Artifacts
- `README_1.1.1_x64.msix` — **Microsoft Store 업로드용**(미서명, Microsoft 재서명). 실신원(Name=`SlnU.README.md` · Publisher=`CN=1398342C-A2D7-4B4A-BFE2-34D8CCFD7FBA`).
- `README.md_1.1.1_x64-setup.exe` — NSIS 인스톨러.
- `README_1.1.1_x64_portable.zip` — 무설치 포터블.

## 요구 사항 / Requirements
- Windows 10/11 x64 + WebView2 런타임(Win11 기본 내장).
- 100% 오프라인 · 계정/추적 없음. 런타임 의존성은 1.1.0 과 같습니다 — 라이선스 고지 `THIRD-PARTY-NOTICES.md` 그대로.
