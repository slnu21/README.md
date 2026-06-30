# Microsoft Store 제출

## 핵심: MSIX로 내면 코드 서명 인증서가 필요 없다
MSIX/APPX를 Store에 제출하면 **Microsoft가 인증(certification) 후 자기 인증서로 재서명**한다. 개발자가 신뢰 CA 코드 서명 인증서를 구매·관리할 필요가 없다. 오히려 본인 인증서로 서명하면 Partner Center 게시자 정보와 불일치해 문제가 될 수 있어, 보통 **서명하지 않은 채 업로드**한다.
→ 이것이 **권장 기본 경로**다(인증서 비용 0).

## 경로 비교
| | **MSIX → Store** (권장) | Win32 EXE/MSI → Store (대안) |
|---|---|---|
| 코드서명 인증서 | **불필요** (MS 재서명) | **필요** (유료 OV/EV, 자체서명 불가) |
| 추가 패키징 | MSIX 래핑 1단계 필요 | 불필요(Tauri 기본 산출물) |
| 설치/업데이트 UX | 깔끔(MSIX) | 설치 관리자 |
| 파일 접근 | `runFullTrust`로 유지 | 풀 트러스트(제한 없음) |

> 이전에 무서명 MSIX로 제출한 경험이 있다면 MSIX 경로가 자연스럽다.

## MSIX 경로 (권장)
### 준비
- Partner Center에서 앱 이름 예약 → **패키지 ID** 확보: Identity Name, `Publisher`(=`CN=...`), Publisher display name.
- MSIX 매니페스트의 Identity/Publisher를 이 값과 **정확히 일치**시킨다(불일치 시 인증 실패).
- 데스크톱(풀 트러스트) 앱이므로 매니페스트에 **`runFullTrust`** capability 선언 → 임의 로컬 파일 접근 유지(데스크톱 앱엔 관례적 승인). 폴더 무인 스캔까지 필요하면 `broadFileSystemAccess` 추가.

### Tauri → MSIX 패키징 (추가 단계)
Tauri 기본 번들러는 MSI/NSIS만 만들고 **MSIX는 만들지 않는다.** 한 단계 추가:
- **옵션 A — MSIX Packaging Tool**(무료, MS): 빌드 산출물을 GUI/CLI로 MSIX 래핑.
- **옵션 B — Windows SDK `makeappx`**: `AppxManifest.xml` 작성 후 Tauri 빌드 출력 폴더를 패키징(스크립트화 용이, CI 친화).
- 로컬 설치/테스트엔 *무료 자체 서명* 임시 인증서로 서명해 개발 PC 신뢰 저장소에 추가. **Store 업로드본은 서명하지 않는다.**

### 제출
1. `cd src && npm run tauri build` → 실행 파일/출력 확보.
2. (A 또는 B)로 **MSIX 생성** (매니페스트 = Partner Center ID, `runFullTrust`).
3. Partner Center 업로드(`.msix`/`.msixupload`) → 인증 → **Microsoft 재서명** → 게시.

## 대안: Win32(EXE/MSI) 직접 제출
- Tauri 기본 산출물을 그대로 제출 → **추가 패키징 불필요**.
- 단, Store는 EXE/MSI를 **재서명하지 않는다** → 개발자가 **신뢰 CA 체인 인증서로 직접 Authenticode 서명** 필수(자체 서명 불가). 무인 설치 스위치(MSI `/qn`, NSIS `/S`)·CDN HTTPS URL 필요. → [code-signing.md](code-signing.md)
- **비-Store 직접 배포**(웹 다운로드 등)를 겸할 때 유용(이 경우 서명은 SmartScreen 평판 때문에 사실상 필요).

## 스토어 리스팅 자료
- 스크린샷·아이콘·설명 텍스트는 `docs/deployment/assets/`.
