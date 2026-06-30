# 코드 서명

## 요약: 언제 인증서가 필요한가
| 시나리오 | 본인 코드서명 인증서 |
|---|---|
| **MSIX → Store** | **불필요** — Microsoft가 인증 후 재서명(서명하지 말고 업로드) |
| **Win32(EXE/MSI) → Store** | **필요** — Store가 재서명 안 함, 신뢰 CA 인증서로 직접 서명(자체 서명 불가) |
| **비-Store 직접 배포** (MSIX 사이드로드 / EXE) | 사실상 필요 — 신뢰 서명 없으면 설치 경고/SmartScreen |

> **Store에 MSIX로만 낸다면 유료 인증서가 필요 없다.** (이 프로젝트 권장 경로 → [microsoft-store.md](microsoft-store.md))

## 로컬 테스트용 자체 서명 (무료)
- MSIX를 개발 PC에서 설치해 보려면 자체 서명 후 해당 인증서를 신뢰 저장소에 추가(`New-SelfSignedCertificate` + `signtool`).
- **Store 업로드본에는 적용하지 않는다**(게시자 불일치 방지).

## 인증서가 필요한 경우의 종류 (Win32 / 직접 배포)
- **OV(Organization Validation)**: 비용 낮음. SmartScreen 평판은 누적 다운로드로 점차 형성.
- **EV(Extended Validation)**: 비용 높음(HSM/USB 토큰). SmartScreen 평판 **즉시** 우수.
- 서명 대상: NSIS(`*-setup.exe`)/MSI 및 내부 PE 파일. 타임스탬프 서버 지정(만료 후 유효성 유지).
- Tauri 연동: `bundle.windows`의 `certificateThumbprint`/`digestAlgorithm`/`timestampUrl` 또는 `signtool`. 인증서·암호는 CI 시크릿으로 관리(커밋 금지).

## TODO
- **배포 경로 확정**: Store-only(MSIX) → 인증서 불필요 / Win32·직접 배포 병행 → 인증서 발급(OV vs EV) 결정.
