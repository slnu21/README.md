# 에이전트 브리지 (MCP)

에이전트가 쓴 문서를 사람이 읽는 자리 — 그 고리를 닫는 쪽. 앱이 **MCP stdio 서버**를 겸해서,
Claude Code 같은 에이전트가 사용자의 워크스페이스를 *이 앱이 아는 방식으로* 들여다볼 수 있다.

결정 근거는 [ADR 0002](../decisions/0002-agent-bridge-mcp.md).

## 새 exe 가 없다

MCP 서버는 별도 프로그램이 아니라 **`md-reader.exe` 의 한 모드**다.

```
md-reader.exe mcp        # 창을 안 띄우고 stdio 로 MCP 를 말한다
md-reader.exe            # 평소처럼 앱
md-reader.exe <파일>     # 그 파일을 연다
```

분기는 `main()` 에서 **`tauri::Builder` 를 세우기 전에** 일어난다(`mcp::is_requested`). 그래야
SQLite 마이그레이션·single-instance 등록 같은 부작용을 하나도 안 탄다 — 에이전트가 붙을 때마다
사용자 앱 상태가 흔들리면 안 된다.

**모드는 서브커맨드로만 정한다.** 별칭 이름(`argv[0]`)으로 가르지 않는다 — 앱을 여는 이름과
서버를 띄우는 이름이 같아야 할 이유가 없고, 이름 기반 분기는 런타임에만 틀리는 종류의 버그다.

exe 를 안 늘리는 이유는 MSIX 다: `<Application>` 하나가 곧 시작 메뉴 항목 하나이고, 숨기면
Store 가 헤드리스 앱이라며 거부한다. → [notes/development.md](../../notes/development.md)

## 연결

```jsonc
// claude_desktop_config.json / .mcp.json
{ "mcpServers": { "readme-md": { "command": "<설치 경로>\\md-reader.exe", "args": ["mcp"] } } }
```

```powershell
claude mcp add --scope user readme-md -- "<설치 경로>\md-reader.exe" mcp
```

> **Store 설치본은 아직 이 방법을 못 쓴다.** 패키지 안의 exe 경로는 잠겨 있고 버전마다 바뀌므로
> App Execution Alias 가 필요하다. 별칭과 설정의 [에이전트 연결] 패널은 다음 작업 단위다.
> 그때까지는 NSIS 설치본·포터블·개발 빌드에서 절대 경로로 연결한다.

## 도구 — 공개 계약

**파일시스템이 이미 하는 일은 주지 않는다.** 에이전트는 이미 md 를 읽고 쓰고 grep 한다. 여기
있는 것은 전부 *이 앱만 아는 것*이다.

| 도구 | 인자 | 돌려주는 것 | 이 앱만 아는 이유 |
|---|---|---|---|
| `search_docs` | `query` · `root?` · `limit?`(기본 20, 최대 50) | `hits[] = {path, name, snippet}` | FTS5 색인 — grep 이 못 하는 bm25 랭킹 |
| `outline` | `path` | `{path, lines, headings[] = {level, text, line}}` | 큰 문서를 통째로 안 읽고 고르게 한다 |
| `read_section` | `path` · `heading?` · `fromLine?` · `toLine?` | `{path, fromLine, toLine, totalLines, truncated, text}` | 섹션 단위 읽기 = 토큰 절약 |
| `list_workspace` | 없음 | `{tree[]}` — `{id, kind, name, path?, children[], childrenFromDisk?}` | **가상 배치**는 디스크에 없다 |

- `heading` 은 정확히 일치 → 없으면 대소문자 무시 부분일치. 섹션은 **같거나 더 높은 레벨의 다음
  헤딩 직전**까지라 하위 절이 함께 온다.
- `line` 은 1-based. 미리보기의 `data-line`·편집기와 같은 기준이다.
- **앵커 `id` 는 주지 않는다.** 미리보기 아웃라인은 markdown-it + anchor 플러그인이 만든 진짜 id 를
  쓰는데(`app/lib/markdown.ts` `extractToc`), Rust 쪽은 소스를 직접 읽는 근사 파서다. 비슷하게 만든
  슬러그는 언젠가 진짜 앵커와 어긋나 *조용히 틀린* 링크가 된다.
- `list_workspace` 는 **가져온 폴더의 하위를 안 준다**(DB 에 없다 — 렌더마다 디스크에서 파생한다).
  그래서 그 노드에 `childrenFromDisk: true` 를 달아 "빈 폴더"로 오해하지 않게 한다.

### 아웃라인 파서의 범위

