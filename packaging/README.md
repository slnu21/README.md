# README.md 릴리스 · 패키징

제품명이 `README.md`다(마크다운 앱을 그 원형 파일명으로). 배포 3종 — **MSIX가 주(Microsoft Store)**, NSIS 인스톨러와 포터블 zip은 사이드 채널.

> 표시명 = `README.md` · 내부 exe = `md-reader.exe` · 산출물 파일 base = `README_*` (파일명엔 확장자 혼동 피하려 `.md` 제외).

## 전제
- `npx tauri build` 로 릴리스 exe가 먼저 빌드돼 있어야 함 (`src/src-tauri/target/release/md-reader.exe`).
- Windows SDK (makeappx.exe / signtool.exe) — VS 2026 + Win11 SDK.
- 산출물은 `packaging/build/` 에 생성(gitignore).

## 1) MSIX — 주 배포 (Microsoft Store)
```powershell
# Store 업로드용(미서명 — Microsoft가 재서명):
pwsh packaging/pack-msix.ps1
#   → packaging/build/README_0.1.0_x64.msix

# 로컬 설치·테스트용(자체 서명):
pwsh packaging/pack-msix.ps1 -Sign
#   → 안내되는 두 줄을 관리자 PowerShell에서 실행하면 설치됨.
```
- Tauri는 MSI/NSIS만 내므로 **빌드된 exe를 MSIX로 래핑**(makeappx). 매니페스트: `msix/AppxManifest.template.xml` (DisplayName=`README.md`, full-trust `runFullTrust`).
- **Store 제출 시** Partner Center에서 앱 이름 예약 후, 받은 값으로:
  ```powershell
  pwsh packaging/pack-msix.ps1 `
    -IdentityName "<Partner Center Identity Name>" `
    -Publisher   "CN=<Partner Center Publisher ID>" `
    -PublisherDisplay "<게시자 표시 이름>"
  ```
  생성된 미서명 `.msix`를 업로드(재서명은 Microsoft가 처리 → 코드서명 인증서 불필요).

## 2) NSIS 인스톨러
```powershell
cd src
npx tauri build --bundles nsis
#   → src/src-tauri/target/release/bundle/nsis/README.md_0.1.0_x64-setup.exe
```

## 3) 포터블 zip
```powershell
pwsh packaging/pack-zip.ps1
#   → packaging/build/README_0.1.0_x64_portable.zip  (README.exe + USAGE.txt, 무설치)
```

## 릴리스 전 체크(권장)
- [x] **CSP 하드닝** — `app.security.csp` 적용됨(원격 차단, `script-src 'self'`).
- [x] **THIRD-PARTY-NOTICES** — 생성됨(npm+cargo deps + 번들 폰트 OFL 전문). 신규 deps 추가 시 재생성. *(v0.6: `@codemirror/autocomplete`는 기존 transitive 포함 → 변화 없음.)*
- [x] 버전 = `tauri.conf.json`·`Cargo.toml`·`package.json` 동기화(`0.6.0`), 배포 준비 커밋 후 git 태그(`vX.Y.Z`).
- [x] `.md`/`.markdown` 파일 연결 — 매니페스트 `windows.fileTypeAssociation` 포함(재제출 후 발효).
