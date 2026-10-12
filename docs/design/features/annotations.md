# 표시 펜 (형광펜 · 색연필 · 메모)

결정과 근거는 [ADR 0003](../decisions/0003-annotation-pens.md), 동작 시안은 [mockups/annotation-pens.html](../../mockups/annotation-pens.html).
여기는 **구현이 실제로 어떻게 생겼는지**와 지켜야 할 불변식이다.

## 한 줄

표시는 좌표가 아니라 **스냅샷 원문의 글자 범위**다. 다는 순간 지금 판을 고정하고, 열 때마다 그 판 ↔ 지금 판을 diff 해
옮긴다. 그래서 폭·줌·글꼴·테마·글 방향·분할이 바뀌어도, 에이전트가 문서를 고쳐 써도 표시는 그 글자를 따라가고, 칠한
글자가 고쳐졌으면 **바뀜**으로 드러난다.

## 흐름

```
고르기(미리보기 Selection) ─ DocIndex.selectionToSource ─▶ 소스 범위(지금 판)
   └ 펜 트레이 ─ annot_add ─▶ Rust: pin(지금 판 고정) · 검사(범위의 글 = quote) · 넣기 · 정리   [한 트랜잭션]

열기 ─ annot_list ─▶ 표시 + 바탕 판 원문
   └ resolveAll(판마다 Relocator 하나) ─▶ 상태 넷 · 지금 범위 · 메모 번호
       └ DocIndex.rangeRects(블록 글자 지도 → DOM Range → getClientRects) ─▶ 줄 상자
           └ drawMark ─▶ iframe .md 안 SVG 두 층(글자 밑 / 위)
```

| 자리 | 파일 | 무엇 |
|---|---|---|
| diff | `app/lib/annot/diff.ts` | 줄 Myers → 바뀐 덩어리 안 낱말 diff |
| 옮기기 | `relocate.ts` · `resolve.ts` | 상태 넷(그대로·옮겨짐·바뀜·사라짐) · 요약 · 메모 번호 |
| 글자 지도 | `sourceMap.ts` · `dom.ts` | 보이는 소스 글자 ↔ 렌더 글자 정렬 · 블록 색인(`data-line`·`data-line-end`) |
| 그리기 | `draw.ts` · `palette.ts` | 도형(시안 그대로) · 색 `--mark-<color>-ink|lead` |
| 저장 | `api.ts` ↔ `commands/annot.rs` · `history.rs` | 판 고정 · 정리 예외 · 값 좁히기(마이그레이션 v5) |
| 화면 | `shell/AnnotLayer.tsx` | 트레이 · 여백 ＋ · 툴팁 · 레일 · 요약 알약 · 범례(뜻 고치기) |

## 지킬 것

- **위치를 계산하는 글은 iframe 에 지금 그려진 글이다**(`Preview` 의 `loadedContent`) — 편집 버퍼가 아니다. 버퍼로 계산하면
  새 렌더가 오기 전(디바운스·워커) 옛 DOM 위에 새 글의 위치를 그려 표시가 튄다. `probe:annot` 의 "수정 뒤"가 처음에 이것으로 FAIL 했다.
- **글자 위치 단위는 UTF-16 · BOM 없음 · LF**(`canonicalText` / Rust `canonical`). 편집기·미리보기가 보는 글과 같다.
- **필터 영역은 표시 하나의 상자** — 층 전체에 걸면 다시 칠하기가 카드 크기에 비례한다(957px 카드에서 16.7 → 33.3ms/프레임).
  `probe:annot` 이 질감 켬/끔 프레임 간격을 비교해 한 프레임 넘게 느리면 FAIL.
- iframe 에 넣는 마크업은 **숫자 · 열거값 · `var()`** 뿐이다. 인용·메모 글은 부모 문서(React)에만 있다. id 는 Rust 가 영숫자·`-` 로 좁히고
  `drawMark` 가 한 번 더 거른다.
- 레일 자리는 **비키기 전 폭으로** 잰다 — 카드를 왼쪽으로 비키면 그만큼 좁아져 언제나 "들어간다"고 나온다.
- 범위 펜은 코드 블록·mermaid·수식 블록 안에서 안 된다(`rangeable`) — 여백 ＋ 의 점 표시만.
- 저장 안 한 편집이 있으면 새 표시를 막는다(고치기·메모는 된다).

## 한계 (알고 두는 것)

- 여백 표시는 언제나 왼쪽 — RTL 문서에서도(카드 안 글자 위 표시는 RTL 에서도 맞다, `probe:annot`).
- 이름 바꾸기·이동에 표시가 따라가지 않는다(`real_path` 기준 — 기록과 같은 한계).
- 편집기(소스) 쪽 표시 · 프레젠테이션 모드 표시 · 메모 검색은 없다.
- diff 는 최소 편집이라 **같은 거리의 다른 짝**을 고를 수 있다. 실측으로 하나 찾아 막았다(문단을 끼우고 바로 아래 문단을
  고치면 빈 줄 짝이 옛 문단을 끼운 문단과 맺었다 → 덩어리 사이 빈 줄 eq 를 덩어리로 합침). 비슷한 모양이 더 있을 수 있다 —
  찾으면 `relocate.test.ts` 에 실제 문서로 박는다(짧은 문단으로는 재현이 안 됐다).

## 검사

- `npm test` — `app/lib/annot/*.test.ts`(diff · 옮기기 · 인용 · 글자 지도(진짜 렌더러) · 색 대비 · 도형 · resolve).
- `cargo test --lib` — `commands::annot`(판 고정 · 정리 예외 · 외래 키 · 값 좁히기).
- **`npm run probe:annot`** — 진짜 앱 셸에서 사람처럼 골라 펜 트레이로 단다. 처음 · 리딩 폭 · 창 폭 · 줌 · 다크 · RTL · 질감 끔 ·
  에이전트식 수정 뒤 — 표시 SVG 상자가 그 글자의 Range 상자와 겹치는지. 툴팁(450ms) · 레일(넓으면 펼침 · 900px 이면 툴팁) ·
  저장 안 한 편집 막기 · 비용(표시 60+ · 다시 칠하기). 저장소는 메모리(같은 quote 검사를 한다). `-- --shot out.png` 로 캡처.
