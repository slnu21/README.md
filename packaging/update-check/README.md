# 브리지가 떠 있는 채로 업데이트 — 출하 전 실측

에이전트 클라이언트(Claude Code 등)가 켜져 있는 동안 `readme-md mcp` 프로세스는 계속 산다. 그 상태로 판이 바뀌면
무슨 일이 나는지 출하 전에 잰다(roadmap-1.0 U6). **스키마 판이 바뀌는 릴리스마다** 다시 돌린다.

결과와 해석: [docs/design/features/agent-bridge.md](../../docs/design/features/agent-bridge.md) "업데이트" 절.

## 무엇을 재나

| 스크립트 | 재는 것 |
|---|---|
| `update-run.mjs <default\|defer\|force>` | 임시 신원 MSIX 두 판을 `Add-AppxPackage` 로 올린다. 브리지가 붙은 채 ① 업데이트가 실패·지연·강제 종료 중 무엇인지 ② 그 뒤 옛 브리지가 사는지·도구가 되는지 ③ 새 앱 첫 실행의 판올림 ④ 다시 붙인 브리지가 새 판인지 |
| `coexist.mjs --v3 <exe> --v4 <exe>` | 패키지 밖(포터블·NSIS)에서 **옛 브리지와 새 앱이 한 DB 를 같이 쓰는** 경우. 옛 브리지가 쉬지 않고 검색하는 동안 새 앱이 판올림하고, 파일 30개를 다섯 번 고쳐 감시기 재색인과 겹친다. 검색이 한 번이라도 30건이 아니면 센다 |
| `pack-temp.ps1` | 위에서 쓰는 임시 신원 MSIX 를 만든다 |

## 실사용 데이터에 닿지 않게

- **식별자를 바꿔 빌드한다** — 앱(`tauri.conf.json` `identifier`)과 브리지(`app_paths.rs` `APP_IDENTIFIER`)가 같은
  `com.readme.updtest` 를 보게. 그러면 데이터는 `%APPDATA%\com.readme.updtest`(비패키지) 또는 임시 패키지의
  컨테이너로만 간다. `userdata.ps1` 로 비켜 놓을 필요가 없다 — 그래서 **다른 세션의 브리지가 실사용 DB 를 잡고
  있어도 돌릴 수 있다.**
  - 실사용 폴더가 이미 있는 기계에서 **식별자를 그대로 두고 패키지만 임시로** 하면 위험하다: MSIX 쓰기 가상화는
    이미 있는 폴더에는 그대로 통과시킨다(app_paths.rs 주석) — 임시 패키지가 실사용 DB 를 판올림한다.
- **패키지 이름·별칭은 임시값** — `SlnU.README.md.UpdTest` · `readme-md-updtest.exe`. 실명으로 올리면 Store 설치본과
  `readme-md` 별칭을 덮어쓴다. `pack-temp.ps1` 이 실명이 새면 멈춘다.
- 끝나면: `Get-AppxPackage SlnU.README.md.UpdTest | Remove-AppxPackage` · `%APPDATA%`·`%LOCALAPPDATA%` 의
  `com.readme.updtest` 삭제.

## 돌리는 법

```powershell
# 1) 두 판을 임시 식별자로 빌드(각각 detached worktree 에서, 두 파일만 바꿔서 — 커밋하지 않는다)
#    src/src-tauri/tauri.conf.json   "identifier": "com.readme.updtest"
#    src/src-tauri/src/app_paths.rs  APP_IDENTIFIER = "com.readme.updtest"
#    cd src; $env:CARGO_TARGET_DIR="D:/build/md-reader-upd3"; npx tauri build --no-bundle   (옛 판 태그)
#    cd src; $env:CARGO_TARGET_DIR="D:/build/md-reader-upd4"; npx tauri build --no-bundle   (새 판)
# 2) 패키징 — 인증서는 Cert:\CurrentUser\My 에 있고 LocalMachine\TrustedPeople 에서 신뢰되는 것
$W = "$env:TEMP\md-reader-update-check"; New-Item -ItemType Directory -Force $W | Out-Null
.\pack-temp.ps1 -Exe D:\build\md-reader-upd3\release\md-reader.exe -Version 0.10.0.0 -Out $W\v3.msix -Thumbprint <thumb>
.\pack-temp.ps1 -Exe D:\build\md-reader-upd4\release\md-reader.exe -Version 1.0.0.0  -Out $W\v4.msix -Thumbprint <thumb>
# 3) 세 방식 + 공존
node update-run.mjs default; node update-run.mjs defer; node update-run.mjs force
node coexist.mjs --v3 D:/build/md-reader-upd3/release/md-reader.exe --v4 D:/build/md-reader-upd4/release/md-reader.exe
```

## 함정(겪은 것)

- **앱은 `taskkill`(강제 아님)로 안 닫힌다.** 옛 앱이 살아 있으면 새 앱은 single-instance 로 넘겨지고 **종료 코드 0** 으로
  곧장 끝난다 — DB 는 옛 판 그대로인데 이어지는 검사가 옛 앱 페이지를 상대로 전부 통과한다. "새 앱이 3ms 만에
  끝났다"는 숫자로 잡았다. 그래서 `coexist.mjs` 는 새 앱이 살아 있지 않으면 측정을 무효로 멈춘다.
- **PowerShell 명령 문자열에 경로를 넣지 말 것** — JS 문자열의 `'D:\build…'` 에서 `\b` 는 백스페이스다. 필터가
  아무것도 안 잡아 위 증상을 만들었다. 경로는 환경변수로 넘긴다.
- 첫 실행은 페이지가 한 번 다시 로드돼 CDP 평가 문맥이 사라질 수 있다 — 값이 올 때까지 다시 부른다.
- `sed` 의 BRE 에서 `\|` 는 "또는"이다 — 스크립트를 sed 로 고치다 따옴표가 줄줄이 바뀌었다.
