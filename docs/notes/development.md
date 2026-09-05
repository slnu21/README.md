# 개발 노트 · 주의사항

## 사전 요건
- **Node.js + npm** (확인됨: Node 24, npm 11).
- **Rust 툴체인** — *설치 완료*(`cargo check`/`tauri dev/build` 동작).
  - (재설치 시) <https://www.rust-lang.org/tools/install> 의 `rustup`(Windows: `rustup-init.exe`) + Visual Studio C++ Build Tools(MSVC).
  - 전체 사전 요건: <https://tauri.app/start/prerequisites/>

## 실행
```
cd src
npm install        # 최초 1회
npm run tauri dev  # 데스크톱 창 실행 (Rust 필요)
```
- 타입체크: `cd src && npx tsc --noEmit`
- 단위 테스트: `cd src && npm test` (vitest, **node 환경 — DOM 없음**) · Rust `cd src/src-tauri && cargo test --lib`
- 렌더 프로브: `npm run probe:mermaid` — 미리보기 **문서 안**(라벨↔도형, 정화, 동시 렌더).
- 레이아웃 프로브: `npm run probe:layout` — **앱 셸**(편집/리딩/리딩분할 3배치의 패널 폭·넘침·
  전환 후 미리보기 iframe 보존). 두 프로브는 보는 곳이 겹치지 않는다 — mermaid 프로브는 자기
  iframe 을 직접 만들어 앱 셸을 아예 로드하지 않으므로 패널 기하는 그쪽으로 안 잡힌다.
  둘 다 앱을 띄우지 않아 사용자 DB·WebView2 프로필을 건드리지 않는다.
- 빌드: `cd src && npm run tauri build` → 산출물은 `src/src-tauri/target/release/bundle/...`

## 구조 메모
- 프론트 소스는 Tauri 기본 `src/`가 아니라 **`app/`** 로 배치(최상위 `src` 폴더와의 `src/src` 혼동 방지). `index.html`·`tsconfig.json`이 `app/`를 참조.
- 실제 파일 I/O는 **Rust 커맨드(`commands/fs_ops`)** 로 수행(풀 접근). 프론트는 `app/lib/tauri.ts` 래퍼 사용.

## 의존성 단계화
- 현재 설치: zustand, i18next/react-i18next, markdown-it(+types), dompurify, @tauri-apps/plugin-dialog.
- **구현 단계에서 추가**: CodeMirror 6(`@codemirror/*`), highlight.js, katex, mermaid(지연), pdfjs-dist(지연), markdown-it 플러그인 세트.
- Rust: rusqlite(SQLite/FTS5), notify(파일 감시)는 구현 단계에서 `Cargo.toml` 주석 해제.

## 보안 / CSP
- `src/src-tauri/tauri.conf.json`의 `app.security.csp`에 **하드닝 CSP 적용됨**: `default-src 'self'`, 원격 `http(s)` 차단, `img-src 'self' data: asset:`, `style-src 'unsafe-inline'`(테마·렌더 인라인 스타일), `script-src 'self'`(인라인 스크립트 불가), `worker-src 'self' blob:`. `assetProtocol` scope `**`로 로컬 이미지 미리보기 허용.
- 내보내기 자기완결 HTML은 이미지/폰트를 **data URI로 임베드**한다(asset URL은 `connect-src 'self'`상 fetch 불가 → 이미지는 Rust `read_file_base64`, 폰트는 same-origin fetch). CSP 변경 시 미리보기 렌더·이미지·검색·내보내기를 재확인할 것.

## IPC 권한(ACL)은 빌드로 안 잡힌다
- Tauri capability(`src-tauri/capabilities/default.json`)에 없는 커맨드는 **런타임에 거부**된다. `tsc`·vitest·`cargo`·프로브 어느 것도 못 잡는다 — 프런트는 그냥 reject 되는 Promise를 받을 뿐이다.
- 그래서 **`.catch(() => {})` 를 쓰지 않는다.** v0.6.8의 외부 링크 열기가 두 릴리스 동안 죽어 있던 이유가 정확히 이것이다(`open_path`가 ACL에 거부 → 빈 catch가 삼킴 → 화면·콘솔 어디에도 흔적 없음).
- 확인은 **실행 중인 앱에 CDP로 붙어 직접 invoke** 하는 수밖에 없다:
  ```js
  __TAURI_INTERNALS__.invoke('plugin:opener|open_url', { url: 'https://example.com' })
  ```
  거부되면 `Command ... not allowed by ACL` 이 그대로 온다. 고치기 전에 먼저 이걸 눈으로 본다.
