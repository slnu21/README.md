# 결(Gyeol) 릴리스 · 패키징

배포 방식 3종. **MSIX가 주(Microsoft Store)**, NSIS 인스톨러와 포터블 zip은 사이드 채널.

## 전제
- `npx tauri build` 로 릴리스 exe가 먼저 빌드돼 있어야 함 (`src/src-tauri/target/release/`).
- Windows SDK (makeappx.exe / signtool.exe) — VS 2026 + Win11 SDK로 이미 설치됨.
- 산출물은 `packaging/build/` 에 생성(gitignore 됨).

## 1) MSIX — 주 배포 (Microsoft Store)
```powershell
# Store 업로드용(미서명 — Microsoft가 재서명):
pwsh packaging/pack-msix.ps1

# 로컬 설치·테스트용(자체 서명):
pwsh packaging/pack-msix.ps1 -Sign
#  → 안내되는 두 줄을 관리자 PowerShell에서 실행하면 설치됨.
```
- Tauri는 MSI/NSIS만 내므로 **빌드된 exe를 MSIX로 래핑**(makeappx). 매니페스트: `msix/AppxManifest.template.xml`.
- Full-trust Win32 앱: `Windows.FullTrustApplication` + `runFullTrust`.
- **Store 제출 시** Partner Center에서 앱 이름 예약 후, 거기서 받은 값으로 실행:
  ```powershell
  pwsh packaging/pack-msix.ps1 `
    -IdentityName "<Partner Center Package/Identity Name>" `
    -Publisher   "CN=<Partner Center Publisher ID>" `
    -PublisherDisplay "<게시자 표시 이름>"
  ```
  생성된 미서명 `.msix`를 Partner Center에 업로드(재서명은 Microsoft가 처리 → 코드서명 인증서 불필요).

## 2) NSIS 인스톨러
```powershell
cd src
npx tauri build --bundles nsis
# → src/src-tauri/target/release/bundle/nsis/Gyeol_0.1.0_x64-setup.exe
```
(MSI도 필요하면 `--bundles nsis,msi`. MSI는 WiX 자동 다운로드 필요.)

## 3) 포터블 zip
```powershell
pwsh packaging/pack-zip.ps1
# → packaging/build/Gyeol_0.1.0_x64_portable.zip  (Gyeol.exe + README, 설치 불필요)
```

## 릴리스 전 체크(권장)
- [ ] **CSP 하드닝** (WBS 514) — 현재 `tauri.conf.json` `csp: null`. Store 배포 전 정책 적용.
- [ ] **THIRD-PARTY-NOTICES** (WBS 515) — 의존성 라이선스 고지 생성.
- [ ] 버전 = `tauri.conf.json`·`package.json` 동기화, git 태그(`v0.1.0`).