ATX(`#`)만 본다. **펜스 코드블록 안과 YAML frontmatter 안은 건너뛴다** — 에이전트 산출물에는 셸
예시가 흔해서 `# 주석` 이 헤딩으로 잡히면 아웃라인이 망가진다. setext(`===`/`---`) 헤딩은 다루지
않는다.

## 스코프 — 에이전트가 볼 수 있는 범위

**사용자가 워크스페이스에 넣어 둔 것만.** 모든 경로 인자가 이 판정을 통과해야 한다.

- 가져온 폴더(`imported_folder`)의 실제 경로 **하위 전부**
- 파일 참조(`file_ref`)는 **그 파일만**

전역 검색은 머신 전체 색인을 조회하므로(`search.rs`) 스코프를 안 걸면 사용자의 무관한 문서까지
샌다. 경로 비교는 `search.rs` 의 `under_root`/`rel_under` 를 그대로 쓴다 — 구분자·ASCII 대소문자를
무시하고, **형제 접두어**(`C:\a` 가 `C:\ab` 를 잡는 것)를 막는다.

읽기는 `.md`·`.markdown`·`.mdx`·`.txt` 만, 파일당 4MB 까지. 응답 본문은 60,000자에서 자르고
`truncated: true` 로 알린다.

## 안 하는 것 (설계상)

- **쓰기 도구 없음** — `write_doc`·`create_doc`·`delete`. 에이전트가 이미 fs 로 하는 일이라 값은 0
  이고 프롬프트 인젝션 표면만 는다. 되돌리기(저장 스냅샷)가 생기기 전에는 열지 않는다.
- **제어 도구 없음** — `place_doc`(워크스페이스에 배치)·`open_in_app`(앱에 띄우기)은 설정의
  [에이전트 연결] 패널이 생긴 뒤에 연다. 사용자가 상태를 보고 끌 수 없는 원격 제어는 열지 않는다.
- **resources·prompts 없음** — `tools` 능력만 선언하고 나머지는 `-32601` 로 답한다.
- **사람이 쓰는 CLI 없음** — 릴리스 빌드는 windows-subsystem 이라 터미널에 출력이 안 보인다
  (`AttachConsole(ATTACH_PARENT_PROCESS)` 가 필요하다). 파이프로 붙는 MCP 경로에는 무관하다.

## 구현 메모

- **stdout 은 프로토콜 전용이다.** 진단 한 줄이라도 섞이면 클라이언트의 JSON 파서가 깨진다.
- **선행 BOM 을 흘려보낸다.** JSON 이 아니지만(RFC 8259) 스트림 앞머리에 실제로 붙어 온다 —
  .NET 의 `Process.StandardInput` 이 첫 쓰기에 인코딩 프리앰블을 흘린다(실측: **첫 줄만** 깨졌다).
  안 걷어내면 `initialize` 한 줄이 깨져 연결 자체가 성립하지 않는다.
- **도구 실패는 JSON-RPC 오류가 아니다** — `isError: true` 를 단 결과로 돌려준다(스펙 권고).
  모델이 읽고 스스로 고칠 수 있어야 한다. 프로토콜 오류(`-32601` 등)는 메서드 수준에만 쓴다.
- **DB 는 앱과 같은 파일이다.** `%APPDATA%\com.readme.app\md-reader.db` 를 그대로 연다 — 패키지
  신원이 있으면 OS 가 컨테이너로 돌려주고, 없으면 그게 실제 경로다. **마이그레이션은 하지 않는다**
  (스키마의 주인은 앱이다). DB 가 없으면 도구가 "앱을 한 번 실행하세요"로 답한다.
- **SDK 크레이트를 안 썼다** — 실제로 다루는 것은 `initialize`·`tools/list`·`tools/call`·알림 무시가
  전부다. 의존성 트리와 THIRD-PARTY-NOTICES 가 커지고 판올림마다 흔들린다. `serde_json` 은 이미 있다.

## 검증

- 단위 테스트 38종(`cargo test --lib`) — JSON-RPC 프레이밍·프로토콜 협상·아웃라인 파서·스코프 판정·
  도구 목록이 읽기 전용인지.
- **릴리스 exe 실구동 11항목** — MCP 클라이언트처럼 파이프로 띄워 `initialize` → `tools/list` →
  `tools/call` 을 실제로 주고받는다. 사용자 DB 는 임시 `APPDATA` 에 **사본**을 두고 원본을 안 건드린다
  (자식 프로세스의 `APPDATA` 만 바꾸면 된다).