- 앱 자신의 커맨드(`#[tauri::command]`)는 ACL 대상이 아니다. 넓은 플러그인 스코프를 여는 대신 **우리 커맨드에서 검사**하는 쪽을 택한다(`commands/shell_open.rs`).
- **IPC 는 JS 에서 가로챌 수 없다** — `window.__TAURI_INTERNALS__` 의 `invoke`·`ipc` 는 둘 다
  `writable:false, configurable:false` 다(실측). 감싸는 대입은 sloppy 모드라 **조용히 실패**하고,
  같은 객체에 `__orig` 같은 표식만 남아 "스파이가 걸렸다"고 착각하게 만든다. v0.7.1 실검증에서
  실제로 한 번 속았다 — 스파이가 죽은 채로 "호출 안 됨"으로 읽혀 6항목이 거짓 FAIL 이 났고,
  그동안 클릭은 전부 진짜로 브라우저·탐색기를 띄우고 있었다.
- 그래서 실검증은 **결과를 본다**: 외부 링크는 브라우저 프로세스가 새로 뜨는지, 탐색기에서 위치는
  `Shell.Application.Windows()` 에 그 폴더 창이 생기는지. 탐색기는 **같은 폴더 창이 이미 있으면
  재사용**하므로 케이스마다 먼저 닫고 봐야 한다.

