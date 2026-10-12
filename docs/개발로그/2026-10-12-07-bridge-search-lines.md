# 2026-10-12 (07) [v1.1 B1] 브리지 검색 결과에 줄 번호 + 0건 힌트

브랜치 `develop-bridge-search-lines` · [roadmap-1.1.md](../design/roadmap-1.1.md) B1 · 실사용 기록의 1.1 후보 둘

## 배경

실사용 기록([bridge-dogfood.md](../notes/bridge-dogfood.md))에서 `search_docs` → 문서 통째로 읽기 → 맞은 곳 찾기가
되풀이됐다. 줄 번호가 있으면 `read_section(fromLine)` 으로 바로 간다. 0건일 때는 "없다"만 와서 낱말이 틀린 건지
범위가 빈 건지 가를 수 없었다.

## 변경

- `commands/search.rs` — `match_rows_with_rowid`(rowid 도 돌려준다) · `match_rows` 는 그 위의 얇은 껍질(앱 검색 무변경).
- `mcp/tools.rs`
  - 결과마다 `line`(1부터) — `hit_line`: FTS5 스니펫은 원문을 자른 글이라 "앞 문맥 + 첫 하이라이트"를 색인 내용에서
    찾는다(같은 낱말이 앞에 또 있어도 그 자리). 앞 문맥이 안 맞으면 낱말로만. 내용은 **rowid 로** 읽는다(경로 = UNINDEXED 전체 스캔).
  - 0건이면 `hint` — 범위(스코프 ∩ `root`) 안 색인 문서 수와 다음 수(ko/en). 0개면 "색인된 문서가 없다 — root 를 빼거나
    앱을 한 번 열어 색인".
  - 도구 설명에 `line` 을 `read_section` 의 fromLine 으로 쓰라고 한 줄.
- `docs/design/features/agent-bridge.md` 계약 표·설명 · bridge-dogfood.md 후보 표 ✅.

## 검증

- `cargo test --lib` **93 → 95**(`hit_line_finds_the_first_highlight` · `hits_carry_a_line_and_zero_hits_carry_a_hint` —
  CRLF 내용 · 같은 낱말이 앞에 있는 경우 · 앞 문맥 불일치 · 스코프 밖 문서는 안 셈) · clippy 0.
- **릴리스 exe MCP 실구동 4/4** — 실사용 DB 를 SQLite backup API 로 **읽기 전용 사본**(원본 mtime 그대로) → 임시 `APPDATA`:
  `Store` 18건 전부 `line` · **앞 8건을 `read_section(line, line)` 으로 읽어 그 줄에 낱말이 있음 8/8**(1번 줄 넷이 이상해 보였지만
  실제로 제목 줄이었다) · 0건 `hint` "문서 256개에서…".
- 성능(`perf::perf_index_search_bridge`): 브리지 검색 중앙값 11.6 → 12.0~12.2 ms(예산 안).

## 함정

- **첫 색인이 8.4 s 로 나왔다(기준 6.3 s)** — 색인은 안 건드렸는데. 바뀌기 전 코드로 같은 시각에 다시 재니 7.8 s ·
  픽스처 생성도 8 → 10 s — 기계 상태다(이번 변경과 무관). 기준선 비교는 같은 시각에 두 판을 번갈아.
- `python -I` 는 `PYTHONIOENCODING` 을 무시한다 — cp949 콘솔에서 `—` 출력이 죽는다. 스크립트 안에서 `sys.stdout.reconfigure`.
