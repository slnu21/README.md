# 2026-10-11 (04) [v1.0 U2] README — 사용자 안내(ko/en) + 에이전트 연결 절

브랜치 `develop-readme-agent` · WBS #921(U2 진행 중 — 실사용 1주는 계속)

## 배경

U2 의 할 일 하나가 "사용자용 연결 안내". 지금까지 연결법은 설계 문서(`features/agent-bridge.md`)와 앱 안 패널에만 있었고,
GitHub 첫 화면인 루트 README 는 **한국어 개발자 안내뿐**이었다(무엇을 하는 앱인지·설치·브리지 언급 0).

## 변경

- `README.md` 재구성 — 머리에 태그라인 ko/en, 그 아래 **한국어 / English 사용자 절**(무엇을 하나 · 설치 · AI 에이전트 연결),
  맨 아래 기존 **개발 / Development** 절(폴더 구조·스택·개발 시작)과 라이선스.
- 에이전트 연결 절(ko/en 같은 내용):
  - Claude Code 한 줄 `claude mcp add --scope user readme-md -- readme-md mcp` + 확인 방법(`claude mcp list` 의 **실제 출력**
    `readme-md: readme-md mcp - ✔ Connected` 를 그대로 — 처음 쓴 `... ✓ Connected` 는 지어낸 모양이라 실측으로 바꿨다).
  - 설정 파일형(Claude Desktop 등) `mcpServers` JSON 한 줄.
  - `readme-md` = Store 설치본의 앱 실행 별칭, 별칭 없는 설치(GitHub 설치본)는 전체 경로 → **설정 > [에이전트 연결]이 지금
    설치에 맞는 명령을 복사해 준다**(패널 `bridgeCommand` 와 같은 규칙).
  - 할 수 있는 것(읽기 도구 넷) · 고치기·지우기 도구 없음 · 워크스페이스 스코프 · 제어 도구 기본 꺼짐.
  - stdio·포트 없음 + **연결한 에이전트가 읽어 간 내용은 그 에이전트가 처리** — 방침 4절과 같은 문장으로 맞췄다.
  - 끊기 `claude mcp remove --scope user readme-md`(`--scope` 플래그 존재를 `--help` 로 확인).
- `features/agent-bridge.md` 연결 절 — Store 별칭 형태의 `claude mcp add` 한 줄 추가(절대 경로 예만 있었다).

## 결정

- **README 하나에 ko/en 을 나란히**(README.ko.md 분리 안 함) — 저장소 첫 화면이 곧 두 언어 사용자의 입구다.
- Store 링크는 넣지 않았다 — 저장소 안에 Store URL·제품 ID 기록이 없다. "Store 에서 README.md 검색" + GitHub 릴리스 링크로.
  리스팅 작업(U4) 때 실제 URL 을 확인하면 넣는다.
- Claude Desktop 은 **실제로 붙여 보지는 않았다** — 설정 모양은 패널 `bridgeJson` 과 같고 Claude Code(같은 별칭) 연결은 실측.

## 검증

- 링크 대상 8개 전부 추적 파일(`git ls-files`) — GitHub 에서 깨지지 않는다. 앵커 `#개발--development` 는 GitHub 슬러그 규칙.
- 코드 무변경(문서만) — 빌드·테스트 영향 없음.