## MSIX 는 `%APPDATA%` 쓰기를 컨테이너로 돌린다 — 앱과 탐색기가 다른 곳을 본다
- 패키지 앱의 `%APPDATA%` 쓰기는 `%LOCALAPPDATA%\Packages\<PFN>\LocalCache\Roaming\` 로
  리다이렉트된다(copy-on-write). `app_data_dir()` 이 주는 경로는 **앱 안에서만 유효한 가상
  경로**가 되고, 컨테이너 **밖**인 탐색기는 그 경로를 못 찾는다.
- v0.8.0 [테마 폴더 열기]가 "폴더가 없다"로 죽던 정체가 이것이다. 신고된 증상 셋이 서명이다:
  **저장 대화상자**(앱 프로세스 안 = 병합 뷰)로 들어가면 폴더가 **보이고**, 탐색기로 가면
  **없고**, 그게 반복된다.
- **그냥은 개발기에서 재현되지 않는다.** NSIS/dev 설치가 실제 `%APPDATA%\com.readme.app` 를
  먼저 만들어 두면 쓰기가 그리로 통과한다. 실측으로 두 머신이 갈렸다 — 개발기는 실제 AppData,
  Store 전용 머신은 컨테이너. 그래서 "패키지본이면 무조건 컨테이너"도 "언제나 `%APPDATA%`"도
  둘 다 틀리다.
- **가르는 것은 폴더가 이미 있느냐다**(패키지 컨텍스트 안에서 직접 재 봤다):
  이미 있는 폴더 **안에 파일**을 쓰면 실제 AppData 로 통과하고, **새 폴더를 만들면** 컨테이너로
  간다. copy-on-write 다.
- **그래서 개발기에서도 재현할 수 있다** — 실제 `com.readme.app` 를 잠시 비켜 놓고
  (`video/capture/userdata.ps1`), 빌드한 exe 를 **설치된 패키지의 신원으로** 띄운다:
  ```powershell
  Invoke-CommandInDesktopPackage -PackageFamilyName 'SlnU.README.md_<hash>' -AppId 'Gyeol' `
    -Command 'cmd.exe' -PreventBreakaway `
    -Args '/c set "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222" && start "" "<exe>"'
  ```
  **`-PreventBreakaway` 가 없으면 자식 프로세스가 패키지 컨텍스트를 벗어난다** — 첫 시도가
  조용히 비패키지본으로 돌아 "수정이 안 먹는다"는 거짓 FAIL 을 냈다(경로가 `%APPDATA%` 로
  나왔다). 데이터가 **어디에 생기는지**를 함께 보지 않으면 못 잡는다. cmd 를 한 겹 두는 것은
  `Invoke-CommandInDesktopPackage` 가 호출자의 환경 변수를 물려주지 않아 CDP 포트를 그 안에서
  켜야 하기 때문이다.
- `app_paths::user_data_dir` 은 **만들어 보고 어디에 생겼는지 본다** — 이미 하던
  `create_dir_all` 이 곧 probe 다(따로 probe 파일을 남기지 않는다). 패키지 신원은 kernel32
  `GetCurrentPackageFamilyName` 을 직접 선언해 읽는다(새 의존성 0).
- **파일은 옮기지 않는다.** 가상 경로가 가리키는 물리 파일이 곧 컨테이너 안의 그 파일이다.
  하는 일은 같은 파일을 탐색기도 해석할 수 있는 이름으로 부르는 것뿐이다.
- 매니페스트의 `desktop6:FileSystemWriteVirtualization` 로 끄는 길도 있으나 **안 쓴다** —
  이미 컨테이너에 데이터(워크스페이스 DB 포함)가 쌓인 사용자가 그것을 통째로 잃은 것처럼
  보게 된다. 이관 없이는 못 한다.

## mermaid는 못 살리는 태그를 **지우지 않고 글자로 그린다**
- `htmlLabels:false`(v0.6.9) 이후 라벨은 SVG `<text>`다. 그 경로에 HTML 해석기가 없어서, mermaid는 라벨 안의 `<b>`·`<span>` 같은 태그를 **한 단어로 취급해 그대로 그린다**(`markdownToLines`의 html 토큰 분기). 태그가 사라지는 게 아니라 **글자로 찍힌다** — 그래서 "지원 안 하니 무시되겠지"가 아니라 반드시 우리가 먼저 걷어내야 한다(`lib/mermaidText.ts`).
- 상류의 `<br>` 처리는 **한 겹이 아니다.** `createText`는 `/<br\s*\/?>/`(대소문자 구분·속성 없음)만 정규화하고, timeline은 자기 정규식으로 **bare `<br>`만** 자른다. 그래서 `<BR>`·`<br class="x">`·`<br/>`이 다이어그램 종류마다 다르게 샜다. 한 형태로 통일해 넘기는 것이 유일하게 안정적인 방법이다.
- **`tsc`·vitest로는 안 잡힌다.** 라벨이 글자로 찍히는지는 렌더 결과를 봐야 안다 → `npm run probe:mermaid`의 `[x]` 검사(갤러리 19번 픽스처). 고치기 전에 정규화를 잠깐 끄고 **FAIL 26건을 눈으로 본 뒤** 되돌렸다.
- 소스를 고칠 때 **mermaid 문법을 밟지 않도록** 낱말 경계를 쓴다. `<<interface>>`의 `i`/`ins`, 화살표 `<|--`·`<--`가 후보다 — 단위 테스트에 그대로 박아 뒀다.

## 사용자 색 값은 hex·열거값으로만 받는다

테마 값은 `buildDoc` 이 `<style>:root{...}</style>` 에 **문자열로 이어 붙인다**. 사용자 테마 파일이
생기면 그 값의 출처가 파일이 된다 — 값에 `;` 와 `}` 를 넣으면 선언 블록을 벗어난다(CSS 커스텀 속성
값은 최상위 `;` 에서 끝난다). 샌드박스에 스크립트가 없어 RCE 는 아니고 자기 파일이라 보안 경계도
아니지만, **값을 6자리 hex 와 열거값으로 좁히면 그 경로가 구조적으로 사라진다.**

- 거르는 곳이 **둘**이다: 파서(`themes/custom.ts`)와 직렬화 직전(`renderDoc.ts themeVarsCss`).
  한 쪽만 놓치면 다른 경로(캐시·미래의 입력원)로 새다.
- 같은 이유로 질감·그림자는 CSS 문자열이 아니라 열거값이다(`texture`·`elevation` → 사전 정의 상수).
- 5토큰은 mermaid 로도 흘러간다. khroma 는 `color-mix()`·`var()` 를 못 먹어 렌더가 통째로 터진다
  (`lib/mermaid.test.ts` 가 모든 테마에 hex 정규식을 강제한다).

## `setProperty` 는 속성을 지우지 않는다

`applyTheme` 은 `:root` 에 **누적**한다. 질감이 있는 테마에서만 `--paper-texture` 를 쓰고 다른 테마에서
생략하면, 한지 → 라이트로 바꿔도 발무늬이 영원히 남는다. **분기마다 반드시 대입한다** —
`--shadow` 가 원래 그렇게 돼 있었고, `--paper-texture`·`--prose-card-shadow` 도 같은 규칙을 따른다.

미리보기 문서는 매번 새로 만들어져 이 문제가 없다 — 그래도 같은 규칙을 쓴다(한 자리에서 보이게).

## 토스트 슬롯은 하나다 — 경고가 성공을 이긴다

사용자 테마 다시 불러오기를 만들 때 "N개 불러왔습니다" 를 무조건 띄워, 바로 앞에 뜼던
"12번째 줄이 잘못됐습니다" 를 덮어버렸다. **실구동 검증에서만 보였다** — 단위 테스트는 둘을
따로 보고 있었기 때문이다. 로더가 경고 목록을 돌려주고, 호출부는 **경고가 없을 때만** 성공을
알리도록 고쳤다.

## 경고 문구는 파서가 아니라 표시 계층이 만든다

`parseUserThemes` 는 `{ code, params }` 를 돌려주고 `themes/load.ts` 가 i18n 으로 문구를 붙인다.
파서가 순수하게 남고(node 테스트), 경고가 ko/en 이중언어가 되며, **테스트가 문구 대신 code 를
검사**해 문구를 다듬어도 안 깨진다. `THEME_WARNING_CODES` 에 두 로케일 문구가 다 있는지도
테스트로 막는다(없으면 토스트에 `badColor` 같은 날코드가 뜼다).

## `revealItemInDir` 는 대상을 **부모에서 선택**한다

[테마 폴더 열기] 에 폴더 경로를 넘겼더니 한 단계 위(`com.readme.app`)가 열리고 `themes` 만
선택돼 있었다 — 버튼 이름과 동작이 어긋난다. 폴더 *안*을 열려면 **그 안의 파일**을 넘겨야 한다.
그래서 폴더가 비었을 때 안내 `README.md` 를 만들고 그것을 연다(덤으로 "이 폴더에 뭘 넣지?"가
그 자리에서 답이 된다). 이미 뭔가 들어 있으면 안 만든다 — 지운 사람에게 다시 들이밀지 않는다.

**실효과로 확인해야 보인다** — 토스트도 콘솔도 조용했다. `Shell.Application.Windows()` 로
열린 탐색기 창의 실제 경로를 읽어서야 알았다(v0.7.1 의 "결과를 본다"와 같은 방식).

## 사용자 CSS 에서 진짜 막아야 하는 것은 `</style>` 하나다

스타일 팩은 `<style>` 안에 문자열로 이어 붙는다. 값이 `</style>` 을 품으면 스타일 요소를
닫고 **임의 HTML** 이 된다 — 샌드박스에 스크립트가 없어 실행은 안 되지만 가짜 내용은 그린다.
대소문자·공백 변형(`< / STYLE >`)까지 잡아 CSS 를 통째로 버린다(`sanitizeThemeCss`).

나머지는 이미 막혀 있다: 스크립트는 `allow-scripts` 없음 + CSP `script-src 'self'`,
원격 요청은 CSP `img-src`(속성 선택자 유출·웹폰트·`@import` 전부), 앱 크롬은 주입 지점이
미리보기 문서 하나뿐이라 손 못 댄다. **CSS 파서는 넣지 않았다** — 큰 의존성이고 "검사했다"는
착각만 준다. 브라우저가 이미 모르는 규칙을 무시하고, 이상하면 내장 테마로 한 번 전환하면 된다.

## 배시 heredoc 은 백슬래시를 한 겹 먹는다

`<<'PY'` 로 따옴표를 씌워도 백슬래시가 한 겹 줄어든다(`\\` → `\`). 이번에 **세 번** 당했다 —

- JS 템플릿 리터럴의 `` `${dir}\\bar.css` `` 가 `` `${dir}\bar.css` `` 가 되고, `\b` 는
  백스페이스 문자라 파일 쓰기가 `os error 123`(잘못된 이름)으로 실패했다.
- 같은 방식으로 `` `${dir}\\README.md` `` 가 `\R`(= 그냥 `R`)이 되어 경로가 붙어 버렸다.
- 마크다운 트리의 줄 끝 `\` 가 파이썬 문자열에서 **줄 이음**이 되어 네 줄이 한 줄로 붙었다.
  (이 절 자체도 처음 쓸 때 같은 이유로 깨졌다 — 설명하는 버그에 본문이 당했다.)

**경로·정규식·이스케이프가 들어가는 편집은 Edit/Write 도구로** 하고, heredoc 은 백슬래시 없는
본문에만 쓴다. 한글 자체는 heredoc 으로도 안전하다 — 깨지는 건 PowerShell 쪽이다(위 절 참고).

## 알려진 TODO
- 아이콘: `src/src-tauri/icons/`의 기본 아이콘을 교체(`npm run tauri icon <path>`).
- Win10 오프라인 지원 시 `webviewInstallMode`를 `offlineInstaller`/`fixedRuntime`로(번들 증가). [deployment/webview2.md](../deployment/webview2.md).
